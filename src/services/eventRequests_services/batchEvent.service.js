/**
 * Batch Event Service
 * 
 * Handles batch creation of events for admin users.
 * 
 * WORKFLOW:
 * 1. Admin creates batch of events through the API
 * 2. Each event is created directly in the Event collection
 * 3. For each event, an EventRequest is automatically created with:
 *    - Status: APPROVED (not pending)
 *    - Assigned to: The coordinator of the event's province/district
 *    - Purpose: Makes the event visible to the coordinator on campaign page
 * 4. This allows coordinators to see and manage batch-created events
 *    while still being tracked in the request workflow system
 * 
 * Benefits:
 * - Admin can rapidly create multiple events
 * - Events automatically appear on coordinator's dashboard
 * - Events are visible in the campaign/request visibility system
 * - Coordinators can still reschedule or manage approved events
 */

const mongoose = require('mongoose');
const { Event, BloodDrive, Training, Advocacy, User, EventRequest } = require('../../models/index');
const eventPublisherService = require('./eventPublisher.service');
const notificationEngine = require('../utility_services/notificationEngine.service');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');
const reviewerAssignmentService = require('./reviewerAssignment.service');

class BatchEventService {
  /**
   * Generate unique Event_ID
   * @returns {string} Generated Event_ID
   */
  generateEventId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `EVENT_${timestamp}_${random}`;
  }

  /**
   * Generate unique Request_ID
   * @returns {string} Generated Request_ID
   */
  generateRequestId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Create batch of events directly (bypassing request workflow)
   * @param {string|ObjectId} userId - Admin user ID creating the batch
   * @param {Array<Object>} eventsData - Array of event data objects
   * @returns {Promise<Object>} Result with created events and errors
   */
  async createBatchEvents(userId, eventsData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    const results = {
      created: 0,
      failed: 0,
      events: [],
      errors: []
    };

    try {
      // Get admin user details
      const adminUser = await User.findById(userId).session(session);
      if (!adminUser) {
        throw new Error('Admin user not found');
      }

      // Prepare actor snapshot for notifications
      const actorSnapshot = {
        userId: adminUser._id,
        name: `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email,
        roleSnapshot: adminUser.roles?.[0]?.roleCode || 'system-admin',
        authoritySnapshot: adminUser.authority || 100
      };

      // Generate Event_IDs and prepare event documents
      const eventDocuments = [];
      const categoryRecords = [];

      for (let i = 0; i < eventsData.length; i++) {
        const eventData = eventsData[i];
        
        try {
          // Generate unique Event_ID
          const eventId = eventData.Event_ID || this.generateEventId();

          // Ensure End_Date is set (default to 2 hours after Start_Date)
          let endDate = eventData.End_Date;
          if (!endDate && eventData.Start_Date) {
            const startDate = new Date(eventData.Start_Date);
            endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Add 2 hours
          }

          // Create event document
          // Note: Event model requires Email and Phone_Number, so provide defaults if not provided
          const eventDoc = {
            Event_ID: eventId,
            Request_ID: eventData.Request_ID || undefined,
            Event_Title: eventData.Event_Title,
            Location: eventData.Location,
            Start_Date: new Date(eventData.Start_Date),
            End_Date: endDate ? new Date(endDate) : undefined,
            Email: eventData.Email || adminUser.email || 'noreply@system',
            Phone_Number: eventData.Phone_Number || adminUser.phoneNumber || 'N/A',
            Event_Description: eventData.Event_Description || undefined,
            Category: eventData.Category || undefined,
            isBatchCreated: true,
            // Location references
            province: eventData.province || undefined,
            district: eventData.district || undefined,
            municipality: eventData.municipalityId || undefined,
            // Creator information
            made_by_id: userId.toString(),
            made_by_role: this._mapRoleToEventEnum(adminUser.roles?.[0]?.roleCode || 'system-admin'),
            // Coordinator and stakeholder
            coordinator_id: eventData.coordinator_id || userId.toString(),
            stakeholder_id: eventData.stakeholder_id || undefined,
            // Status - directly approved
            Status: 'Approved'
          };

          // Remove undefined fields
          Object.keys(eventDoc).forEach(key => {
            if (eventDoc[key] === undefined) {
              delete eventDoc[key];
            }
          });

          eventDocuments.push({
            document: eventDoc,
            index: i,
            category: eventData.Category,
            categoryData: {
              Target_Donation: eventData.Target_Donation,
              VenueType: eventData.VenueType,
              TrainingType: eventData.TrainingType,
              MaxParticipants: eventData.MaxParticipants,
              Topic: eventData.Topic,
              TargetAudience: eventData.TargetAudience,
              ExpectedAudienceSize: eventData.ExpectedAudienceSize,
              PartnerOrganization: eventData.PartnerOrganization
            }
          });

        } catch (error) {
          results.failed++;
          results.errors.push({
            index: i,
            event: eventData.Event_Title || `Event ${i + 1}`,
            error: error.message || 'Failed to prepare event document'
          });
        }
      }

      // Bulk insert events using insertMany with ordered: false for parallel insertion
      if (eventDocuments.length > 0) {
        const eventsToInsert = eventDocuments.map(ed => ed.document);
        
        try {
          const insertedEvents = await Event.insertMany(eventsToInsert, {
            session,
            ordered: false // Continue inserting even if some fail
          });

          // Process successful events
          for (const insertedEvent of insertedEvents) {
            const eventDoc = eventDocuments.find(ed => ed.document.Event_ID === insertedEvent.Event_ID);
            
            if (eventDoc) {
              // Create category-specific record if category is specified
              if (eventDoc.category) {
                try {
                  const categoryRecord = await this._createCategoryRecord(
                    insertedEvent.Event_ID,
                    eventDoc.category,
                    eventDoc.categoryData,
                    session
                  );
                  
                  if (categoryRecord) {
                    categoryRecords.push({
                      eventId: insertedEvent.Event_ID,
                      category: eventDoc.category,
                      record: categoryRecord
                    });
                  }
                } catch (categoryError) {
                  // Log but don't fail the event creation
                  console.error(`[BATCH EVENT SERVICE] Failed to create category record for ${insertedEvent.Event_ID}:`, categoryError.message);
                  results.errors.push({
                    index: eventDoc.index,
                    event: insertedEvent.Event_Title,
                    error: `Category record creation failed: ${categoryError.message}`,
                    warning: true // Mark as warning, not failure
                  });
                }
              }

              // Create approved EventRequest for visibility to coordinator
              try {
                await this._createApprovedEventRequest(insertedEvent, adminUser, session, eventDoc.categoryData);
              } catch (requestError) {
                // Log but don't fail the event creation
                console.error(`[BATCH EVENT SERVICE] Failed to create EventRequest for ${insertedEvent.Event_ID}:`, requestError.message);
                results.errors.push({
                  index: eventDoc.index,
                  event: insertedEvent.Event_Title,
                  error: `EventRequest creation failed: ${requestError.message}`,
                  warning: true // Mark as warning, not failure
                });
              }

              // Trigger notification (non-blocking)
              setImmediate(async () => {
                try {
                  await notificationEngine.notifyEventPublished(
                    insertedEvent,
                    null, // No request for batch-created events
                    actorSnapshot
                  );
                } catch (notificationError) {
                  console.error(`[BATCH EVENT SERVICE] Notification failed for ${insertedEvent.Event_ID}:`, notificationError.message);
                }
              });

              results.created++;
              results.events.push({
                Event_ID: insertedEvent.Event_ID,
                Event_Title: insertedEvent.Event_Title,
                Location: insertedEvent.Location,
                Start_Date: insertedEvent.Start_Date,
                End_Date: insertedEvent.End_Date,
                Status: insertedEvent.Status
              });
            }
          }

        } catch (bulkError) {
          // Handle bulk write errors
          if (bulkError.writeErrors && bulkError.writeErrors.length > 0) {
            bulkError.writeErrors.forEach((writeError, idx) => {
              const eventDoc = eventDocuments[writeError.index];
              results.failed++;
              results.errors.push({
                index: eventDoc ? eventDoc.index : idx,
                event: eventDoc ? eventDoc.document.Event_Title : `Event ${idx + 1}`,
                error: writeError.errmsg || writeError.err?.message || 'Database insertion failed'
              });
            });
          } else {
            // General bulk error
            throw bulkError;
          }
        }
      }

      // Commit transaction
      await session.commitTransaction();

      console.log(`[BATCH EVENT SERVICE] Batch creation completed: ${results.created} created, ${results.failed} failed`);

      return results;

    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      
      console.error(`[BATCH EVENT SERVICE] Batch creation error:`, error);
      
      // If we have partial results, return them; otherwise throw
      if (results.created > 0 || results.failed > 0) {
        results.errors.push({
          index: -1,
          event: 'Batch operation',
          error: `Transaction aborted: ${error.message}`
        });
        return results;
      }
      
      throw new Error(`Failed to create batch events: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Map role code to Event model enum value
   * @private
   * @param {string} roleCode - Role code (lowercase)
   * @returns {string} Event model enum value (capitalized)
   */
  _mapRoleToEventEnum(roleCode) {
    if (!roleCode) return 'SystemAdmin';
    
    const roleMap = {
      'system-admin': 'SystemAdmin',
      'coordinator': 'Coordinator',
      'stakeholder': 'Stakeholder',
      'admin': 'SystemAdmin',
      'operational-admin': 'SystemAdmin'
    };
    
    return roleMap[roleCode.toLowerCase()] || 'SystemAdmin';
  }

  /**
   * Create EventRequest for batch-created event with approved status
   * Automatically assigns to the proper coordinator of the same province/district
   * @private
   * @param {Object} event - Created Event document
   * @param {Object} adminUser - Admin user who created the batch
   * @param {Object} session - MongoDB session for transaction
   * @param {Object} categoryData - Category-specific data (Target_Donation, MaxParticipants, etc.)
   * @returns {Promise<Object|null>} Created EventRequest or null if creation fails
   */
  async _createApprovedEventRequest(event, adminUser, session, categoryData = {}) {
    try {
      if (!event.Event_ID) {
        console.warn('[BATCH EVENT SERVICE] Cannot create request: Event_ID is missing');
        return null;
      }

      // Find coordinator(s) for the same province and district
      const district = event.district;
      const province = event.province;

      console.log(`[BATCH EVENT SERVICE] Attempting to create request for event ${event.Event_ID}`);
      console.log(`[BATCH EVENT SERVICE] Event district: ${district}, province: ${province}`);

      if (!district || !province) {
        console.warn(`[BATCH EVENT SERVICE] Cannot create request for ${event.Event_ID}: Missing district (${district}) or province (${province})`);
        return null;
      }

      // Convert to string for comparison if they're ObjectIds
      const districtStr = district.toString ? district.toString() : String(district);
      const provinceStr = province.toString ? province.toString() : String(province);

      console.log(`[BATCH EVENT SERVICE] Looking for coordinator with district: ${districtStr}`);

      // Try multiple query approaches to find coordinator
      let coordinator = null;

      // Approach 1: Try with coverageAreas.districtIds
      coordinator = await User.findOne({
        roles: { $elemMatch: { roleCode: { $in: ['coordinator', 'Coordinator'] } } },
        'coverageAreas.districtIds': districtStr,
        isActive: true
      }).session(session);

      if (!coordinator) {
        console.log(`[BATCH EVENT SERVICE] No coordinator found with coverageAreas.districtIds. Trying district field...`);
        
        // Approach 2: Try with direct district field
        coordinator = await User.findOne({
          roles: { $elemMatch: { roleCode: { $in: ['coordinator', 'Coordinator'] } } },
          'locations.districtId': districtStr,
          isActive: true
        }).session(session);
      }

      if (!coordinator) {
        console.log(`[BATCH EVENT SERVICE] No coordinator found with direct district field. Finding all active coordinators...`);
        
        // Approach 3: Get all coordinators and log their structure
        const allCoordinators = await User.find({
          roles: { $elemMatch: { roleCode: { $in: ['coordinator', 'Coordinator'] } } },
          isActive: true
        }).select('_id firstName lastName email coverageAreas locations').limit(5).session(session);

        console.log(`[BATCH EVENT SERVICE] Found ${allCoordinators.length} active coordinators:`);
        allCoordinators.forEach((coord, idx) => {
          console.log(`  Coordinator ${idx + 1}:`);
          console.log(`    - Name: ${coord.firstName} ${coord.lastName}`);
          console.log(`    - coverageAreas: ${JSON.stringify(coord.coverageAreas?.length || 0)} areas`);
          if (coord.coverageAreas?.[0]) {
            console.log(`    - First coverage area districtIds: ${JSON.stringify(coord.coverageAreas[0].districtIds)}`);
          }
          console.log(`    - locations.districtId: ${coord.locations?.districtId}`);
        });

        // Approach 4: Try matching any coordinator (fallback)
        if (allCoordinators.length > 0) {
          coordinator = allCoordinators[0];
          console.warn(`[BATCH EVENT SERVICE] Using first available coordinator as fallback: ${coordinator.firstName} ${coordinator.lastName}`);
        }
      }

      if (!coordinator) {
        console.warn(`[BATCH EVENT SERVICE] No active coordinator found for district ${districtStr}`);
        return null;
      }

      console.log(`[BATCH EVENT SERVICE] Coordinator found: ${coordinator.firstName} ${coordinator.lastName} (${coordinator._id})`);

      // Generate Request_ID
      const requestId = this.generateRequestId();

      // Create requester snapshot (admin who created the batch)
      const requesterSnapshot = {
        userId: adminUser._id,
        name: `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email,
        roleSnapshot: adminUser.roles?.[0]?.roleCode || 'system-admin',
        authoritySnapshot: adminUser.authority || 100
      };

      // Create reviewer snapshot (assigned coordinator)
      const coordinatorName = `${coordinator.firstName || ''} ${coordinator.lastName || ''}`.trim() || coordinator.email;
      const coordinatorRole = coordinator.roles?.[0]?.roleCode || 'coordinator';

      const reviewerSnapshot = {
        userId: coordinator._id,
        name: coordinatorName,
        roleSnapshot: coordinatorRole,
        assignedAt: new Date(),
        autoAssigned: true,
        assignmentRule: 'auto-assigned'
      };

      // Create status history entry
      const statusHistory = [{
        status: REQUEST_STATES.APPROVED,
        note: 'Automatically approved as part of batch event creation by admin',
        changedAt: new Date(),
        actor: requesterSnapshot
      }];

      // Create the EventRequest with all category-specific data
      const eventRequest = new EventRequest({
        Request_ID: requestId,
        Event_ID: event.Event_ID,
        requester: requesterSnapshot,
        reviewer: reviewerSnapshot,
        // Location references
        organizationId: event.organizationId || undefined,
        coverageAreaId: event.coverageAreaId || undefined,
        municipalityId: event.municipality || undefined,
        district: district,
        province: province,
        // Event details
        Event_Title: event.Event_Title,
        Location: event.Location,
        Date: event.Start_Date,
        Email: event.Email,
        Phone_Number: event.Phone_Number,
        Event_Description: event.Event_Description,
        Category: event.Category,
        // Category-specific fields from categoryData parameter
        Target_Donation: categoryData.Target_Donation || event.Target_Donation || undefined,
        VenueType: categoryData.VenueType || event.VenueType || undefined,
        TrainingType: categoryData.TrainingType || event.TrainingType || undefined,
        MaxParticipants: categoryData.MaxParticipants || event.MaxParticipants || undefined,
        Topic: categoryData.Topic || event.Topic || undefined,
        TargetAudience: categoryData.TargetAudience || event.TargetAudience || undefined,
        ExpectedAudienceSize: categoryData.ExpectedAudienceSize || event.ExpectedAudienceSize || undefined,
        PartnerOrganization: categoryData.PartnerOrganization || event.PartnerOrganization || undefined,
        // Status
        status: REQUEST_STATES.APPROVED,
        statusHistory: statusHistory
      });

      await eventRequest.save({ session });

      // Update event with Request_ID link
      event.Request_ID = requestId;
      await event.save({ session });

      console.log(`[BATCH EVENT SERVICE] Successfully created EventRequest ${requestId} for event ${event.Event_ID}`);
      return eventRequest;

    } catch (error) {
      console.error(`[BATCH EVENT SERVICE] Error creating EventRequest for ${event.Event_ID}:`, error);
      // Don't throw - allow event to exist without request if request creation fails
      return null;
    }
  }

  /**
   * Create category record for event
   * @private
   * @param {string} eventId - Event_ID
   * @param {string} category - Category type (BloodDrive, Training, Advocacy)
   * @param {Object} categoryData - Category-specific data
   * @param {Object} session - MongoDB session for transaction
   * @returns {Promise<Object|null>} Created category record or null if validation fails
   */
  async _createCategoryRecord(eventId, category, categoryData, session) {
    if (!eventId || !category) {
      return null;
    }

    const categoryType = String(category).trim();
    
    try {
      // Check if category record already exists
      let existingRecord = null;
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        existingRecord = await BloodDrive.findOne({ BloodDrive_ID: eventId }).session(session);
        if (existingRecord) {
          return existingRecord;
        }
      } else if (categoryType === 'Training' || categoryType.toLowerCase().includes('train')) {
        existingRecord = await Training.findOne({ Training_ID: eventId }).session(session);
        if (existingRecord) {
          return existingRecord;
        }
      } else if (categoryType === 'Advocacy' || categoryType.toLowerCase().includes('advoc')) {
        existingRecord = await Advocacy.findOne({ Advocacy_ID: eventId }).session(session);
        if (existingRecord) {
          return existingRecord;
        }
      }

      // Create new category record based on type
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        const targetDonation = categoryData.Target_Donation;
        if (targetDonation === undefined || targetDonation === null) {
          console.warn(`[BATCH EVENT SERVICE] Cannot create BloodDrive record: Target_Donation is required`);
          return null;
        }

        const bloodDrive = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: Number(targetDonation),
          VenueType: categoryData.VenueType || undefined
        });

        await bloodDrive.save({ session });
        return bloodDrive;

      } else if (categoryType === 'Training' || categoryType.toLowerCase().includes('train')) {
        const maxParticipants = categoryData.MaxParticipants;
        if (maxParticipants === undefined || maxParticipants === null) {
          console.warn(`[BATCH EVENT SERVICE] Cannot create Training record: MaxParticipants is required`);
          return null;
        }

        const training = new Training({
          Training_ID: eventId,
          TrainingType: categoryData.TrainingType || undefined,
          MaxParticipants: Number(maxParticipants)
        });

        await training.save({ session });
        return training;

      } else if (categoryType === 'Advocacy' || categoryType.toLowerCase().includes('advoc')) {
        const topic = categoryData.Topic;
        const targetAudience = categoryData.TargetAudience;
        
        if (!topic && !targetAudience) {
          console.warn(`[BATCH EVENT SERVICE] Cannot create Advocacy record: Topic or TargetAudience is required`);
          return null;
        }

        const expectedSizeRaw = categoryData.ExpectedAudienceSize;
        const expectedSize = expectedSizeRaw !== undefined && expectedSizeRaw !== null && expectedSizeRaw !== '' 
          ? Number(expectedSizeRaw) 
          : undefined;

        const advocacy = new Advocacy({
          Advocacy_ID: eventId,
          Topic: topic || undefined,
          TargetAudience: targetAudience || undefined,
          ExpectedAudienceSize: expectedSize,
          PartnerOrganization: categoryData.PartnerOrganization || undefined
        });

        await advocacy.save({ session });
        return advocacy;

      } else {
        console.warn(`[BATCH EVENT SERVICE] Unknown category type: ${categoryType}`);
        return null;
      }
    } catch (error) {
      console.error(`[BATCH EVENT SERVICE] Error creating category record for Event ${eventId}, Category ${categoryType}:`, error);
      throw error;
    }
  }
}

module.exports = new BatchEventService();

