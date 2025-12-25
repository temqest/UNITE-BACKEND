## Plan: Campaign Request + Event System Redesign (Frontend + Backend Separate)

**Status**: PHASE 1 ✅ COMPLETE | PHASE 2 ✅ COMPLETE | PHASE 3 ⏳ PENDING | PHASE 4 🔄 IN PROGRESS

**TL;DR**: Separate the Campaign Request & Event system into two independent layers—Frontend (UI/UX consuming APIs) and Backend (authority-based filtering, permission-driven logic, state machine workflow). Remove all hardcoded role checks; migrate to permission-based `CAN_*` logic enforced server-side. Frontend becomes stateless—purely declarative UI driven by API responses. Backend enforces all visibility, ownership, and action rules via authority + permissions + organization/coverage intersection checks.

**See**: [PHASE_1_COMPLETION_REPORT.md](PHASE_1_COMPLETION_REPORT.md) for detailed implementation status.

---

### **Steps**

#### **PHASE 1: Backend Foundation (5 sub-steps)**

1. **Consolidate User Authority Model**
   - Verify [User model](src/models/users_models/user.model.js) persists `authority` field (100/80/60/30/20 tiers)
   - Ensure all role assignments update authority explicitly (not inferred)
   - Add audit logging: `authority_changed_at`, `authority_changed_by` for compliance
   - Validate [eventRequest.service.js](src/services/request_services/eventRequest.service.js) uses `user.authority >= TIER` everywhere, never role string checks

