const express = require('express');
const router = express.Router();
const fileController = require('../controller/utility_controller/file.controller');
const authenticate = require('../middleware/authenticate');
const rateLimiter = require('../middleware/rateLimiter');

// Protect file routes
router.use(authenticate);

// Generate presigned URL for upload
router.post('/presign', rateLimiter.general, fileController.presign);

// Get signed download URL
router.get('/signed-url', rateLimiter.general, fileController.getSignedUrl);

// Delete an attachment from a message and S3
router.delete('/:messageId/:index', rateLimiter.general, fileController.deleteAttachment);

// Edit attachment metadata (filename)
router.patch('/:messageId/:index', rateLimiter.general, fileController.editAttachment);

// After client uploads to S3, attach metadata and create the message server-side
router.post('/attach', rateLimiter.general, fileController.attach);

module.exports = router;
