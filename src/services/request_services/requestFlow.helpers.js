const REQUEST_STATUSES = Object.freeze({
  PENDING_REVIEW: 'pending-review',
  REVIEW_ACCEPTED: 'review-accepted',
  REVIEW_REJECTED: 'review-rejected',
  REVIEW_RESCHEDULED: 'review-rescheduled',
  CREATOR_CONFIRMED: 'creator-confirmed',
  CREATOR_DECLINED: 'creator-declined',
  COMPLETED: 'completed',
  EXPIRED: 'expired-review'
});

const REVIEW_DECISIONS = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
  RESCHEDULE: 'reschedule'
});

const CREATOR_ACTIONS = Object.freeze({
  CONFIRM: 'confirm',
  DECLINE: 'decline',
  REVISE: 'revise'
});

const EVENT_TYPE_LABELS = {
  BloodDrive: 'Blood Drive',
  Advocacy: 'Advocacy Event',
  Training: 'Training Event'
};

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatTimeRange(startDate, endDate) {
  const start = normalizeDate(startDate);
  if (!start) return '';
  const end = normalizeDate(endDate);
  const formatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const startStr = formatter.format(start);
  const endStr = end ? formatter.format(end) : null;
  if (startStr && endStr) return `${startStr}–${endStr}`;
  return startStr;
}

function formatISO(date) {
  const parsed = normalizeDate(date);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatDateRange(startDate, endDate) {
  const start = formatISO(startDate);
  if (!start) return '';
  const end = formatISO(endDate);
  if (start && end && start !== end) {
    return `${start} to ${end}`;
  }
  return start;
}

function resolveEventIntent(category, categoryDoc = {}, event = {}) {
  if (category === 'BloodDrive') {
    const target = categoryDoc.Target_Donation || event.Target_Donation;
    if (target) return `reach a target donation of ${target}`;
    return 'collect lifesaving blood donations';
  }

  if (category === 'Advocacy') {
    if (categoryDoc.Topic) {
      return `advance the advocacy topic "${categoryDoc.Topic}"`;
    }
    if (categoryDoc.TargetAudience) {
      return `engage ${categoryDoc.TargetAudience}`;
    }
    return 'raise awareness';
  }

  if (category === 'Training') {
    if (categoryDoc.TrainingType) {
      return `conduct ${categoryDoc.TrainingType} training`;
    }
    if (categoryDoc.MaxParticipants) {
      return `train up to ${categoryDoc.MaxParticipants} participants`;
    }
    return 'deliver hands-on training';
  }

  return event.Event_Description || 'support the community';
}

function buildReviewSummary({ requestorName, event }) {
  if (!event) return null;
  const category = event.Category || event.categoryType || 'Event';
  const typeLabel = EVENT_TYPE_LABELS[category] || category;
  const datePhrase = formatDateRange(event.Start_Date, event.End_Date);
  const timePhrase = formatTimeRange(event.Start_Date, event.End_Date);
  const intent = resolveEventIntent(category, event.categoryDoc, event);
  const goalSentence = intent ? `The event aims to ${intent}.` : '';
  const timeBlock = timePhrase ? ` from ${timePhrase}` : '';

  return `${requestorName} requested a ${typeLabel} titled ‘${event.Event_Title}’ on ${datePhrase}${timeBlock}. ${goalSentence} Located at ${event.Location}. Please review this request.`;
}

function buildDecisionSummary({ reviewerName, decision, eventTitle, reschedulePayload }) {
  const base = `${reviewerName} ${decision === REVIEW_DECISIONS.ACCEPT ? 'accepted' : decision === REVIEW_DECISIONS.REJECT ? 'rejected' : 'proposed a reschedule for'} “${eventTitle}”.`;
  if (decision === REVIEW_DECISIONS.RESCHEDULE && reschedulePayload) {
    const date = reschedulePayload.proposedDate ? formatISO(reschedulePayload.proposedDate) : null;
    const time = reschedulePayload.proposedStartTime && reschedulePayload.proposedEndTime
      ? `${reschedulePayload.proposedStartTime}–${reschedulePayload.proposedEndTime}`
      : (reschedulePayload.proposedStartTime || reschedulePayload.proposedEndTime || '');
    const details = [date, time].filter(Boolean).join(' ');
    return `${base} ${details ? `New schedule: ${details}.` : ''}`.trim();
  }
  return base;
}

module.exports = {
  REQUEST_STATUSES,
  REVIEW_DECISIONS,
  CREATOR_ACTIONS,
  EVENT_TYPE_LABELS,
  formatDateRange,
  formatTimeRange,
  formatISO,
  buildReviewSummary,
  buildDecisionSummary
};

