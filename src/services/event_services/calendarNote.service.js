const { CalendarNote } = require('../../models');

class CalendarNoteService {
  normalizeDateKey(input) {
    if (!input) return null;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async listNotes({ start, end }) {
    const startKey = this.normalizeDateKey(start);
    const endKey = this.normalizeDateKey(end);

    const query = {};
    if (startKey && endKey) {
      query.noteDate = { $gte: startKey, $lte: endKey };
    } else if (startKey) {
      query.noteDate = { $gte: startKey };
    } else if (endKey) {
      query.noteDate = { $lte: endKey };
    }

    const notes = await CalendarNote.find(query).sort({ noteDate: 1, createdAt: 1 }).lean();

    const notesByDate = {};
    notes.forEach((note) => {
      if (!note.noteDate) return;
      if (!notesByDate[note.noteDate]) notesByDate[note.noteDate] = [];
      notesByDate[note.noteDate].push({ ...note, id: note._id });
    });

    return notesByDate;
  }

  async createNote({ noteDate, content, userId }) {
    const normalizedDate = this.normalizeDateKey(noteDate);
    if (!normalizedDate) {
      throw new Error('Invalid note date');
    }
    if (!content || !content.trim()) {
      throw new Error('Note content is required');
    }
    const trimmedContent = content.trim().slice(0, 500);

    const note = await CalendarNote.create({
      noteDate: normalizedDate,
      content: trimmedContent,
      createdBy: String(userId),
    });

    return { ...note.toObject(), id: note._id };
  }

  async updateNote(noteId, { content, noteDate, userId }) {
    const update = {};

    if (content !== undefined) {
      const trimmedContent = content.trim();
      if (!trimmedContent) throw new Error('Note content is required');
      update.content = trimmedContent.slice(0, 500);
    }

    if (noteDate !== undefined) {
      const normalizedDate = this.normalizeDateKey(noteDate);
      if (!normalizedDate) throw new Error('Invalid note date');
      update.noteDate = normalizedDate;
    }

    update.updatedBy = userId ? String(userId) : undefined;

    const updated = await CalendarNote.findByIdAndUpdate(noteId, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) {
      throw new Error('Note not found');
    }

    return { ...updated, id: updated._id };
  }

  async deleteNote(noteId) {
    const deleted = await CalendarNote.findByIdAndDelete(noteId).lean();
    if (!deleted) {
      throw new Error('Note not found');
    }
    return { ...deleted, id: deleted._id };
  }
}

module.exports = new CalendarNoteService();
