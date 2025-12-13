# GitHub Copilot Instructions — UNITE Backend

Purpose
- Help an AI coding agent become productive quickly in this repository: backend API (Node/Express) and the UNITE Next.js frontend.

Big picture (what to read first)
- Backend entry: [server.js](server.js) — starts Express app and loads `src/*` modules.
- API layers: routes -> controllers -> services -> models. See [src/routes](src/routes) and [src/controller](src/controller).
- Data layer: [src/models/index.js](src/models/index.js) exports Mongoose models used across services.
- Frontend: [UNITE](UNITE) is a Next.js TypeScript app; it talks to the backend over HTTP.

Critical patterns and conventions
- CommonJS modules in backend (use `require` / `module.exports`). Frontend is TS/ESM.
- Services encapsulate business logic (e.g., [src/services/request_services](src/services/request_services)). Controllers call services and pass request/actor context.
- Use central helpers in [src/services/request_services/requestFlow.helpers.js] for constants like `REVIEW_DECISIONS` and status mappings.
- State-driven request handling: the request flow lives in
  - [src/services/request_services/requestStateMachine.js] — single source of truth for allowed actions/transitions and role rules.
  - [src/services/request_services/requestFlowEngine.js] — processes actions, records decisions, updates events and notifications.
  Update both when adding actions or states (ACTIONS, REQUEST_STATES, STATE_TRANSITIONS).

Common integration points to watch
- Notifications: `Notification.createAdminActionNotification(...)` (used from services). Update message params carefully.
- Audit/history: `EventRequestHistory` methods are used to log status changes and decisions — maintain shape of logged payloads.
- Models used in services: `EventRequest`, `Event`, `SystemAdmin`, `BloodbankStaff` are resolved via [src/models/index.js].

Developer workflows & commands
- Start backend: run `nodemon server.js` (or `node server.js` for one-shot). Backend reads `.env` (see `.env` keys like `MONGO_URI`, `PORT`).
- Start frontend: `cd UNITE && npm run dev`.
- Quick JS syntax check: `node -c <file>` (used during debugging to catch syntax errors fast).
- Seed data scripts: see [src/utils/seedLocations.js] and [src/utils/createSysAdmin.js]. Run manually against `MONGO_URI`.

Project-specific guidance for AI edits
- To add a new request action: add constant in ACTIONS, add transition in `STATE_TRANSITIONS` (requestStateMachine), and add handling in `requestFlowEngine.normalizeAction`, `validateAction` and `executeTransition` as required.
- Role normalization: use `RequestStateMachine.normalizeRole()` consistently when checking permissions.
- When changing request flow rules, update both allowed-actions logic in `getAllowedActions()` and the transition map in `STATE_TRANSITIONS` to keep behavior predictable.
- For actor identity, services often call `RequestFlowEngine.setBuildActorSnapshotFn(fn)` — ensure tests or controllers set this before calling `processAction`.

Debugging tips
- Add targeted `console.log` entries in `requestFlowEngine.processAction` to dump `actionInput`, `action` (normalized), `currentState`, and `isRequester/isReviewer` decisions.
- If a UI action maps to the wrong state/action, inspect `normalizeAction()` in `requestFlowEngine.js` and role logic in `requestStateMachine.js`.
- Use `Event` and `EventRequest` documents to reproduce flows; `rescheduleProposal` shape is important when diagnosing reschedule loops.

Files to open first when troubleshooting requests
- [src/services/request_services/requestFlowEngine.js](src/services/request_services/requestFlowEngine.js)
- [src/services/request_services/requestStateMachine.js](src/services/request_services/requestStateMachine.js)
- [src/controller/request_controller] (controllers reference services)

Notes
- There are no automated tests in this repository; prefer small, manual end-to-end checks when modifying flows.
- Preserve existing logging and history events when changing behavior; many downstream notification behaviors depend on those records.

If something is unclear or you want this file extended with examples (e.g., a short cookbook for adding a new action), tell me what area to expand.
