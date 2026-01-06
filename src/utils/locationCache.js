/**
 * Location Caching Utility
 * 
 * Provides high-performance in-memory caching for location hierarchies.
 * Builds Maps for O(1) lookups of:
 * - District → Municipalities
 * - Province → Districts
 * - Province → All Descendant IDs (for cascade selection)
 * 
 * Thread-safe and designed for single-process Node.js deployments.
 * For distributed systems, consider using Redis.
 * 
 * @module locationCache
 */

let cacheState = {
  initialized: false,
  buildTime: null,
  totalLocations: 0,
  stats: {
    districtCount: 0,
    provinceCount: 0,
    municipalityCount: 0,
    hits: 0,
    misses: 0
  }
};

// Core cache maps
const districtChildrenMap = new Map(); // districtId -> [municipalityIds...]
const provinceDistrictsMap = new Map(); // provinceId -> [districtIds...]
const provinceAllIdsMap = new Map(); // provinceId -> [provinceId, districtIds..., municipalityIds...]
const locationById = new Map(); // locationId -> location object (for reference lookups)

/**
 * Initialize cache from database
 * Fetches all locations and builds optimized lookup structures
 * 
 * @async
 * @param {Object} Location - Mongoose Location model
 * @param {Object} options - Configuration options
 * @param {Boolean} options.includeInactive - Whether to include inactive locations (default: false)
 * @param {Boolean} options.force - Force rebuild even if already initialized (default: false)
 * @returns {Promise<Object>} Cache state and statistics
 * @throws {Error} If Location model is not provided or DB query fails
 */
async function initCache(Location, options = {}) {
  const { includeInactive = false, force = false } = options;

  // Prevent redundant initialization
  if (cacheState.initialized && !force) {
    console.log('ℹ️  Location cache already initialized, skipping rebuild');
    return getCacheStatus();
  }

  try {
    const startTime = Date.now();
    
    console.log('🔄 Building location cache...');

    // Query all locations
    const query = {};
    if (!includeInactive) {
      query.isActive = true;
    }

    const locations = await Location.find(query).lean(); // Use lean() for faster queries

    if (!locations || locations.length === 0) {
      console.warn('⚠️  No locations found in database');
      cacheState.initialized = true;
      cacheState.buildTime = Date.now();
      cacheState.totalLocations = 0;
      return getCacheStatus();
    }

    // Clear previous caches
    districtChildrenMap.clear();
    provinceDistrictsMap.clear();
    provinceAllIdsMap.clear();
    locationById.clear();
    cacheState.stats = {
      districtCount: 0,
      provinceCount: 0,
      municipalityCount: 0,
      hits: 0,
      misses: 0
    };

    // Index all locations by ID for quick reference
    locations.forEach((loc) => {
      locationById.set(loc._id.toString(), loc);
    });

    // Count location types
    const typeMap = new Map();
    locations.forEach((loc) => {
      const key = loc.type;
      typeMap.set(key, (typeMap.get(key) || 0) + 1);
    });

    cacheState.stats.districtCount = typeMap.get('district') || 0;
    cacheState.stats.provinceCount = typeMap.get('province') || 0;
    cacheState.stats.municipalityCount = typeMap.get('municipality') || 0;

    // ========== BUILD LOOKUP MAPS ==========

    // 1. Build district -> municipalities map
    locations.forEach((loc) => {
      if (loc.type === 'district' || (loc.type === 'city' && loc.metadata?.isCity)) {
        const munIds = locations
          .filter((m) => {
            if (m.type !== 'municipality') return false;
            const parentId = loc.parent ? loc.parent.toString() : loc.parent;
            const mParentId = m.parent ? m.parent.toString() : m.parent;
            return mParentId === loc._id.toString();
          })
          .map((m) => m._id.toString());
        
        districtChildrenMap.set(loc._id.toString(), munIds);
      }
    });

    // 2. Build province -> districts map and province -> all ids map
    locations.forEach((loc) => {
      if (loc.type === 'province') {
        const provinceId = loc._id.toString();
        
        // Find districts that belong to this province
        const districtIds = locations
          .filter((d) => {
            if (d.type === 'district' || (d.type === 'city' && d.metadata?.isCity)) {
              const dParentId = d.parent ? d.parent.toString() : d.parent;
              return dParentId === provinceId;
            }
            return false;
          })
          .map((d) => d._id.toString());
        
        provinceDistrictsMap.set(provinceId, districtIds);

        // Build all IDs array: province + districts + municipalities under those districts
        const allIds = [provinceId];
        districtIds.forEach((districtId) => {
          allIds.push(districtId);
          const munIds = districtChildrenMap.get(districtId) || [];
          allIds.push(...munIds);
        });
        
        provinceAllIdsMap.set(provinceId, allIds);
      }
    });

    // ========== LOG CACHE STATISTICS ==========
    const buildDuration = Date.now() - startTime;
    cacheState.initialized = true;
    cacheState.buildTime = new Date().toISOString();
    cacheState.totalLocations = locations.length;

    console.log(`✅ Location cache built successfully in ${buildDuration}ms`);
    console.log(`   - Total locations: ${cacheState.totalLocations}`);
    console.log(`   - Provinces: ${cacheState.stats.provinceCount}`);
    console.log(`   - Districts: ${cacheState.stats.districtCount}`);
    console.log(`   - Municipalities: ${cacheState.stats.municipalityCount}`);
    console.log(`   - Province maps: ${provinceDistrictsMap.size}`);
    console.log(`   - District maps: ${districtChildrenMap.size}`);

    return getCacheStatus();
  } catch (error) {
    console.error('❌ Error building location cache:', error.message);
    cacheState.initialized = false;
    throw error;
  }
}

