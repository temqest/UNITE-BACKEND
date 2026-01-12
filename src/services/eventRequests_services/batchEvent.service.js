/**
 * Batch Event Service
 * 
 * Handles batch creation of events for admin users
 * Bypasses the standard event request workflow and directly publishes events
 */

const mongoose = require('mongoose');
const { Event, BloodDrive, Training, Advocacy, User } = require('../../models/index');
const eventPublisherService = require('./eventPublisher.service');
const notificationEngine = require('../utility_services/notificationEngine.service');

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
            Event_Title: eventData.Event_Title,
            Location: eventData.Location,
            Start_Date: new Date(eventData.Start_Date),
            End_Date: endDate ? new Date(endDate) : undefined,
            Email: eventData.Email || adminUser.email || 'noreply@system',
            Phone_Number: eventData.Phone_Number || adminUser.phoneNumber || 'N/A',
            Event_Description: eventData.Event_Description || undefined,
            Category: eventData.Category || undefined,
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

