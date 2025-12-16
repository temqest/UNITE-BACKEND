# GitHub Copilot Instructions — UNITE Backend

Purpose
- Get an AI coding agent productive quickly on the UNITE backend and the Next.js frontend.

Top-level architecture (big picture)
- Backend: Node.js + Express (CommonJS). Entry: [server.js](server.js) — sets up middleware, socket.io, DB, and routes.
- Layers: routes -> controllers -> services -> models. Trace requests in that order.
- Data layer: [src/models/index.js](src/models/index.js) exports Mongoose models.
- Frontend: `UNITE/` is a Next.js TypeScript app that calls backend APIs and listens for socket events.

Files to read first
- [server.js](server.js) — startup, CORS, sockets, DB connection.
- [src/routes/index.js](src/routes/index.js) and route files under [src/routes/].
- Request flow: [src/services/request_services/requestFlowEngine.js](src/services/request_services/requestFlowEngine.js) and [src/services/request_services/requestStateMachine.js](src/services/request_services/requestStateMachine.js).
- Models and helpers: [src/models/index.js](src/models/index.js), `src/utils/`, `src/services/*`.

Repo conventions & patterns
- Backend uses CommonJS: use `require` / `module.exports`. Frontend uses ESM/TS.
- Keep controllers small: validation/auth -> call service -> return response.
- Services house business logic. When changing stateful flows, update both `requestStateMachine` and `requestFlowEngine`.
- Notifications and history are important: services call `Notification.*` and `EventRequestHistory`. Preserve payload shapes.

Integration points
- MongoDB via Mongoose: `MONGO_URI`, optional `MONGO_DB_NAME` (see `.env`).
- AWS S3 helpers: `src/utils/s3` and env vars `S3_BUCKET_NAME`, `AWS_*`.
- Socket.IO: configured in `server.js`; controllers can access `app.get('io')` to emit events.
- Email: SMTP config via `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_PORT`.

Developer workflows
- Start backend (dev): `nodemon server.js` or `node server.js` for single run.
- Start frontend: `cd UNITE && npm run dev`.
- Build frontend: `cd UNITE && npm run build`.
- Seed scripts: `src/utils/seedLocations.js`, `src/utils/createSysAdmin.js`.

Common edit checklist
- When adding a request ACTION/state:
  - add the constant in `requestStateMachine.js` (ACTIONS)
  - add transition in `STATE_TRANSITIONS`
  - update `requestFlowEngine.normalizeAction`, `validateAction`, and `executeTransition` as needed
  - update any notification or history calls that depend on the transition payload

Debugging tips
- CORS & preflight: `server.js` centralizes CORS — check `ALLOWED_ORIGINS` formatting and the production middleware if preflight fails.
- Socket auth failures: inspect the `io.use()` token verification in `server.js`.
- DB connection logs: `mongoose.connection` events are logged in `server.js`.

Why this structure
- Clear separation of concerns (routes/controllers/services/models) keeps business logic testable and services reusable.
- The state-machine + engine ensures consistent, auditable transitions for multi-role request workflows.

If you want more
- I can add: startup logging of effective `ALLOWED_ORIGINS`, or a short cookbook demonstrating exactly how to add a new request action.
Please tell me which to add.
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
