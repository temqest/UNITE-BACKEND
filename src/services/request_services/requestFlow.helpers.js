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
    if (categoryDoc.ExpectedAudienceSize) {
      return `reach an expected audience size of ${categoryDoc.ExpectedAudienceSize}`;
    }
    if (categoryDoc.TargetAudience) {
      return `engage ${categoryDoc.TargetAudience}`;
    }
    return 'raise awareness';
  }

  if (category === 'Training') {
    const type = categoryDoc.TrainingType ? `${categoryDoc.TrainingType} ` : '';
    if (categoryDoc.MaxParticipants) {
      return `conduct ${type}training for up to ${categoryDoc.MaxParticipants} participants`;
    }
    if (categoryDoc.TrainingType) {
      return `conduct ${categoryDoc.TrainingType} training`;
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

function buildDecisionSummary({ reviewerName, decision, eventTitle, reschedulePayload, notes }) {
  const verb = decision === REVIEW_DECISIONS.ACCEPT ? 'accepted' : decision === REVIEW_DECISIONS.REJECT ? 'rejected' : 'proposed a reschedule for';
  const base = `${reviewerName} ${verb} “${eventTitle}”.`;

  let parts = [base];

  if (decision === REVIEW_DECISIONS.RESCHEDULE && reschedulePayload) {
    const date = reschedulePayload.proposedDate ? formatISO(reschedulePayload.proposedDate) : null;
    const time = reschedulePayload.proposedStartTime && reschedulePayload.proposedEndTime
      ? `${reschedulePayload.proposedStartTime}–${reschedulePayload.proposedEndTime}`
      : (reschedulePayload.proposedStartTime || reschedulePayload.proposedEndTime || '');
    const details = [date, time].filter(Boolean).join(' ');
    if (details) parts.push(`New schedule: ${details}.`);
  }

  // Prefer an explicit `notes` param, otherwise fall back to any reviewerNotes on the payload
  const noteText = (typeof notes === 'string' && notes.trim()) ? notes.trim() : (reschedulePayload && reschedulePayload.reviewerNotes ? String(reschedulePayload.reviewerNotes).trim() : null);
  if (noteText) {
    // Put note on its own sentence for clarity
    parts.push(`Note: ${noteText}`);
  }

  return parts.join(' ').trim();
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
  buildDecisionSummary,
  getHumanStatusLabel
};

function getHumanStatusLabel(status, request = {}) {
  const s = String(status || '').toLowerCase();
  const reviewerRole = request.reviewer && request.reviewer.role ? String(request.reviewer.role).toLowerCase() : null;
  
  // IMPORTANT: For SystemAdmin-created requests, reviewer should always be coordinator
  // If reviewer is not set or is incorrectly set, check the creator role
  const creatorRole = request.made_by_role || request.creator?.role;
  const isSystemAdminRequest = creatorRole && String(creatorRole).toLowerCase().includes('admin');
  
  // If SystemAdmin created the request, the reviewer should be coordinator (not stakeholder)
  let effectiveReviewerRole = reviewerRole;
  if (isSystemAdminRequest && reviewerRole !== 'coordinator' && reviewerRole !== 'systemadmin' && reviewerRole !== 'admin') {
    // SystemAdmin requests should be reviewed by coordinator, not stakeholder
    effectiveReviewerRole = 'coordinator';
  }

  if (s.includes('pending')) {
    if (effectiveReviewerRole === 'coordinator') return 'Waiting for Coordinator review';
    if (effectiveReviewerRole === 'systemadmin' || effectiveReviewerRole === 'admin') return 'Waiting for Admin review';
    return 'Waiting for Admin or Coordinator review';
  }

  if (s.includes('review')) {
    // review-accepted / review-rescheduled etc.
    if (s.includes('accepted')) return 'Waiting for Coordinator confirmation';
    if (s.includes('resched') || s.includes('reschedule') || s.includes('rescheduled')) return (reviewerRole === 'coordinator') ? 'Waiting for Coordinator review (reschedule)' : 'Waiting for Admin review (reschedule)';
    return 'Waiting for Admin or Coordinator review';
  }

  // Handle legacy or non-review rescheduled statuses like 'Rescheduled_By_Admin'
  if (s.includes('resched') || s.includes('reschedule') || s.includes('rescheduled')) {
    return (reviewerRole === 'coordinator') ? 'Waiting for Coordinator review (reschedule)' : 'Waiting for Admin review (reschedule)';
  }

  if (s.includes('completed')) return 'Completed';
  if (s.includes('cancel')) return 'Cancelled';
  if (s.includes('reject')) return 'Rejected';
  return String(status || '') || 'Unknown';
}

