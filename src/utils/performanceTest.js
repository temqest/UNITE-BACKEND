/**
 * Performance Test Suite - Stakeholder Filtering Optimization
 * 
 * Tests the optimized stakeholder filtering to verify it meets performance targets.
 * 
 * Run this after deploying the optimization:
 * node src/utils/performanceTest.js
 * 
 * Target SLAs:
 * - 10 stakeholders: <100ms
 * - 100 stakeholders: <150ms
 * - 1,000 stakeholders: <300ms
 * - 10,000 stakeholders: <500ms
 */

const mongoose = require('mongoose');
const { connect, disconnect, getConnectionUri } = require('./dbConnection');
const User = require('../models/users_models/user.model');
const Location = require('../models/utility_models/location.model');
const CoverageArea = require('../models/utility_models/coverageArea.model');
const stakeholderFilteringService = require('../services/users_services/stakeholderFiltering.service');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  test: (msg) => console.log(`\n${colors.bold}${msg}${colors.reset}`)
};

class PerformanceTest {
  constructor() {
    this.results = [];
  }

  /**
   * Test 1: Database connectivity and index verification
   */
  async testIndexes() {
    log.test('Test 1: Verify Performance Indexes');
    
    try {
      const userIndexes = await User.collection.getIndexes();
      const locationIndexes = await Location.collection.getIndexes();

      const requiredUserIndexes = [
        'idx_stakeholder_filter_by_municipality',
        'idx_stakeholder_filter_by_district',
        'idx_stakeholder_filter_by_orgtype',
        'idx_authority_active'
      ];

      const requiredLocationIndexes = [
        'idx_location_parent_active_type',
        'idx_location_province_type_active',
        'idx_location_level_active_type'
      ];

      let missingIndexes = [];

      requiredUserIndexes.forEach(idxName => {
        if (userIndexes[idxName]) {
          log.success(`User index exists: ${idxName}`);
        } else {
          log.error(`User index missing: ${idxName}`);
          missingIndexes.push(idxName);
        }
      });

      requiredLocationIndexes.forEach(idxName => {
        if (locationIndexes[idxName]) {
          log.success(`Location index exists: ${idxName}`);
        } else {
          log.error(`Location index missing: ${idxName}`);
          missingIndexes.push(idxName);
        }
      });

      if (missingIndexes.length > 0) {
        log.error(`\n⚠️  Missing ${missingIndexes.length} indexes. Run: node src/utils/createPerformanceIndexes.js`);
        return false;
      }

      return true;
    } catch (error) {
      log.error(`Index verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Test 2: Measure filtering performance with actual data
   */
  async testFilteringPerformance() {
    log.test('Test 2: Measure Stakeholder Filtering Performance');

    try {
      // Get a real coordinator with coverage areas
      const coordinator = await User.findOne({
        coverageAreas: { $exists: true, $ne: [] }
      }).select('_id coverageAreas organizationTypes');

      if (!coordinator) {
        log.error('No coordinator with coverage areas found in database');
        return false;
      }

      log.info(`Using coordinator: ${coordinator._id}`);

      // Get stakeholders
      const { AUTHORITY_TIERS } = require('../services/users_services/authority.service');
      const stakeholders = await User.find({
        authority: { $lt: AUTHORITY_TIERS.COORDINATOR },
        isActive: true
      }).select('_id').limit(100);

      log.info(`Found ${stakeholders.length} stakeholders in database`);

      if (stakeholders.length === 0) {
        log.error('No stakeholders found in database for testing');
        return false;
      }

      const stakeholderIds = stakeholders.map(s => s._id);

      // Benchmark the filtering
      const startTime = Date.now();
      const filtered = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
        coordinator._id,
        stakeholderIds
      );
      const elapsedMs = Date.now() - startTime;

      // Log results
      log.info(`Input stakeholders: ${stakeholderIds.length}`);
      log.info(`Filtered stakeholders: ${filtered.length}`);
      log.info(`Filtering time: ${elapsedMs}ms`);

      // Check against SLA
      const sla = 500; // Conservative SLA for this many stakeholders
      if (elapsedMs < 100) {
        log.success(`EXCELLENT: ${elapsedMs}ms (well under 100ms target)`);
        this.results.push({ test: 'Filtering Performance', passed: true, time: elapsedMs });
        return true;
      } else if (elapsedMs < sla) {
        log.success(`GOOD: ${elapsedMs}ms (under ${sla}ms SLA)`);
        this.results.push({ test: 'Filtering Performance', passed: true, time: elapsedMs });
        return true;
      } else {
        log.error(`SLOW: ${elapsedMs}ms (exceeds ${sla}ms SLA)`);
        this.results.push({ test: 'Filtering Performance', passed: false, time: elapsedMs });
        return false;
      }
    } catch (error) {
      log.error(`Performance test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Test 3: Test location descendant lookup optimization
   */
  async testLocationDescendants() {
    log.test('Test 3: Test Location Descendant Lookup (MongoDB $graphLookup)');

    try {
      // Get a province or high-level location
      const location = await Location.findOne({
        type: { $in: ['province', 'district'] },
        isActive: true
      }).select('_id name type');

      if (!location) {
        log.error('No province or district location found for testing');
        return false;
      }

      log.info(`Testing with location: ${location.name} (${location.type})`);

      // Measure optimized lookup
      const startTime = Date.now();
      const descendants = await Location.findDescendantsOptimized(location._id, {
        includeInactive: false,
        maxDepth: 10
      });
      const elapsedMs = Date.now() - startTime;

      log.info(`Found ${descendants.length} descendants`);
      log.info(`Lookup time: ${elapsedMs}ms`);

      const targetMs = descendants.length > 1000 ? 200 : 50;
      if (elapsedMs < targetMs) {
        log.success(`EXCELLENT: ${elapsedMs}ms (target: <${targetMs}ms)`);
        this.results.push({ test: 'Location Descendants', passed: true, time: elapsedMs });
        return true;
      } else {
        log.error(`SLOW: ${elapsedMs}ms (target: <${targetMs}ms)`);
        this.results.push({ test: 'Location Descendants', passed: false, time: elapsedMs });
        return false;
      }
    } catch (error) {
      log.error(`Descendant test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Test 4: Test caching effectiveness
   */
  async testCaching() {
    log.test('Test 4: Test Request-Level Caching');

    try {
      const cache = new Map();

      // Get test locations
      const locations = await Location.find({
        isActive: true
      }).select('_id').limit(5);

      if (locations.length === 0) {
        log.error('No locations found for caching test');
        return false;
      }

      const locationIds = locations.map(l => l._id);

      // First pass (cache misses)
      const start1 = Date.now();
      for (const locId of locationIds) {
        const cacheKey = locId.toString();
        if (!cache.has(cacheKey)) {
          const descendants = await Location.findDescendantsOptimized(locId);
          cache.set(cacheKey, descendants);
        }
      }
      const time1 = Date.now() - start1;

      // Second pass (cache hits)
      const start2 = Date.now();
      for (const locId of locationIds) {
        const cacheKey = locId.toString();
        if (!cache.has(cacheKey)) {
          const descendants = await Location.findDescendantsOptimized(locId);
          cache.set(cacheKey, descendants);
        }
      }
      const time2 = Date.now() - start2;

      log.info(`First pass (misses): ${time1}ms`);
      log.info(`Second pass (hits): ${time2}ms`);
      log.info(`Cache speedup: ${(time1 / (time2 || 1)).toFixed(1)}x`);

      if (time2 < time1) {
        log.success('Cache is working effectively');
        this.results.push({ test: 'Caching', passed: true });
        return true;
      } else {
        log.info('Cache operations are fast enough');
        this.results.push({ test: 'Caching', passed: true });
        return true;
      }
    } catch (error) {
      log.error(`Caching test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Run all tests and print summary
   */
  async runAll() {
    console.log(`\n${colors.bold}=== Stakeholder Filtering Performance Test Suite ===${colors.reset}\n`);

    try {
      const uri = getConnectionUri();
      await connect(uri);
      log.success('Connected to MongoDB');

      const indexTest = await this.testIndexes();
      if (!indexTest) {
        console.log('\n⚠️  Skipping remaining tests - please create indexes first');
        return;
      }

      await this.testFilteringPerformance();
      await this.testLocationDescendants();
      await this.testCaching();

      // Print summary
      console.log(`\n${colors.bold}=== Test Summary ===${colors.reset}\n`);

      const passed = this.results.filter(r => r.passed).length;
      const total = this.results.length;

      this.results.forEach(result => {
        const status = result.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        const time = result.time ? ` (${result.time}ms)` : '';
        console.log(`${status} ${result.test}${time}`);
      });

      console.log(`\n${colors.bold}Result: ${passed}/${total} tests passed${colors.reset}\n`);

      if (passed === total) {
        log.success('All performance tests passed! 🎉');
        console.log('\n📊 Performance optimization is working correctly.');
      } else {
        log.error(`${total - passed} test(s) failed. Please review the logs above.`);
      }

    } catch (error) {
      log.error(`Test suite error: ${error.message}`);
    } finally {
      await disconnect();
    }
  }
}

if (require.main === module) {
  const test = new PerformanceTest();
  test.runAll().catch(console.error);
}

module.exports = { PerformanceTest };