2. **Refactor Request Filtering by Authority + Organizations + Coverage**
   - Replace `getCoordinatorRequests()` with authority-based queries:
     - Admin (≥80): Returns ALL requests
     - Coordinator (≥60): Returns requests matching `(request.organizationId IN user.organizations) OR (request.municipalityId IN user.coverageAreas[].municipalityIds)`
     - Stakeholder (≥30): Returns own requests only (`request.createrId === user.id`)
   - Update [requests.controller.js](src/controller/request_controller/requests.controller.js#L851) `getMyRequests()` endpoint to call single authority-based method
   - Add diagnostic logging: `grant_reason: 'org_match' | 'coverage_match' | 'direct_creator' | 'admin_override'` to trace why record was included

3. **Unify Permission-Based Action Computation**
   - Ensure `computeAllowedActions()` in [eventRequest.service.js](src/services/request_services/eventRequest.service.js) is SINGLE source of truth
   - Map each state (`PENDING_REVIEW`, `REVIEW_ACCEPTED`, etc.) to action matrix:
     - Admin can always view/edit/delete
     - Reviewer can accept/reject/reschedule if `CAN_REVIEW_REQUESTS`
     - Requester can confirm/decline if `CAN_CONFIRM_REQUESTS`
     - No fallback to role strings; all permission checks explicit
   - Document state→actions mapping in [STATE_MACHINE_README.md](src/services/request_services/STATE_MACHINE_README.md)

4. **Enforce Authority Hierarchy in Workflows**
   - Every approve/reject/reschedule action validates: `actor.authority >= requester.authority OR isSystemAdmin`
   - Lower-authority users cannot override higher-authority decisions
   - Add permission gate: `hasPermission(user, 'request.approve') AND (authority check passes)`
   - Log audit trail: `{ action, actor_id, actor_authority, target_authority, outcome, reason }`

5. **Lock Event Creation Fields by Authority**
   - If `user.authority < 80` (not admin): Auto-set `coordinatorId = user.id`; prevent manual override in form validation
   - Stakeholder dropdown restricted to: `user.organizations[].organizationId` ∩ `request.organizationId` ∩ coordinators in that org
   - If multiple coordinators match, return list; if single, auto-select
   - Add validation error if coordinator outside user's scope: `"Coordinator not in authorized scope"`

---

#### **PHASE 2: Backend API Endpoints (4 sub-steps)**

6. **Standardize Request Endpoints with Authority Filtering**
   - **GET `/api/requests/me`** (✓ exists): Apply authority-based filtering; response includes `grant_reason`; pagination server-side (handle status tokens properly)
   - **GET `/api/requests` (admin only)**: Returns ALL; requires `CAN_READ_REQUESTS` + `authority >= 80`
   - **POST `/api/requests/{id}/review-decision`**: 
     - Validate `CAN_REVIEW_REQUESTS` permission
     - Check `actor.authority >= requester.authority`
     - Accept payload: `{ action: 'accept'|'reject'|'reschedule', notes, proposedDate?, proposedStartTime? }`
     - Call state machine `processAction()`
   - **POST `/api/requests/{id}/confirm`**: 
     - Validate `CAN_CONFIRM_REQUESTS` permission
     - Only requester can call
     - Transitions `REVIEW_RESCHEDULED` → `APPROVED` or `REVIEW_ACCEPTED` → `APPROVED`

7. **Decouple Event Creation from Request**
   - **POST `/api/events`** (for direct event creation by admin/coordinator):
     - Validate `CAN_CREATE_EVENT` permission
     - Body: `{ title, location, startDate, endDate, category, coordinatorId?, stakeholderId? }`
     - If `authority < 80`: Force `coordinatorId = user.id`; restrict stakeholder options
     - Return `{ success, data: {Event_ID, event}, message }`
   - **POST `/api/events/{id}/publish`**:
     - Validate `CAN_PUBLISH_EVENT` OR `CAN_APPROVE_REQUESTS` permission
     - Fetch linked request; verify status eligible for publishing
     - Set `event.Status = 'Completed'`; log audit trail

8. **Add Permission Gates to Routes**
   - Update [events.routes.js](src/routes/events.routes.js): Wrap all POST endpoints with `requirePermission('event', 'create'|'update'|'approve')` middleware
   - Update [requests.routes.js](src/routes/requests.routes.js): Wrap review/confirm endpoints with `requirePermission('request', 'review'|'approve'|'confirm')` middleware
   - Return `403 Forbidden` with `{ reason: 'INSUFFICIENT_PERMISSION', requiredPermission: '...' }` on failure

9. **Implement Coordinator Selection Logic**
   - **POST `/api/requests/{id}/assign-coordinator`** (admin only):
     - List coordinators in `request.organizationId` ∩ `request.municipalityId` coverage
     - If multiple: return list with `isPrimary` flag; require explicit selection
     - If single: auto-assign and notify
     - Validate: `coordinator.authority >= requester.authority` (if applicable)

---

#### **PHASE 3: Frontend Redesign (5 sub-steps)**

10. **Redesign Campaign Request Listing Page**
    - **UI State** (read from API only, not computed locally):
      - `requests: EventRequest[]`
      - `userAuthority: number`
      - `userPermissions: string[]` (e.g., `['CAN_REVIEW_REQUESTS', 'CAN_CREATE_EVENT']`)
      - `filters: {status, search, organization?, coordinator?, dateRange?}`
    - **Visibility Rules** (applied server-side; frontend just displays):
      - Admin (auth ≥ 80): Sees ALL requests with status breakdown counts
      - Coordinator (auth = 60): Sees only org + coverage filtered requests; row count shows filtered subset
      - Stakeholder (auth = 30): Sees only own requests; empty state if none exist
    - **No client-side filtering of status/date**: Server returns only authorized records; UI renders as-is
    - **Pagination**: Server-side via `page` query param; no client-side pagination for lists >100 items

11. **Redesign Campaign Request Details Modal**
    - **Read-Only Fields** (disabled if `userAuthority < requester.authority`):
      - Requester info, created date, request ID
      - Event details: title, category, date, location, organization
      - Coverage area / municipality
      - Assigned coordinator (if any)
      - Assigned stakeholder (if any)
      - Status history: `[{status, actor, timestamp, notes}]`
    - **Decision History Tab**: Show `{action, decidedBy, decidedAt, decision (accept/reject/reschedule), notes, permissionUsed}`
    - **Audit Trail Tab**: Full event log including state transitions, reschedule proposals, confirmations

12. **Dynamic Action Buttons (Permission-Driven)**
    - Fetch `allowedActions` from API `GET /api/requests/{id}/actions`:
      - Returns `{canReview, canApprove, canReject, canReschedule, canConfirm, canDecline, canEdit, canDelete}`
    - **Show buttons ONLY if permission true**:
      - `canReview=true` → Show "Review" button (opens decision modal)
      - `canApprove=true` → Show "Approve" button (confirm modal)
      - `canReschedule=true` → Show "Reschedule" button (date picker modal)
      - `canConfirm=true` → Show "Confirm Reschedule" button (requester only)
      - `canDecline=true` → Show "Decline" button (requester only)
      - `canDelete=true` → Show "Delete" button (admin only)
    - No role-based conditionals; ONLY permission flags determine visibility

13. **Event Creation Modal Redesign**
    - **Multi-Step Form**:
      - Step 1: Event basics (title, category, location, date/time)
      - Step 2: Contact info (email, phone)
      - Step 3: Assignment (coordinator auto-filled if user is coordinator; stakeholder picker filtered to user's orgs)
    - **Coordinator Field Behavior**:
      - If `userAuthority < 80`: Field disabled, auto-populated with current user
      - If `userAuthority >= 80`: Dropdown lists all coordinators; if >1 in same area, show `isPrimary` badge
    - **Stakeholder Dropdown**: Filter to stakeholders in `userOrganizations[].organizationId`; show "No stakeholders available" if empty
    - **On Submit**: POST `/api/requests` or `/api/events` based on user role; handle response with proper error messages

14. **Refactor Event Card Component**
    - Remove `onAcceptEvent`, `onRejectEvent`, `onRescheduleEvent` props (actions now driven by API)
    - Add `request` prop (full object from API)
    - Render actions dynamically:
      ```tsx
      {allowedActions.canReview && <Button onClick={handleReview}>Review</Button>}
      {allowedActions.canReschedule && <Button onClick={handleReschedule}>Reschedule</Button>}
      // ...
      ```
    - On action submission: Call API endpoint, refresh request details, emit `unite:request-updated` event
    - No local action computation; all business logic on backend

---

#### **PHASE 4: Testing & Validation (3 sub-steps)**

**Execution guide:** See [backend-docs/PHASE_4_TEST_RUN_PLAN.md](backend-docs/PHASE_4_TEST_RUN_PLAN.md) for the detailed test runbook aligned to steps 15-17.

15. **Backend Validation Checks**
    - **Test Matrix** (run via seed scripts + manual API calls):
      - Admin (authority 100): Can see ALL requests, can approve any, can reassign coordinators
      - Coordinator (authority 60): Can only see requests for their org + coverage area
      - Stakeholder (authority 30): Can only see own requests; cannot see other stakeholders' requests
      - Permission failures: No `CAN_REVIEW_REQUESTS` → Cannot call review endpoint (403)
      - Authority mismatch: Low-authority coordinator cannot approve high-authority requester (400)
    - **Overlap validation**: Two requests on same date → Second gets warning; can override if admin
    - **Reschedule flow**: Requester submits → Reviewer reschedules → Requester confirms → Event published (verify all state transitions)

16. **Frontend Validation Checks**
    - **UI renders correctly**:
      - Admin sees 100% of test requests; coordinator sees 40% (org-filtered); stakeholder sees 20% (own only)
      - No stale action buttons after update (refresh on POST response)
      - Empty states display correctly for filtered views
    - **Permissions prevent actions**:
      - Low-authority user cannot see "Review" button even if they navigate to detailed request URL
      - Stakeholder form cannot select coordinator outside their orgs
      - Request detail modal "Edit" button disabled if `userAuthority < requester.authority`

17. **E2E Workflow Validation**
    - **Happy path (Admin creates, Stakeholder confirms)**:
      1. Admin creates event request → request.Status = `PENDING_REVIEW`
      2. Coordinator reviews → request.Status = `REVIEW_ACCEPTED`
      3. Requester confirms → request.Status = `APPROVED`, event.Status = `Completed`
      4. Verify audit trail has 3 entries with correct actors and permissions
    - **Unhappy path (Authority mismatch)**:
      1. Stakeholder tries to create request with coordinator assignment outside their org
      2. API returns 400 with `"Coordinator not in authorized scope"`
      3. Frontend displays error; form remains open for correction

---

### **Further Considerations**

1. **Multiple Coordinators Same Municipality Resolution**
   - When System Admin creates request in municipality with 2+ coordinators: Return list sorted by `isPrimary DESC, name ASC`
   - **Option A**: Auto-assign primary; prompt admin if tie
   - **Option B**: Always require explicit selection from dropdown
   - **Recommendation**: Option B (clearer audit trail; admin intent explicit)

2. **Legacy Data Migration**
   - Existing requests may lack `organizationId` or have incorrect `coordinatorId`
   - **Strategy**: Run one-time migration script:
     - For each request: If `organizationId` missing, derive from coordinator's primary org
     - If `coordinatorId` incorrect (not in request.organizationId), reassign to primary coordinator in that org
     - Log CSV of all changes for audit review
   - **Timeline**: Before Phase 3 frontend deployment

3. **Performance at Scale (500+ Requests)**
   - Client-side pagination breaks past 1000 requests (memory + rendering lag)
   - **Strategy**: Implement server-side pagination with explicit status token handling:
     - GET `/api/requests/me?page=2&limit=20&status=PENDING_REVIEW`
     - Backend applies date filter server-side (not client-side)
     - Frontend shows page count + "next/prev" buttons
   - **Fallback**: Keep limit=10000 for users with <100 requests; show warning if result set huge

4. **Permission Caching**
   - Computing allowedActions per request on every page load = O(N) queries
   - **Strategy**: Cache `{ userId, requestId } → allowedActions` for 5 min in Redis
   - Invalidate on any state change (review/confirm/reschedule)
   - **Trade-off**: Slight staleness acceptable for performance gain on coordinator dashboard with 50+ requests
