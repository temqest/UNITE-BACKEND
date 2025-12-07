const Joi = require('joi');

// Message validation schemas
const sendMessageSchema = Joi.object({
  receiverId: Joi.string().required().messages({
    'string.empty': 'Receiver ID is required',
    'any.required': 'Receiver ID is required'
  }),
  content: Joi.string().min(1).max(1000).required().messages({
    'string.empty': 'Message content cannot be empty',
    'string.min': 'Message content cannot be empty',
    'string.max': 'Message content cannot exceed 1000 characters',
    'any.required': 'Message content is required'
  }),
  messageType: Joi.string().valid('text', 'image', 'file').default('text').messages({
    'any.only': 'Message type must be text, image, or file'
  }),
  attachments: Joi.array().items(
    Joi.object({
      filename: Joi.string().required(),
      url: Joi.string().uri().required(),
      type: Joi.string().required(),
      size: Joi.number().integer().min(0).required()
    })
  ).default([])
});

const getMessagesSchema = Joi.object({
  conversationId: Joi.string().required().messages({
    'string.empty': 'Conversation ID is required',
    'any.required': 'Conversation ID is required'
  }),
  page: Joi.number().integer().min(1).default(1).messages({
    'number.min': 'Page must be at least 1'
  }),
  limit: Joi.number().integer().min(1).max(100).default(50).messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100'
  })
});

const markReadSchema = Joi.object({
  messageId: Joi.string().required().messages({
    'string.empty': 'Message ID is required',
    'any.required': 'Message ID is required'
  })
});

const deleteMessageSchema = Joi.object({
  messageId: Joi.string().required().messages({
    'string.empty': 'Message ID is required',
    'any.required': 'Message ID is required'
  })
});

module.exports = {
  sendMessageSchema,
  getMessagesSchema,
  markReadSchema,
  deleteMessageSchema
};