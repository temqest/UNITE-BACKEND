const { District, Coordinator, Event } = require('../../models/index');

class DistrictService {
  /**
   * Generate unique district ID
   * @returns {string} Unique district ID
   */
  generateDistrictID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `DIST_${timestamp}_${random}`;
  }

  /**
   * Create a new district
   * @param {Object} districtData 
   * @returns {Object} Created district
   */
  async createDistrict(districtData) {
    try {
      // Check if district ID already exists
      if (districtData.District_ID) {
        const existing = await District.findOne({ District_ID: districtData.District_ID });
        if (existing) {
          throw new Error('District ID already exists');
        }
      } else {
        // Generate ID if not provided
        districtData.District_ID = this.generateDistrictID();
      }

      // Check for duplicate name in same region
      const duplicate = await District.findOne({
        District_Name: districtData.District_Name,
        Region: districtData.Region
      });

      if (duplicate) {
        throw new Error('District with this name already exists in this region');
      }

      const district = new District({
        District_ID: districtData.District_ID,
        District_Name: districtData.District_Name,
        District_City: districtData.District_City,
        Region: districtData.Region
      });

      const savedDistrict = await district.save();

      return {
        success: true,
        message: 'District created successfully',
        district: savedDistrict.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to create district: ${error.message}`);
    }
  }

  /**
   * Get district by ID
   * @param {string} districtId 
   * @returns {Object} District data
   */
  async getDistrictById(districtId) {
    try {
      const district = await District.findOne({ District_ID: districtId });

      if (!district) {
        throw new Error('District not found');
      }

      // Get coordinator count for this district
      const coordinatorCount = await Coordinator.countDocuments({ District_ID: districtId });

      return {
        success: true,
        district: {
          ...district.toObject(),
          coordinator_count: coordinatorCount
        }
      };

    } catch (error) {
      throw new Error(`Failed to get district: ${error.message}`);
    }
  }

  /**
   * Get all districts with filtering and pagination
   * @param {Object} filters 
   * @param {Object} options 
   * @returns {Object} List of districts
   */
  async getAllDistricts(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'District_Name',
        sortOrder = 'asc'
      } = options;

      const skip = (page - 1) * limit;

      // Build query
      const query = {};

      if (filters.region) {
        query.Region = { $regex: filters.region, $options: 'i' };
      }

      if (filters.city) {
        query.District_City = { $regex: filters.city, $options: 'i' };
      }

      if (filters.search) {
        query.$or = [
          { District_Name: { $regex: filters.search, $options: 'i' } },
          { District_City: { $regex: filters.search, $options: 'i' } },
          { Region: { $regex: filters.search, $options: 'i' } }
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const districts = await District.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort);

      const total = await District.countDocuments(query);

      // Enrich districts with coordinator counts
      const enrichedDistricts = await Promise.all(
        districts.map(async (district) => {
          const coordinatorCount = await Coordinator.countDocuments({ 
            District_ID: district.District_ID 
          });

          return {
            ...district.toObject(),
            coordinator_count: coordinatorCount
          };
        })
      );

      return {
        success: true,
        districts: enrichedDistricts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: filters
      };

    } catch (error) {
      throw new Error(`Failed to get districts: ${error.message}`);
    }
  }

  /**
   * Get districts grouped by region
   * @returns {Object} Districts grouped by region
   */
  async getDistrictsByRegion() {
    try {
      const districts = await District.find().sort({ Region: 1, District_Name: 1 });

      const grouped = {};
      for (const district of districts) {
        if (!grouped[district.Region]) {
          grouped[district.Region] = [];
        }

        const coordinatorCount = await Coordinator.countDocuments({ 
          District_ID: district.District_ID 
        });

        grouped[district.Region].push({
          ...district.toObject(),
          coordinator_count: coordinatorCount
        });
      }

      // Get statistics
      const stats = {
        total_regions: Object.keys(grouped).length,
        total_districts: districts.length,
        districts_per_region: {}
      };

      Object.keys(grouped).forEach(region => {
        stats.districts_per_region[region] = grouped[region].length;
      });

      return {
        success: true,
        districts: grouped,
        statistics: stats
      };

    } catch (error) {
      throw new Error(`Failed to get districts by region: ${error.message}`);
    }
  }

  /**
   * Update district
   * @param {string} districtId 
   * @param {Object} updateData 
   * @returns {Object} Updated district
   */
  async updateDistrict(districtId, updateData) {
    try {
      const district = await District.findOne({ District_ID: districtId });

      if (!district) {
        throw new Error('District not found');
      }

      // Check for duplicate name if name is being updated
      if (updateData.District_Name || updateData.Region) {
        const name = updateData.District_Name || district.District_Name;
        const region = updateData.Region || district.Region;

        const duplicate = await District.findOne({
          District_Name: name,
          Region: region,
          District_ID: { $ne: districtId }
        });

        if (duplicate) {
          throw new Error('District with this name already exists in this region');
        }
      }

      // Update fields
      if (updateData.District_Name) district.District_Name = updateData.District_Name;
      if (updateData.District_City) district.District_City = updateData.District_City;
      if (updateData.Region) district.Region = updateData.Region;

      await district.save();

      return {
        success: true,
        message: 'District updated successfully',
        district: district.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to update district: ${error.message}`);
    }
  }

  /**
   * Delete district
   * Checks if district has coordinators before deletion
   * @param {string} districtId 
   * @returns {Object} Success message
   */
  async deleteDistrict(districtId) {
    try {
      const district = await District.findOne({ District_ID: districtId });

      if (!district) {
        throw new Error('District not found');
      }

      // Check if district has coordinators
      const coordinatorCount = await Coordinator.countDocuments({ District_ID: districtId });

      if (coordinatorCount > 0) {
        throw new Error(
          `Cannot delete district. District has ${coordinatorCount} coordinator(s) assigned. ` +
          'Please reassign coordinators before deleting.'
        );
      }

      // Check if district has events (through coordinators)
      // Note: This is a safeguard, but events are tied to coordinators, not directly to districts
      
      await District.deleteOne({ District_ID: districtId });

      return {
        success: true,
        message: 'District deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete district: ${error.message}`);
    }
  }

  /**
   * Search districts
   * @param {string} searchTerm 
   * @param {Object} options 
   * @returns {Object} Search results
   */
  async searchDistricts(searchTerm, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'District_Name',
        sortOrder = 'asc'
      } = options;

      const skip = (page - 1) * limit;

      const query = {
        $or: [
          { District_Name: { $regex: searchTerm, $options: 'i' } },
          { District_City: { $regex: searchTerm, $options: 'i' } },
          { Region: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const districts = await District.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort);

      const total = await District.countDocuments(query);

      // Enrich with coordinator counts
      const enrichedDistricts = await Promise.all(
        districts.map(async (district) => {
          const coordinatorCount = await Coordinator.countDocuments({ 
            District_ID: district.District_ID 
          });

          return {
            ...district.toObject(),
            coordinator_count: coordinatorCount
          };
        })
      );

      return {
        success: true,
        searchTerm,
        districts: enrichedDistricts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to search districts: ${error.message}`);
    }
  }

  /**
   * Get district statistics
   * @returns {Object} District statistics
   */
  async getDistrictStatistics() {
    try {
      const totalDistricts = await District.countDocuments();
      const totalRegions = await District.distinct('Region').then(regions => regions.length);
      const totalCoordinators = await Coordinator.countDocuments();

      // Districts with coordinators
      const districtsWithCoordinators = await District.find().then(async (districts) => {
        let count = 0;
        for (const district of districts) {
          const coordCount = await Coordinator.countDocuments({ 
            District_ID: district.District_ID 
          });
          if (coordCount > 0) count++;
        }
        return count;
      });

      // Average coordinators per district
      const avgCoordinatorsPerDistrict = totalDistricts > 0 
        ? Math.round((totalCoordinators / totalDistricts) * 10) / 10 
        : 0;

      // Region distribution
      const regions = await District.aggregate([
        {
          $group: {
            _id: '$Region',
            districtCount: { $sum: 1 }
          }
        },
        { $sort: { districtCount: -1 } }
      ]);

      return {
        success: true,
        statistics: {
          total_districts: totalDistricts,
          total_regions: totalRegions,
          total_coordinators: totalCoordinators,
          districts_with_coordinators: districtsWithCoordinators,
          districts_without_coordinators: totalDistricts - districtsWithCoordinators,
          avg_coordinators_per_district: avgCoordinatorsPerDistrict,
          region_distribution: regions.map(r => ({
            region: r._id,
            district_count: r.districtCount
          }))
        }
      };

    } catch (error) {
      throw new Error(`Failed to get district statistics: ${error.message}`);
    }
  }

  /**
   * Check if district exists
   * @param {string} districtId 
   * @returns {boolean} True if exists
   */
  async districtExists(districtId) {
    try {
      const district = await District.findOne({ District_ID: districtId });
      return !!district;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new DistrictService();

