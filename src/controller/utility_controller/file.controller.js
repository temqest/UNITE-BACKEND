const s3 = require('../../utils/s3');
const Message = require('../../models/chat_models/message.model');
const messageService = require('../../services/chat_services/message.service');

class FileController {
  async presign(req, res) {
    try {
      const { filename, contentType, key, expires } = req.body;

      if (!filename || !contentType) {
        return res.status(400).json({ success: false, message: 'filename and contentType are required' });
      }

      const Key = key || `uploads/${Date.now()}_${filename}`;

      const url = await s3.getPresignedPutUrl(Key, contentType, expires || 300);

      const publicUrl = `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${Key}`;

      return res.status(200).json({ success: true, data: { uploadUrl: url, key: Key, publicUrl } });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async getSignedUrl(req, res) {
    try {
      const { key, expires } = req.query;
      if (!key) return res.status(400).json({ success: false, message: 'key is required' });

      const url = await s3.getSignedGetUrl(key, parseInt(expires) || 60);
      return res.status(200).json({ success: true, data: { url } });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteAttachment(req, res) {
    try {
      const { messageId, index } = req.params;
      const idx = parseInt(index, 10);
      if (isNaN(idx)) return res.status(400).json({ success: false, message: 'invalid attachment index' });

      const message = await Message.findOne({ messageId });
      if (!message) return res.status(404).json({ success: false, message: 'message not found' });

      const attachment = message.attachments[idx];
      if (!attachment) return res.status(404).json({ success: false, message: 'attachment not found' });

      // Derive key from url if key missing
      let key;
      if (attachment.key) key = attachment.key;
      else if (attachment.url) {
        const parts = attachment.url.split('.s3.amazonaws.com/');
        key = parts.length > 1 ? parts[1] : null;
      }

      if (key) {
        await s3.deleteObject(key);
      }

      // remove from attachments array
      message.attachments.splice(idx, 1);
      await message.save();

      return res.status(200).json({ success: true, message: 'attachment removed' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async editAttachment(req, res) {
    try {
      const { messageId, index } = req.params;
      const { filename } = req.body;
      const idx = parseInt(index, 10);
      if (isNaN(idx)) return res.status(400).json({ success: false, message: 'invalid attachment index' });

      const message = await Message.findOne({ messageId });
      if (!message) return res.status(404).json({ success: false, message: 'message not found' });

      const attachment = message.attachments[idx];
      if (!attachment) return res.status(404).json({ success: false, message: 'attachment not found' });

      if (filename) attachment.filename = filename;
      await message.save();

      return res.status(200).json({ success: true, data: attachment });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // Attach metadata after client-side S3 upload and create message server-side
  async attach(req, res) {
    try {
      const senderId = req.user && (req.user.id || req.user.ID || req.user._id);
      if (!senderId) return res.status(401).json({ success: false, message: 'Unauthorized' });

      let { receiverId, content = '', messageType = 'file', attachments } = req.body;

      // Defensive: attachments may be stringified by some clients; attempt to parse
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments);
        } catch (parseErr) {
          // Attempt to recover from single-quoted JS-like serialization
          try {
            const repaired = attachments.replace(/'/g, '"');
            attachments = JSON.parse(repaired);
          } catch (e) {
            attachments = null;
          }
        }
      }

      if (!receiverId || !attachments || !Array.isArray(attachments) || attachments.length === 0) {
        return res.status(400).json({ success: false, message: 'receiverId and attachments are required' });
      }

      // Normalize attachment items to plain objects
      attachments = attachments.map((att) => {
        if (!att) return null;
        if (typeof att === 'string') {
          // Try strict JSON parse first
          try { return JSON.parse(att); } catch (e) {
            // Attempt to extract an object block from messy stringified input
            const m = att.match(/\{[\s\S]*\}/);
            if (m) {
              let objStr = m[0];
              // Quote unquoted keys: foo: -> "foo":
              objStr = objStr.replace(/([,{\s])(\w+)\s*:/g, '$1"$2":');
              // Convert single quotes to double quotes
              objStr = objStr.replace(/'/g, '"');
              try { return JSON.parse(objStr); } catch (e2) { return null; }
            }
            return null;
          }
        }
        return att;
      }).filter(Boolean);

      // attachments expected: [{ filename, url, key, mime, size }]
      const message = await messageService.sendMessage(senderId, receiverId, content, messageType, attachments);

      // Prepare an emitted copy with signed GET URLs for attachments (do not overwrite DB)
      let emittedMessage = message && message.toObject ? message.toObject() : message;
      if (emittedMessage && Array.isArray(emittedMessage.attachments) && emittedMessage.attachments.length > 0) {
        emittedMessage.attachments = await Promise.all(emittedMessage.attachments.map(async (att) => {
          if (att && att.key) {
            try {
              const signed = await s3.getSignedGetUrl(att.key, 60 * 60); // 1 hour
              return { ...att, url: signed };
            } catch (e) {
              return att;
            }
          }
          return att;
        }));
      }

      // Emit via Socket.IO if available
      try {
        const io = req.app && req.app.get && req.app.get('io');
          if (io) {
          // Notify sender and receiver rooms using the enriched payload
          io.to(String(receiverId)).emit('new_message', emittedMessage);
          io.to(String(senderId)).emit('message_sent', emittedMessage);
        }
      } catch (emitErr) {
        // non-fatal
      }

      return res.status(201).json({ success: true, data: emittedMessage });
    } catch (error) {
      console.error('Error in FileController.attach:', error && (error.stack || error.message || error));
      return res.status(500).json({ success: false, message: error.message || 'Failed to attach files' });
    }
  }
}

module.exports = new FileController();