/**
 * Get municipalities for a district (O(1) lookup)
 * 
 * @param {String} districtId - The district ID
 * @param {Object} options - Configuration options
 * @param {Boolean} options.returnObjects - Return full location objects instead of IDs (default: false)
 * @returns {Array} Array of municipality IDs or objects
 */
function getMunicipalitiesByDistrict(districtId, options = {}) {
  const { returnObjects = false } = options;
  const districtIdStr = districtId.toString();
  
  if (!districtChildrenMap.has(districtIdStr)) {
    cacheState.stats.misses++;
    return [];
  }

  cacheState.stats.hits++;
  const munIds = districtChildrenMap.get(districtIdStr) || [];

  if (returnObjects) {
    return munIds.map((id) => locationById.get(id)).filter(Boolean);
  }

  return munIds;
}

/**
 * Get districts for a province (O(1) lookup)
 * 
 * @param {String} provinceId - The province ID
 * @param {Object} options - Configuration options
 * @param {Boolean} options.returnObjects - Return full location objects instead of IDs (default: false)
 * @returns {Array} Array of district IDs or objects
 */
function getDistrictsByProvince(provinceId, options = {}) {
  const { returnObjects = false } = options;
  const provinceIdStr = provinceId.toString();

  if (!provinceDistrictsMap.has(provinceIdStr)) {
    cacheState.stats.misses++;
    return [];
  }

  cacheState.stats.hits++;
  const districtIds = provinceDistrictsMap.get(provinceIdStr) || [];

  if (returnObjects) {
    return districtIds.map((id) => locationById.get(id)).filter(Boolean);
  }

  return districtIds;
}

/**
 * Get all descendant IDs for a province (for cascade selection)
 * Includes province itself + all districts + all municipalities
 * O(1) lookup, useful for UI selection cascading
 * 
 * @param {String} provinceId - The province ID
 * @returns {Array} Array of all IDs (province + districts + municipalities)
 */
function getProvinceAllIds(provinceId) {
  const provinceIdStr = provinceId.toString();

  if (!provinceAllIdsMap.has(provinceIdStr)) {
    cacheState.stats.misses++;
    return [];
  }

  cacheState.stats.hits++;
  return provinceAllIdsMap.get(provinceIdStr) || [];
}

/**
 * Get a location object by ID (for metadata lookups)
 * 
 * @param {String} locationId - The location ID
 * @returns {Object|null} Location object or null if not found
 */
function getLocationById(locationId) {
  const locationIdStr = locationId.toString();
  
  if (!locationById.has(locationIdStr)) {
    cacheState.stats.misses++;
    return null;
  }

  cacheState.stats.hits++;
  return locationById.get(locationIdStr);
}

/**
 * Check if cache is ready and initialized
 * 
 * @returns {Boolean} True if cache is initialized
 */
function isCacheReady() {
  return cacheState.initialized;
}

/**
 * Clear cache (for manual invalidation or testing)
 */
function clearCache() {
  districtChildrenMap.clear();
  provinceDistrictsMap.clear();
  provinceAllIdsMap.clear();
  locationById.clear();

  cacheState = {
    initialized: false,
    buildTime: null,
    totalLocations: 0,
    stats: {
      districtCount: 0,
      provinceCount: 0,
      municipalityCount: 0,
      hits: 0,
      misses: 0
    }
  };

  console.log('🗑️  Location cache cleared');
}

/**
 * Get cache status and statistics
 * Useful for monitoring and debugging
 * 
 * @returns {Object} Cache state, statistics, and performance metrics
 */
function getCacheStatus() {
  const hitRate = cacheState.stats.hits + cacheState.stats.misses > 0
    ? ((cacheState.stats.hits / (cacheState.stats.hits + cacheState.stats.misses)) * 100).toFixed(2)
    : 0;

  return {
    initialized: cacheState.initialized,
    buildTime: cacheState.buildTime,
    totalLocations: cacheState.totalLocations,
    mapSizes: {
      districtChildren: districtChildrenMap.size,
      provinceDistricts: provinceDistrictsMap.size,
      provinceAllIds: provinceAllIdsMap.size,
      locationObjects: locationById.size
    },
    statistics: {
      ...cacheState.stats,
      hitRate: `${hitRate}%`
    }
  };
}

/**
 * Rebuild cache (useful after location updates via admin endpoints)
 * 
 * @async
 * @param {Object} Location - Mongoose Location model
 * @param {Object} options - Configuration options (see initCache)
 * @returns {Promise<Object>} Updated cache status
 */
async function rebuildCache(Location, options = {}) {
  console.log('🔄 Rebuilding location cache...');
  return initCache(Location, { ...options, force: true });
}

module.exports = {
  initCache,
  getMunicipalitiesByDistrict,
  getDistrictsByProvince,
  getProvinceAllIds,
  getLocationById,
  isCacheReady,
  clearCache,
  getCacheStatus,
  rebuildCache
};
