Plan: Fix Add Event User Loading
TL;DR: Standardize backend user filtering on authority, permissions, organizations[], coverageAreas[]; remove legacy role checks; ensure ObjectId comparisons; add diagnostic logs. On the frontend, confirm API calls, pass the correct context, remove legacy UI gates, and add resilient loading/fallback rendering so System Admin sees all, Coordinators see org+jurisdiction, and Stakeholders see only their allowed scope.

Steps
Map current endpoints and services for user fetches; cross-check with PHASE_2_API_REFERENCE.md and MODELS_REFERENCE.md; note existing checks in authenticate() in authenticate.js and JWT normalization in jwt.js.
Replace legacy role checks with authority + permissions filters; implement unified query helper in users_services (e.g., buildUserScopeFilter() in users_services) that composes org + coverage predicates and correct OR/AND combinations; ensure ObjectId comparisons and arrays (organizations[], coverageAreas[]) are used.
Coordinators endpoint: update controller/service to return all coordinators for System Admin (authority ≥ 80); restrict to same org+coverage for Coordinators (authority = 60); Stakeholders get only their assigned coordinator; add diagnostic logs: counts, applied filters, org IDs, coverage IDs; wire through any validators.
Stakeholders endpoint: update controller/service to return all stakeholders for System Admin; restrict for Coordinators to org+jurisdiction with authority below coordinator; Stakeholders fetch only self; ensure pagination and ObjectId matching; add matching diagnostic logs.
Frontend modal: verify data loading in page.tsx; update API calls via the app’s services under UNITE/services/** to send auth (Authorization: Bearer) and user context (authority, orgs, coverage); remove legacy authority-role UI gating; add loading and fallback rendering when zero results; log diagnostics to console for counts.
Final verification: confirm SysAdmin sees all, Coordinator sees org+jurisdiction only, Stakeholder sees assigned coordinator and self; validate token handling in server.js, confirm authentication flow and CORS; document the behavior briefly in frontend-instruction API_USERS.md.
Further Considerations
Coordinator selection: prefer auto-lock to self, or allow same org+coverage selection — confirm desired UX.
Confirm actual endpoint names/paths used by the modal; adjust validators and routes accordingly.
Consider caching/pagination for large user sets to keep dropdowns responsive.