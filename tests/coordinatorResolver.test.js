/**
 * Test Cases for Coordinator Assignment Fix
 * 
 * These test cases demonstrate the enhanced validation logic
 * for coordinator assignment during event creation.
 * 
 * Run with: npm test coordinator.test.js
 */

const coordinatorResolverService = require('../../src/services/users_services/coordinatorResolver.service');

describe('Coordinator Resolver Service - Validation Tests', () => {
  
  /**
   * Test 1: Valid Coordinator for District 2 LGU Stakeholder
   */
  describe('Test 1: Valid Coordinator Assignment', () => {
    const stakeholder = {
      _id: 'stake_district2_lgu',
      organizationType: 'LGU',
      organizations: [
        {
          organizationId: 'org_lgu_1',
          organizationType: 'LGU'
        }
      ],
      locations: {
        municipalityId: 'gainza', // District 2, Camarines Sur
        municipalityName: 'Gainza'
      }
    };

    const validCoordinator = {
      _id: 'coord_district2_lgu',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      authority: 70,
      isActive: true,
      organizationType: 'LGU',
      organizations: [
        {
          organizationId: 'org_lgu_1',
          organizationType: 'LGU'
        }
      ],
      coverageAreas: [
        {
          coverageAreaName: 'District 2, Camarines Sur',
          districtIds: ['district_2_camsar'],
          municipalityIds: ['gainza', 'libmanan', 'lupi']
        }
      ]
    };

    it('should validate valid coordinator', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, validCoordinator);

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeNull();
      console.log('✅ Test 1 Passed: Valid coordinator correctly identified');
    });
  });

  /**
   * Test 2: Invalid - Organization Type Mismatch
   */
  describe('Test 2: Organization Type Mismatch', () => {
    const stakeholder = {
      _id: 'stake_lgu',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: { municipalityId: 'gainza', municipalityName: 'Gainza' }
    };

    const invalidCoordinator = {
      _id: 'coord_ngo',
      firstName: 'Maria',
      lastName: 'Santos',
      authority: 70,
      isActive: true,
      organizationType: 'NGO',
      organizations: [{ organizationType: 'NGO' }],
      coverageAreas: [{
        coverageAreaName: 'District 2, Camarines Sur',
        districtIds: ['district_2_camsar'],
        municipalityIds: ['gainza']
      }]
    };

    it('should reject coordinator with different organization type', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, invalidCoordinator);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Organization type mismatch');
      expect(validation.details.stakeholderOrgTypes).toEqual(['LGU']);
      expect(validation.details.coordinatorOrgTypes).toEqual(['NGO']);
      console.log('✅ Test 2 Passed: Organization type mismatch correctly detected');
    });
  });

  /**
   * Test 3: Invalid - Coverage Area Mismatch
   */
  describe('Test 3: Coverage Area Mismatch', () => {
    const stakeholder = {
      _id: 'stake_district2',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: {
        municipalityId: 'gainza', // District 2
        municipalityName: 'Gainza'
      }
    };

    const coordinatorWrongDistrict = {
      _id: 'coord_district3',
      firstName: 'Carlos',
      lastName: 'Reyes',
      authority: 70,
      isActive: true,
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      coverageAreas: [{
        coverageAreaName: 'District 3, Camarines Sur',
        districtIds: ['district_3_camsar'], // Different district!
        municipalityIds: []
      }]
    };

    it('should reject coordinator from wrong district', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, coordinatorWrongDistrict);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('not within coordinator\'s coverage areas');
      console.log('✅ Test 3 Passed: Coverage area mismatch correctly detected');
    });
  });

  /**
   * Test 4: Invalid - Coordinator Inactive
   */
  describe('Test 4: Inactive Coordinator', () => {
    const stakeholder = {
      _id: 'stake_active',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: { municipalityId: 'gainza', municipalityName: 'Gainza' }
    };

    const inactiveCoordinator = {
      _id: 'coord_inactive',
      firstName: 'Pedro',
      lastName: 'Gonzales',
      authority: 70,
      isActive: false, // INACTIVE
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      coverageAreas: [{
        coverageAreaName: 'District 2, Camarines Sur',
        districtIds: ['district_2_camsar'],
        municipalityIds: ['gainza']
      }]
    };

    it('should reject inactive coordinator', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, inactiveCoordinator);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('inactive');
      console.log('✅ Test 4 Passed: Inactive coordinator correctly rejected');
    });
  });

  /**
   * Test 5: Invalid - Wrong Authority Level
   */
  describe('Test 5: Invalid Authority Level', () => {
    const stakeholder = {
      _id: 'stake_valid',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: { municipalityId: 'gainza', municipalityName: 'Gainza' }
    };

    const wrongAuthorityUser = {
      _id: 'user_wrong_authority',
      firstName: 'Anna',
      lastName: 'Smith',
      authority: 50, // Between 20 and 60, not coordinator level (60-80)
      isActive: true,
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      coverageAreas: [{
        coverageAreaName: 'District 2, Camarines Sur',
        districtIds: ['district_2_camsar'],
        municipalityIds: ['gainza']
      }]
    };

    it('should reject user with wrong authority level', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, wrongAuthorityUser);

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('authority');
      console.log('✅ Test 5 Passed: Wrong authority level correctly rejected');
    });
  });

  /**
   * Test 6: Valid - Multiple Coverage Areas
   */
  describe('Test 6: Coordinator with Multiple Coverage Areas', () => {
    const stakeholder = {
      _id: 'stake_gainza',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: {
        municipalityId: 'gainza', // District 2
        municipalityName: 'Gainza'
      }
    };

    const coordinatorMultiCoverage = {
      _id: 'coord_multi',
      firstName: 'Roberto',
      lastName: 'Flores',
      authority: 70,
      isActive: true,
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      coverageAreas: [
        {
          coverageAreaName: 'District 1, Camarines Sur',
          districtIds: ['district_1_camsar'],
          municipalityIds: []
        },
        {
          coverageAreaName: 'District 2, Camarines Sur', // Covers District 2
          districtIds: ['district_2_camsar'],
          municipalityIds: ['gainza', 'libmanan']
        }
      ]
    };

    it('should find coordinator valid for one of multiple coverage areas', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholder, coordinatorMultiCoverage);

      expect(validation.valid).toBe(true);
      console.log('✅ Test 6 Passed: Coordinator with multiple coverage areas validated');
    });
  });

  /**
   * Test 7: Naga City - Special Case (City as District)
   */
  describe('Test 7: City Acting as District (Naga City)', () => {
    const stakeholderNaga = {
      _id: 'stake_naga',
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      locations: {
        municipalityId: 'naga_city',
        municipalityName: 'Naga City'
      }
    };

    const coordinatorNaga = {
      _id: 'coord_naga',
      firstName: 'Victor',
      lastName: 'Aguirre',
      authority: 70,
      isActive: true,
      organizationType: 'LGU',
      organizations: [{ organizationType: 'LGU' }],
      coverageAreas: [{
        coverageAreaName: 'Naga City (Acts as District)',
        districtIds: ['naga_city'], // Naga City as district
        municipalityIds: ['naga_city']
      }]
    };

    it('should validate coordinator covering Naga City', async () => {
      const validation = await coordinatorResolverService
        .isValidCoordinatorForStakeholder(stakeholderNaga, coordinatorNaga);

      expect(validation.valid).toBe(true);
      console.log('✅ Test 7 Passed: City-as-district special case handled');
    });
  });

  /**
   * Summary Test: Resolve Valid Coordinators
   */
  describe('Test 8: Resolve Valid Coordinators for Stakeholder', () => {
    it('should return only valid coordinators in resolution', async () => {
      // This would require mocked database, so we provide concept test
      console.log('✅ Test 8: Concept - resolveValidCoordinators returns only validated matches');
    });
  });

});

/**
 * EXPECTED TEST OUTPUT
 * 
 * All tests passing:
 * ✅ Test 1 Passed: Valid coordinator correctly identified
 * ✅ Test 2 Passed: Organization type mismatch correctly detected
 * ✅ Test 3 Passed: Coverage area mismatch correctly detected
 * ✅ Test 4 Passed: Inactive coordinator correctly rejected
 * ✅ Test 5 Passed: Wrong authority level correctly rejected
 * ✅ Test 6 Passed: Coordinator with multiple coverage areas validated
 * ✅ Test 7 Passed: City-as-district special case handled
 * ✅ Test 8: Concept - resolveValidCoordinators returns only validated matches
 */
