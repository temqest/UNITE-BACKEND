# Phase 4 Test Run Plan (Final Validation)

**Date:** 2025-12-26  
**Owner:** QA / Engineering  
**Scope:** End-to-end validation of the redesigned Request + Event system using unified endpoints, authority hierarchy, and permission gates.

---

## Objectives
- Verify production readiness of request and event workflows after Phases 1-2 backend changes.
- Validate authority-based visibility, permission enforcement, and state machine transitions.
- Confirm UI surfaces correct actions based on server-provided permissions.
- Capture evidence (responses, screenshots, logs) for audit and release sign-off.

## Environments
- **Backend:** Node/Express (`server.js`) with MongoDB
- **Frontend:** Next.js app in `UNITE/`
- **Start commands:** `npm run dev` (backend), `npm run dev` in `UNITE/` (frontend)
- **Required env:** `MONGODB_URI` (or `MONGO_URI`/`MONGO_URL`), `JWT_SECRET`; optional AWS/S3 vars as needed

## Test Data Setup
- Seed or create 5 users with authorities: 100 (SysAdmin), 80 (OpAdmin), 60 (Coordinator), 30 (Stakeholder), 20 (Basic)
- Create 3 organizations and 3 municipalities with coverage overlap
- Create 10+ requests spanning orgs/municipalities; at least 3 linked events
- Ensure at least 2 coordinators share one municipality to test selection logic

## Tooling & Evidence
- Use curl/Postman for API calls; browser for UI validation
- Log raw API responses (JSON) and headers for failures
- Capture screenshots for UI visibility/action button checks
- Record audit trail documents for key flows (statusHistory, decisionHistory)

## Execution Order (map to todo items)
1) **Backend Validation (15.x)**
   - 15.1 Authority Filtering
   - 15.2 Permission Checks
   - 15.3 Authority Hierarchy
   - 15.4 Field Locking
   - 15.5 State Transitions
   - 15.6 Audit Trails

2) **Frontend Validation (16.x)**
   - 16.1 Authority-Based Visibility
   - 16.2 Permission-Based Action Buttons
   - 16.3 Field Restrictions in Form
   - 16.4 Empty State Rendering
   - 16.5 Error Handling

3) **E2E Workflows (17.x)**
   - 17.1 Happy Path
   - 17.2 Reschedule Path
   - 17.3 Authority Mismatch
   - 17.4 Permission Denied
   - 17.5 Coordinator Selection

## Evidence to Capture
- API responses with `success`, `reason`, `grant_reason`, `actor_authority`
- statusHistory and decisionHistory entries for each transition
- UI screenshots of visibility/action buttons per user type
- Error modals with reason codes for negative tests

## Exit Criteria
- All 16 planned tests pass (15.x, 16.x, 17.x)
- No unhandled errors in backend logs
- No broken UI states or crashes; error modals shown for 4xx
- Audit trails present for every state transition and decision
- Performance: median API latency < 500ms on dev data set

## Owner Checklist
- [ ] Env configured with DB + JWT
- [ ] Seed data loaded (5 users, 3 orgs, requests/events)
- [ ] Access tokens issued for each test user
- [ ] Evidence folder created for screenshots/logs
- [ ] Todo list updated as tests complete

## Notes
- Coordinator selection logic: when multiple matches, expect sorted list (isPrimary DESC, name ASC); when single match, auto-assign.
- Field locking: non-admin event creation forces coordinatorId=self and rejects out-of-scope stakeholders.
- Authority hierarchy: reviewer.authority must be >= requester.authority unless sysadmin (100).
