# Copilot / AI Agent Instructions — UNITE Backend

Quick context
- Entry point: `server.js` (Express + Socket.IO). Frontend (Next.js) lives in `UNITE/`.
- Pattern: Routes -> Controllers -> Services -> Models (Mongoose). See `backend-docs/BACKEND_DOCUMENTATION.md` for a full system overview.

Essential things to know (short, actionable):

1. Local start and env
   - Start: `npm run dev` (uses `nodemon server.js`). Production: `npm start`.
   - Required env: at minimum provide `MONGODB_URI` (or `MONGO_URI`/`MONGO_URL`) and `JWT_SECRET`. Optional: `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ALLOWED_ORIGINS`, `MONGO_DB_NAME`.
   - `server.js` performs validations and will exit if no DB URI is present.

2. Data setup & maintenance (examples)
   - Seed roles: `node src/utils/seedRoles.js [--dry-run]`
   - Seed locations: `node src/utils/seedLocations.js [--dry-run]`
   - Create sys admin: `node src/utils/createSysAdmin.js [--dry-run]`
   - Create admin account: `node src/utils/createAdmin.js [--dry-run]`
   - Create indexes: `node src/utils/createIndexes.js`
   - Migrations: `node src/utils/migrateAll.js [--step=N]`

3. Key patterns & conventions
   - Keep controllers thin: move business logic into `src/services/**` (e.g., `src/services/request_services/eventRequest.service.js`).
   - Request validation uses `src/validators/**` and places parsed input on `req.validatedData` — prefer this over `req.body` in controllers.
   - API responses follow `{ success: boolean, message?: string, data?: any, pagination?: { ... } }`.
   - Auth: JWT via `Authorization: Bearer <token>` or an HttpOnly cookie named `unite_user` (see `src/middleware/authenticate.js` and `src/utils/jwt.js`). Token payload normalization includes `role`/`StaffType`.
   - RBAC: Permissions are coded (e.g. `event.create`, `request.review`) and managed by `src/utils/seedRoles.js` and `src/services/users_services/permission.service.js`.

4. Request workflow (state machine)
   - The request workflow uses a state machine. Read and modify behavior in `src/services/request_services/requestStateMachine.js` and `reviewerAssignment.service.js`.
   - If adding states/actions: update `REQUEST_STATES`, `ACTIONS`, and `STATE_TRANSITIONS` in the state machine, and update `STATE_MACHINE_README.md`.

5. Real-time & sockets
   - Socket.IO is initialized in `server.js`. Socket handshake requires a JWT token: `socket.handshake.auth.token` (or `socket.handshake.query.token`). See `server.js` for exact validation code.
   - Controllers/services can access `io` via `app.get('io')` or import chat services from `src/services/chat_services`.

6. External integrations & infra hints
   - S3 helper: `src/utils/s3.js` (AWS SDK v3 — presigned PUT/GET URLs).
   - SendGrid for email: `@sendgrid/mail` dependency.
   - Rate limiter: production-ready implementation exists in `src/middleware/rateLimiter.js.bak`; current `rateLimiter.js` is disabled for development — be cautious when enabling.

7. Tests & CI
   - There are few/no automated tests in the repo. `package.json` defines a `test` script, but referenced files may be missing; prefer manual verification using seed scripts, `createIndexes.js`, and hit API endpoints locally.

8. Code changes & PR guidance
   - Prefer small, focused PRs that update: code + README/docs + `STATE_MACHINE_README.md` when changing request flow.
   - When modifying auth/permission logic, include test seeds (`seedRoles.js`) and demonstrate a sample request + token that proves the change.

Where to look first (quick links):
- Architecture & overview: `backend-docs/BACKEND_DOCUMENTATION.md`
- Entry point & environment checks: `server.js`
- Request flow: `src/services/request_services/STATE_MACHINE_README.md` and `requestStateMachine.js`
- Auth utilities: `src/utils/jwt.js` and `src/middleware/authenticate.js`
- Chat / realtime: `src/services/chat_services` and `src/utils/s3.js`
- Seeds & migrations: `src/utils/seedRoles.js`, `src/utils/seedLocations.js`, `src/utils/createSysAdmin.js`, `src/utils/createAdmin.js`, `src/utils/migrateAll.js`

If anything here looks incomplete or you want more coverage on tests/CI, tell me which area to expand and I'll iterate. ✅
