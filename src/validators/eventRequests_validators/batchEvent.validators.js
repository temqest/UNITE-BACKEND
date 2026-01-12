/**
 * Batch Event Validators
 * 
 * Validation rules for batch event creation using Joi
 */

const Joi = require('joi');

// Maximum number of events allowed in a single batch
const MAX_BATCH_SIZE = 100;

// Schema for a single event in the batch
const eventSchema = Joi.object({
  // Event_ID is optional - will be generated
  Event_ID: Joi.string().trim().optional(),
  
  // Required event fields
  Event_Title: Joi.string().trim().min(3).max(200).required()
    .messages({
      'string.empty': 'Event title is required',
      'string.min': 'Event title must be at least 3 characters',
      'string.max': 'Event title must not exceed 200 characters'
    }),
  
  Location: Joi.string().trim().min(3).max(500).required()
    .messages({
      'string.empty': 'Location is required',
      'string.min': 'Location must be at least 3 characters',
      'string.max': 'Location must not exceed 500 characters'
    }),
  
  Start_Date: Joi.date().required()
    .messages({
      'date.base': 'Start date is required and must be a valid date',
      'any.required': 'Start date is required'
    }),
  
  End_Date: Joi.date().optional()
    .greater(Joi.ref('Start_Date'))
    .messages({
      'date.greater': 'End date must be after start date'
    }),
  
  Email: Joi.string().email().optional()
    .allow('', null)
    .messages({
      'string.email': 'Email must be a valid email address'
    }),
  
  Phone_Number: Joi.string().trim().optional()
    .allow('', null),
  
  // Optional event fields
  Event_Description: Joi.string().trim().allow('', null).max(2000).optional(),
  Category: Joi.string().trim().optional(),
  
  // Category-specific fields
  Target_Donation: Joi.number().integer().min(0).optional(),
  VenueType: Joi.string().trim().optional(),
  TrainingType: Joi.string().trim().optional(),
  MaxParticipants: Joi.number().integer().min(1).optional(),
  Topic: Joi.string().trim().optional(),
  TargetAudience: Joi.string().trim().optional(),
  ExpectedAudienceSize: Joi.number().integer().min(0).optional(),
  PartnerOrganization: Joi.string().trim().optional(),
  StaffAssignmentID: Joi.string().trim().optional(),
  
  // Location and organization references
  organizationId: Joi.string().hex().length(24).optional(),
  coverageAreaId: Joi.string().hex().length(24).optional(),
  municipalityId: Joi.string().hex().length(24).optional(),
  district: Joi.string().hex().length(24).optional(),
  province: Joi.string().hex().length(24).optional(),
  
  // Coordinator and stakeholder references
  coordinator_id: Joi.string().trim().optional(),
  stakeholder_id: Joi.string().trim().optional(),
  
  // Notes
  notes: Joi.string().trim().max(1000).optional()
}).unknown(false); // Don't allow unknown fields

/**
 * Validate batch event creation request
 * Validates an array of events (max 100 events per batch)
 */
const validateBatchEvents = (req, res, next) => {
  const schema = Joi.object({
    events: Joi.array()
      .items(eventSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .required()
      .messages({
        'array.base': 'Events must be an array',
        'array.min': 'At least one event is required',
        'array.max': `Maximum ${MAX_BATCH_SIZE} events allowed per batch`,
        'any.required': 'Events array is required'
      })
  });

  const { error, value } = schema.validate(req.body, { 
    abortEarly: false,
    allowUnknown: false 
  });

  if (error) {
    const errorMessages = error.details.map(d => {
      // Format array index errors more clearly
      if (d.path.length > 1 && typeof d.path[0] === 'number') {
        const eventIndex = d.path[0];
        const field = d.path.slice(1).join('.');
        return `Event ${eventIndex + 1} - ${field}: ${d.message}`;
      }
      return d.message;
    });
    
    return res.status(400).json({
      success: false,
      message: 'Batch validation failed',
      errors: errorMessages,
      errorCount: errorMessages.length
    });
  }

  // Additional validation: Category-specific field requirements
  const categoryValidationErrors = [];
  value.events.forEach((event, index) => {
    if (event.Category) {
      const category = event.Category.toLowerCase();
      
      if (category === 'blooddrive' || category.includes('blood')) {
        if (event.Target_Donation === undefined || event.Target_Donation === null) {
          categoryValidationErrors.push(
            `Event ${index + 1}: Target_Donation is required for BloodDrive events`
          );
        }
      } else if (category === 'training' || category.includes('train')) {
        if (event.MaxParticipants === undefined || event.MaxParticipants === null) {
          categoryValidationErrors.push(
            `Event ${index + 1}: MaxParticipants is required for Training events`
          );
        }
      } else if (category === 'advocacy' || category.includes('advoc')) {
        if (!event.Topic && !event.TargetAudience) {
          categoryValidationErrors.push(
            `Event ${index + 1}: Topic or TargetAudience is required for Advocacy events`
          );
        }
      }
    }
  });

  if (categoryValidationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Category-specific validation failed',
      errors: categoryValidationErrors,
      errorCount: categoryValidationErrors.length
    });
  }

  // Normalize dates: ensure End_Date defaults to 2 hours after Start_Date if not provided
  value.events = value.events.map(event => {
    if (!event.End_Date && event.Start_Date) {
      const startDate = new Date(event.Start_Date);
      event.End_Date = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Add 2 hours
    }
    return event;
  });

  req.validatedData = value;
  next();
};

module.exports = {
  validateBatchEvents,
  MAX_BATCH_SIZE
};

