const calendarNoteService = require('../../services/event_services/calendarNote.service');
const authorityService = require('../../services/users_services/authority.service');

const ADMIN_AUTHORITY = 80;

function normalizeRange(query) {
  const now = new Date();
  const start = query.start || query.start_date;
  const end = query.end || query.end_date;

  if (start || end) {
    return { start, end };
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: first, end: last };
}

class CalendarNoteController {
  async list(req, res) {
    try {
      const { start, end } = normalizeRange(req.query || {});
      const notesByDate = await calendarNoteService.listNotes({ start, end });
      return res.status(200).json({ success: true, data: notesByDate });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to load calendar notes' });
    }
  }

  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const authority = await authorityService.calculateUserAuthority(userId);
      if (authority < ADMIN_AUTHORITY) {
        return res.status(403).json({ success: false, message: 'Permission denied: admin required' });
      }

      const { noteDate, content } = req.body || {};
      if (!noteDate || !content) {
        return res.status(400).json({ success: false, message: 'noteDate and content are required' });
      }

      const note = await calendarNoteService.createNote({ noteDate, content, userId });
      return res.status(201).json({ success: true, data: note });
    } catch (error) {
      const status = error.message && error.message.includes('Invalid note date') ? 400 : 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to create note' });
    }
  }

  async update(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const authority = await authorityService.calculateUserAuthority(userId);
      if (authority < ADMIN_AUTHORITY) {
        return res.status(403).json({ success: false, message: 'Permission denied: admin required' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Note id is required' });
      }

      const { content, noteDate } = req.body || {};
      if (content === undefined && noteDate === undefined) {
        return res.status(400).json({ success: false, message: 'Nothing to update' });
      }

      const updated = await calendarNoteService.updateNote(id, { content, noteDate, userId });
      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      const status = error.message && error.message.includes('not found') ? 404 : 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to update note' });
    }
  }

  async remove(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const authority = await authorityService.calculateUserAuthority(userId);
      if (authority < ADMIN_AUTHORITY) {
        return res.status(403).json({ success: false, message: 'Permission denied: admin required' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Note id is required' });
      }

      await calendarNoteService.deleteNote(id);
      return res.status(200).json({ success: true, message: 'Note deleted' });
    } catch (error) {
      const status = error.message && error.message.includes('not found') ? 404 : 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to delete note' });
    }
  }
}

module.exports = new CalendarNoteController();
