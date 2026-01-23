# UNITE Frontend System Guide

Last updated: January 2026

## 1) System Overview & Tech Stack
- Framework: Next.js 14 (App Router)
- Language: TypeScript (strict)
- UI: HeroUI v2, Tailwind CSS 4, Tailwind Variants
- Animation: Framer Motion
- Theming: next-themes
- Realtime: socket.io-client
- Calendar: FullCalendar (core, daygrid, timegrid, interaction)
- Dates: date-fns, @internationalized/date
- PDF/Export: jspdf, html2canvas
- Icons: lucide-react, @gravity-ui/icons

## 2) Project Structure (top-level)
- app/ — routes, layouts, pages (App Router)
- components/ — reusable UI, modals, layouts, feature components
- config/ — site metadata, theme, fonts
- contexts/ — React Context providers (Chat, etc.)
- docs/ & deliverables/ — documentation, diagrams
- hooks/ — custom hooks for data and UI state
- lib/ & services/ — API client helpers and feature services
- public/ — static assets
- styles/ — global styles (Tailwind entry)
- types/ — shared TypeScript types
- utils/ — helper utilities (auth, permissions, formatting)

## 3) Routing & Layout (app/)
- app/layout.tsx — root layout, providers
- app/page.tsx — landing/home
- app/auth/* — auth flows
- app/dashboard/* — main app shell pages
- app/calendar/* — calendar views
- app/about/* — marketing/about
- app/error.tsx — error boundary UI

## 4) Key Components (components/)
- campaign/ — event creation modals and campaign UI
- calendar/ — calendar widgets/views
- chat/ — chat UI building blocks
- layout/ — nav, sidebar, shell components
- modals/ — shared modal patterns
- providers/ — context/provider wrappers
- settings/, coordinator-management/, stakeholder-management/ — feature UIs
- tools/ — shared tools (e.g., date pickers)
- ui/ — design-system primitives (buttons, inputs, cards)

## 5) Contexts (contexts/)
- ChatContext.tsx — chat state, presence, sockets
- Other contexts are registered via components/providers and app/layout

## 6) Hooks (hooks/)
- useCurrentUser, useSignIn, useEventUserData — auth/user/event helpers
- useCalendarExport — calendar export flows
- useCoverageAreas, useLocations, useLocationsOptimized — location data
- useNotificationPreferences — notification settings
- useRoles, useSettings, useSidebarNavigation — UI/state helpers
- useStakeholderManagement, useCoordinatorManagement — management flows

## 7) Services & API Access
- services/ (TypeScript): chatService.ts, coordinatorService.ts, stakeholderService.ts
- utils/fetchWithAuth.ts, fetchWithRetry.ts, secureFetch.ts — fetch wrappers with token handling and retry
- utils/requestDeduplication.ts, requestCache.ts — client-side request coalescing and caching
- utils/tokenManager.ts, decodeJwt.ts — token utilities
- utils/permissionUtils.ts, role-utils.ts, eventActionPermissions.ts — RBAC helpers aligned with backend permission codes
- Backend base URL from env: NEXT_PUBLIC_API_URL

## 8) State & Data Patterns
- Primary data via React Query–like patterns using custom hooks + fetch wrappers
- Context for chat/presence; hook-based local state for forms/modals
- Request caching/deduplication utilities to reduce duplicate API calls

## 9) Styling & Theming
- Tailwind CSS 4 with global styles in styles/globals.css
- HeroUI components themed via next-themes; config/theme.ts for tokens
- Fonts configured in config/fonts.ts

## 10) Realtime (Socket.IO)
- socket.io-client used for chat, presence, notifications
- Token passed from frontend auth utilities; mirrors backend socket auth (Authorization bearer or handshake auth)

## 11) Calendar & Exports
- FullCalendar for calendar views (daygrid, timegrid, interaction)
- useCalendarExport hook; html2canvas + jspdf for PDF/export flows

## 12) Auth Flow (frontend)
- Login: app/auth routes using useSignIn + services
- Tokens managed via tokenManager + secureFetch; decodeJwt for client claims
- Guards implemented in fetch wrappers and conditional UI rendering based on permissions (permissionUtils)

## 13) RBAC on Client
- permissionUtils, role-utils, eventActionPermissions map backend permission codes to UI capabilities
- UI gates: hide/disable actions if permission not present; avoid client-only enforcement—backend is source of truth

## 14) Error Handling & UX
- Global error boundary: app/error.tsx
- Fetch wrappers implement retry/backoff (fetchWithRetry)
- User-facing errors surfaced via toasts/dialogs in feature components

## 15) Build, Run, Lint
- Dev: npm run dev (Next.js with Turbopack)
- Build: npm run build
- Start: npm start
- Lint: npm run lint (eslint --fix)

## 16) Environment Variables (frontend)
- NEXT_PUBLIC_API_URL — backend base URL
- (Add others as needed for analytics/storage; keep secrets server-side)

## 17) Performance Notes
- Use requestDeduplication/requestCache for repeated GETs
- Prefer incremental rendering via React Server Components (App Router) where applicable
- Keep memoization for heavy lists/tables; leverage Suspense/streaming where supported

## 18) Testing (manual focus currently)
- No automated frontend tests noted; validate via pages and flows:
  - Auth login/logout
  - Dashboard data fetch
  - Calendar load and navigation
  - Event creation modals (training/blood drive/advocacy)
  - Chat send/receive with sockets
  - Role-gated actions (buttons/menus hidden when lacking permission)

## 19) File Uploads & Assets
- Public assets in /public
- File uploads to backend S3 flow via backend presigned URLs (match backend s3.js contract)

## 20) How to Extend Safely
- Add APIs: create a service function (services/*) + hook; use secureFetch
- Add UI: build in components/ui or feature folder; wire to app route
- Add permissions: sync with backend permission codes; gate UI via permissionUtils
- Add env: declare in .env.local and reference via NEXT_PUBLIC_*; rebuild required

## 21) Useful Paths (relative)
- Root: UNITE/
- Pages & layouts: app/
- Feature components: components/
- Hooks: hooks/
- Services: services/
- Utilities: utils/
- Types: types/
- Config: config/
- Styles: styles/globals.css

Use this document as LM context for the UNITE frontend: stack, structure, data access patterns, realtime, and extension guidelines.
