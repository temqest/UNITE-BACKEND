const mongoose = require('mongoose');

const CalendarNoteSchema = new mongoose.Schema(
  {
    noteDate: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

CalendarNoteSchema.index({ noteDate: 1 });

module.exports = mongoose.models.CalendarNote || mongoose.model('CalendarNote', CalendarNoteSchema);
