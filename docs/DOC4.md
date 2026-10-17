# DOC 4 — Vibecoding Build Guide: MessPulse

**Status:** Draft for sign-off · **Builds on:** DOC 1 (features), DOC 2 (architecture), DOC 3 (modules)
**Phasing (Oct 2026 decision):** **Phase 1 = Steps 1–15** (MVP, release `v1.0-mvp`). **Phase 2 = Steps 16–28** (every SHOULD + COULD feature; §4.1b). Phase 2 is gated: it starts only after Step 15 and Checkpoint 4 pass and Nilesh sets CONTROLLER `PHASE: 2`.
**Audience:** (1) you, to know what to do next without re-reading three documents; (2) an AI coding agent, which must build *exactly* this and nothing else.

---

## 4.0 — Project Context Snapshot  *(copy-paste as the opening context of any agent session)*

```
PROJECT: MessPulse
TAGLINE: Real-time mess crowd and kitchen-demand platform for hostel students and mess staff — no new hardware.

WHAT WE'RE BUILDING:
  A PWA (/student, /staff, /admin) plus a Node API and a Python vision script. The vision script counts
  people at the mess entrance with YOLOv8n and posts only integers to the API. Students see live occupancy,
  an estimated wait and best arrival windows, and optionally check in (one tap) to create a short-lived
  session. Staff get calm, exception-only alerts (tray depletion). Admin sees analytics and controls.
  A built-in simulator makes the whole system demoable without a real crowd.

STACK (exact choices — pin MAJOR versions, lockfile pins exact; NEVER substitute or upgrade majors mid-build):
  Frontend:    React 18 · Vite 5 · TypeScript 5 (strict) · Tailwind CSS 3 · React Router 6 ·
               @tanstack/react-query 5 · socket.io-client 4 · Recharts 2 · qrcode.react 4 · vite-plugin-pwa
  Backend:     Node 20 LTS · Express 4 · TypeScript 5 (strict) · zod 3 · pino 9 · socket.io 4 ·
               jsonwebtoken 9 · bcryptjs 2 · express-rate-limit 7 · resend (mail)
  Data:        Redis 7 via ioredis 5 (live state) · MongoDB 7 via mongoose 8 (history/config/users)
  Vision:      Python 3.11 · ultralytics (YOLOv8n + ByteTrack) · opencv-python · requests · pytest
  Testing:     Vitest 2 · Supertest · @testing-library/react · pytest · (Playwright optional)
  Deployment:  One Node service (API + Socket.io + static web build) on Railway/Render; Atlas M0; hosted Redis;
               vision script runs on a laptop/edge box. Demo fallback: docker compose + tunnel.
  Monorepo:    npm workspaces: apps/api, apps/web, packages/shared, services/vision
  Phase 2 adds (Steps 23–24 only, majors pinned at install): web-push · multer · sharp · @aws-sdk/client-s3

ARCHITECTURE IN ONE LINE:
  Vision script → POST /api/v1/mess/live-count → API (routes → services → pure core/ + ports ← infra adapters)
  → Redis/Mongo; services publish typed events → RealtimeGateway → Socket.io rooms → React views.

CORE PRINCIPLES TO FOLLOW:
  - All business rules live in apps/api/src/core/ as pure functions (no I/O, no Date.now, no framework imports).
  - Routes only validate (zod) and call one service method. Services orchestrate. Infra implements ports.
  - Modules never import each other's repositories; they use ports or the event bus (apps/api/src/infra/event-bus.ts).
  - Only apps/api/src/container.ts constructs concrete classes. Only infra/redis/* knows Redis key names.
  - Only RealtimeGateway (modules/realtime) touches Socket.io on the server.
  - React components render only; data access lives in hooks (features/*/hooks) and lib/; UI never computes
    occupancy level, wait time, or decay — it renders the server's StatusSnapshot.
  - All time = epoch ms internally, units in names (…Sec, …Min); time comes from Clock, never Date.now().
  - Session semantics: expected stay S = (base + demand)·60 + queueWaitSec; weight 1.0 before S, then 0.60 until
    S+8 min, 0.25 until S+17 min, 0 after (hard expiry = S+17 min, capped by maxSessionMin). See DOC3 §3.0.
  - Camera is ground truth; sessions are an opt-in layer. Frames/faces never leave the vision script.
  - Phase gate: work only on features of the current PHASE (CONTROLLER). Phase 2 modules plug into existing seams
    (ports, event bus, AlertRule, settings-as-data) — never edit Phase 1 internals to fit them.

MVP FEATURES (in build order):
   1. Vision feasibility spike (line-crossing counter on a recorded clip)
   2. Monorepo scaffold, shared contracts, base infra
   3. Pure domain core (timing, decay, occupancy, geofence, tray, windows, otp)
   4. Store ports + Redis/in-memory implementations
   5. Mongo repositories + seed
   6. Auth and roles (M7)
   7. Ingest endpoint + vision reporter (M1)
   8. Occupancy service, status API, realtime gateway (M2 backend, M4)
   9. Sessions: check-in, timing, decay, reaper (M3 backend)
  10. Demo simulator (M8)
  11. Web scaffold + auth screens + Student live view (M2 UI)
  12. Student check-in UI (M3 UI)
  13. Alerts + Staff controller (M5)
  14. Admin API + UI + check-in QR (M6)
  15. Demo hardening and deployment            ← end of Phase 1 (tag v1.0-mvp)

PHASE 2 FEATURES (steps 16–28; ONLY after Phase 1 passes Checkpoint 4 and CONTROLLER says PHASE: 2):
  16. Phase 2 foundation  17. Opt-out  18. Ratings + dish votes  19. Waste ledger + prep advisor
  20. Batch-quality + unaccounted-entries alert rules  21. Timetable, wave, forecast, nudge
  22. Split queues  23. Web push  24. Hygiene reports + tray holds  25. DPS + demand calibration
  26. Rebates + fast pass  27. Random audit + device flag  28. Phase 2 hardening and release
```

---

## 4.1 — Build Sequence

**Ordering logic:** *Risk first* (Step 1: can YOLOv8n count at this camera angle?), *dependency next* (pure core → ports → repos → auth → ingest → occupancy → sessions), *demo value early* (simulator at Step 10 so every UI step is built against realistic moving data), *polish last*.

### Cut lines (decide now, not at 3 a.m.)  `[ASSUMPTION: ~30 agent-assisted hours sequential; 2–4 people in parallel]`

| Cut | After step | What you can demo if you must stop here |
|---|---|---|
| **A — Live Skeleton** | 11 | Camera/simulator → live student gauge + wait time, with login |
| **B — Check-in** | 12 | + one-tap check-in sessions with decay |
| **C — Staff** | 13 | + calm staff screen with tray-depletion alert |
| **D — Full MVP** | 14 | + admin analytics, settings, QR, simulator controls |
| **Step 15** | — | Non-negotiable regardless of cut: README, demo script, deploy/fallback |

*If behind schedule, cut in this order:* admin History tab → admin settings fields beyond capacity/servicePerMin/demandFactor → staff chime → best-windows (use the static baseline) → seeded history. Never cut tests on `core/`.

**Parallel lanes (optional, for 2–4 people):** Lane V (vision): Step 1, then the Python half of Step 7. Lane B (backend): Steps 2→6, 7 (API half), 8, 9, 10. Lane W (web): starts Step 11 once Step 8 is verified (contracts frozen). Each lane keeps its **own copy of CONTROLLER state**; merge via PRs after each checkpoint.

---

**BUILD STEP 1: Vision Feasibility Spike**
- **Reference:** DOC3 → §3.2 (Python structure, `LineCrossingCounter`); DOC1 → §1.6 (A2, A3 assumptions).
- **What to build:** Create `services/vision/` with `requirements.txt` (pinned), `config.py`, `capture.py` (file/webcam/RTSP frame iterator), `detector.py` (`PersonTracker` wrapping Ultralytics YOLOv8n `.track()` with ByteTrack, returns `TrackedPerson(id,cx,cy)`), `line_counter.py` (`LineCrossingCounter` — pure, hysteresis + min-track-frames + eviction), `spike.py` (CLI: `--source clip.mp4 --line x1,y1,x2,y2 --entry-side left|right --stride 2`; prints running in/out/net every 5 s and writes an optional annotated preview video), `tests/test_line_counter.py`. **No HTTP, no DB, no frames saved by default.**
- **Folder/file targets:** `services/vision/**`, `docs/spike-results.md`.
- **Agent prompt hint:** "Implement only the YOLOv8n + ByteTrack people tracker and the pure `LineCrossingCounter` from DOC3 §3.2, with a CLI that prints counts from a video file. No networking."
- **Done when:** (a) `pytest services/vision` passes: clean in-crossing, clean out-crossing, jitter around the line = 0 counts, track appearing on the far side = 0, two simultaneous tracks, stale-track eviction; (b) on a ~5-minute recorded entrance clip with a manual count, net-count error ≤ ±10% (±20% = pass-with-risk, record it); (c) ≥ 8 effective FPS on the team laptop CPU at the chosen `imgsz`/`stride`; (d) numbers and chosen settings recorded in `docs/spike-results.md`.
- **If the spike fails** (> ±20% after ~90 min of tuning camera angle/line/stride): set BLOCKED and decide — reshoot clip from a higher/oblique angle, switch to `frameCount` (in-frame) mode for the demo, or reduce the accuracy claim in the pitch. Do **not** swap the model silently.
- **Common drift to watch for:** Agent will add posting to the API, a GUI window, face blurring, or switch to another detector. Resist; this step is only "can we count".

---

**BUILD STEP 2: Monorepo Scaffold, Shared Contracts, Base Infra**
- **Reference:** DOC2 → §2.1 (repo layout), §2.5 (12-factor, naming); DOC3 → §3.1 (source tree, import rules, shared contracts, error model).
- **What to build:** npm workspaces root (`package.json`, `tsconfig.base.json` with `strict`, `eslint.config` with `no-restricted-imports` implementing the DOC3 §3.1 import matrix, prettier), `.env.example` (all vars from §4.4), `docker-compose.yml` (redis:7, mongo:7), `.github/workflows/ci.yml` (install → typecheck → lint → test with Redis/Mongo service containers). `packages/shared`: zod schemas + inferred types for `Role`, `LiveCountPayload`, `StatusSnapshot`, `SessionDTO`, `AlertDTO`, `SettingsDTO` (+ `SettingsPatchSchema`), `SocketEvents`. `apps/api/src`: `config.ts` (zod-validated env, fail fast), `shared-kernel/errors.ts` (`AppError` + `ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `DependencyUnavailableError`), `infra/logger.ts` (pino + PII redaction), `infra/clock.ts` (`SystemClock`, `SwitchableClock`), `infra/event-bus.ts` (typed, handler-isolated), `core/ports.ts` (interfaces from DOC3 §3.1), `app.ts` (request-id, JSON parser, error middleware, `/healthz`, `/readyz` stub), `server.ts`, `container.ts` (empty composition root).
- **Folder/file targets:** repo root, `packages/shared/src/**`, `apps/api/src/{config,app,server,container}.ts`, `apps/api/src/{shared-kernel,infra,core}/**`, `docker-compose.yml`, `.github/workflows/ci.yml`.
- **Agent prompt hint:** "Create the workspace scaffold and the shared contracts exactly as in DOC3 §3.1. No routes beyond /healthz, no domain logic, no UI."
- **Done when:** `docker compose up -d` starts Redis+Mongo; `npm run typecheck && npm run lint && npm test` pass at root; `GET /healthz` → `200`; a throwaway file in `core/` that imports `express` **fails lint** (then delete it); app refuses to boot with a missing required env var and says which.
- **Common drift to watch for:** Agent will add NestJS/Prisma/tRPC, loosen `strict`, add example routes or "helpful" utilities, or put types in `apps/api` instead of `packages/shared`.

---

**BUILD STEP 3: Pure Domain Core**
- **Reference:** DOC3 → §3.0 (#1 TTL/decay correction), §3.3 (occupancy functions), §3.4 (timing/decay/geofence), §3.5 (selectOccupancy), §3.6 (tray), §3.8 (otp).
- **What to build:** In `apps/api/src/core/`: `timing.ts` (`computeSessionTiming`), `decay.ts` (`sessionWeight`, `sumSessionWeights`), `occupancy.ts` (`estimateWaitMin`, `waitRange`, `occupancyLevel`, `smoothEma`, `selectOccupancy`, `calibrationRatio`), `geofence.ts` (`evaluateGeofence`), `tray.ts` (`evaluateTrayDepletion`), `windows.ts` (`suggestBestWindows`) + `baseline-profile.json` (static lunch-wave), `otp.ts` (`generateOtp`, `hashOtp`, `verifyOtpHash`). Table-driven Vitest tests beside each file.
- **Folder/file targets:** `apps/api/src/core/*.ts`, `apps/api/src/core/baseline-profile.json`, tests.
- **Agent prompt hint:** "Implement the pure functions listed in DOC3 for core/ only — signatures exactly as specified, `now` passed as a parameter, no imports outside core/ and packages/shared. Write the tests first."
- **Done when:** `npm test -w apps/api -- core` is green with **100% branch coverage on `core/`** (enforced by a Vitest coverage threshold); boundary cases exist for `sessionWeight` at `S−1 s`, `S`, `S+7:59`, `S+8:00`, `S+16:59`, `S+17:00`, and `maxSessionMin`; `estimateWaitMin` handles zero service rate and overflow; `selectOccupancy` tested at 29/30/31 s staleness.
- **Common drift to watch for:** Agent will use `Date.now()`, read env/settings directly, import from `infra/`, or "improve" decay by reverting to the original fixed 18/26/35 brackets. The semantics are DOC3 §3.0 #1.

---

**BUILD STEP 4: Store Ports and Redis / In-Memory Implementations**
- **Reference:** DOC2 → §2.3 (Redis key table); DOC3 → §3.1 (ports), §3.4 ("Redis store (hidden detail)").
- **What to build:** `infra/memory/{session-store,entry-velocity-store,camera-reading-store,otp-store}.memory.ts` and `infra/redis/{…}.redis.ts` implementing the ports in `core/ports.ts`. Session timing is encoded in the ZSET member (score = `expiresAt`); `start` uses `SET NX`; `removeExpired` is a single `MULTI`. Put a shared **contract test suite** in `apps/api/src/testing/session-store.contract.ts` and run it against **both** implementations.
- **Folder/file targets:** `apps/api/src/infra/{memory,redis}/**`, `apps/api/src/testing/**`.
- **Agent prompt hint:** "Implement the four store ports for Redis and in-memory. Key names and member encoding stay private to infra/redis. Do not use Redis keyspace notifications."
- **Done when:** the contract suite passes for memory **and** Redis (CI uses the Redis service container); `start` twice for the same user+meal → `'already_active'`; `removeExpired` returns only elapsed sessions and removes them; `listActive` returns only unexpired; no file outside `infra/redis/` contains the string `mp:`.
- **Common drift to watch for:** Agent will enable keyspace-notification-based expiry, per-session HGETs in `listActive`, leak key names into services, or add a caching layer.

---

**BUILD STEP 5: Mongo Repositories and Seed**
- **Reference:** DOC2 → §2.3 (Mongo entities, indexes, retention); DOC3 → §3.1 (ports).
- **What to build:** Mongoose models + repository classes returning **plain typed objects** (never documents) for `User`, `MessSettings`, `Meal`, `CheckIn`, `OccupancySnapshot`, `Alert` — fields exactly as DOC2 §2.3 (`sessionId` unique on `CheckIn`, `expectedStaySec`, `hardExpirySec`, `geofence` tri-state, `decay.tail`, `maxSessionMin`). Indexes: unique `User.email`, unique `Meal(messId,mealId)`, `CheckIn(mealId,checkedInAt)`, `OccupancySnapshot(messId,ts)`, `Alert(messId,raisedAt)`; TTL indexes for retention. `scripts/seed.ts` (idempotent): default settings, today's lunch+dinner meals, a staff and an admin user (bcrypt PIN from env), baseline profile data.
- **Folder/file targets:** `apps/api/src/infra/mongo/{models,*.repository.ts}`, `apps/api/scripts/seed.ts`, `apps/api/src/core/ports.ts` (add repository interfaces).
- **Agent prompt hint:** "Create Mongoose models and repositories exactly per DOC2 §2.3 field names. Repositories return plain objects. Add the seed script. No new fields."
- **Done when:** `npm run seed` twice → no duplicates; repository integration tests pass against real Mongo; a manual diff of model fields vs DOC2 §2.3 shows **zero** extra or renamed fields; no Mongoose document type is exported outside `infra/mongo`.
- **Common drift to watch for:** Agent will add "convenience" columns, rename fields, return Mongoose docs to services, or skip indexes.

---

**BUILD STEP 6: Auth and Roles (M7)**
- **Reference:** DOC3 → §3.8; DOC2 → §2.2 decision 5 (auth), §2.4 (auth endpoints).
- **What to build:** `modules/auth/{token.service,auth.service,auth.middleware,auth.routes,auth.ports}.ts`, `infra/mail/{console.mailer,resend.mailer}.ts`, rate limiting with `express-rate-limit` (in-memory). Endpoints: `POST /api/v1/auth/otp/request` (always 202), `/otp/verify`, `/staff/login`, `GET /auth/me`. Middleware: `requireAuth`, `requireRole(...)`, `requireIngestKey` (constant-time). Wire in `container.ts`; mount routes in `app.ts`.
- **Folder/file targets:** `apps/api/src/modules/auth/**`, `apps/api/src/infra/mail/**`, `apps/api/src/{app,container}.ts`.
- **Agent prompt hint:** "Implement email-OTP and PIN auth per DOC3 §3.8 with TokenService as the only JWT code. ConsoleMailer for dev/demo. No UI, no OAuth, no refresh tokens."
- **Done when:** OTP flow works end-to-end with `ConsoleMailer`; 5 wrong codes → 429 lock; non-allowed domain still returns `202` and sends nothing; staff PIN login returns a staff token; **role matrix integration test**: student token on a staff-only test route → 403, no token → 401, ingest key on a user route → 401.
- **Common drift to watch for:** Agent will reach for Passport/NextAuth/Clerk/Firebase, add a registration screen, store tokens in a DB table, or return different errors for "email not found".

---

**BUILD STEP 7: Ingest Endpoint and Vision Reporter (M1)**
- **Reference:** DOC3 → §3.2; DOC2 → §2.4 (`POST /mess/live-count`), §2.3 data flow steps 1–2.
- **What to build:** `modules/ingest/{ingest.routes,ingest.service,ingest.ports}.ts` — `IngestService.recordReading` (seq check, counter-reset handling, baseline capture window, writes `CameraReadingStore` + `EntryVelocityStore`, publishes `reading.recorded`). Python: `services/vision/reporter.py` (`ReadingReporter`: `seq`, 3 s timeout, backoff + jitter, bounded `deque(100)` flushed oldest-first, exits on 401), `main.py` (wires capture → tracker → counter → reporter), config from env/CLI.
- **Folder/file targets:** `apps/api/src/modules/ingest/**`, `apps/api/src/container.ts`, `services/vision/{reporter,main,config}.py`, `services/vision/tests/test_reporter.py`.
- **Agent prompt hint:** "Implement the ingest endpoint (no occupancy math, no sockets) and the Python reporter with retry/buffer. Reuse the Step 1 counter unchanged."
- **Done when:** `main.py` on the recorded clip updates the latest reading in Redis every ~5 s; duplicate/older `seq` → `{ignored:true}`; missing/bad key → 401; invalid body → 422; killing the API for 30 s then restarting → reporter flushes buffered readings in order; restarting the script mid-run is treated as a counter reset (unit-tested).
- **Common drift to watch for:** Agent will compute occupancy or wait time in ingest, emit socket events directly, write to Mongo per POST, or store frames.

---

**BUILD STEP 8: Occupancy Service, Status API, Scheduler, Realtime Gateway (M2 backend + M4)**
- **Reference:** DOC3 → §3.3, §3.5; DOC2 → §2.3 data flow steps 5–9, §2.2 decision 6 (snapshots, throttle).
- **What to build:** `modules/occupancy/{occupancy.service,occupancy.routes,occupancy.ports}.ts` (`tick(now)`, `getLatest`, settings/meal 30 s cache, snapshot save every 30 s), `infra/scheduler.ts` (named jobs with try/catch + log: occupancy tick 1 s, snapshot 30 s; started **only** in `server.ts`), `modules/realtime/{realtime.gateway,socket-auth}.ts` (rooms `student|staff|admin`, JWT handshake, throttled ≤1/s `status:update`, `camera:health`), `GET /api/v1/mess/:messId/status`, `scripts/watch-status.ts` (CLI socket client that prints updates).
- **Folder/file targets:** `apps/api/src/modules/{occupancy,realtime}/**`, `apps/api/src/infra/scheduler.ts`, `apps/api/scripts/watch-status.ts`, `apps/api/src/{server,container}.ts`.
- **Agent prompt hint:** "Implement OccupancyService.tick using only core/ functions and ports, and the RealtimeGateway as a pure event subscriber. No sessions logic yet; sessions list may be empty."
- **Done when:** posting readings (Step 7) changes `GET /status` within one tick; `watch-status` prints `status:update` ≤ 1/s with identical shape to the REST response (zod-parsed); stop posting for 31 s → `stale:true`, `source:'sessions'`; unauthenticated socket handshake is rejected; `/readyz` reports Redis+Mongo.
- **Common drift to watch for:** Agent will emit socket events from services, recompute on every GET, put math in the service instead of `core/`, or start building the UI.

---

**CHECKPOINT 1** — after Steps 7–8 (see §4.3).

---

**BUILD STEP 9: Sessions Backend (M3)**
- **Reference:** DOC3 → §3.4 (all); DOC3 → §3.0 #1–#4; DOC2 → §2.4 sessions endpoints.
- **What to build:** `modules/sessions/{sessions.routes,sessions.service,meal-token,sessions.ports}.ts` — `checkIn` (verify token → resolve meal/settings → `evaluateGeofence` → `startSession`), `startSession` (single creation path; `QueueWaitProvider` from `OccupancyService` injected in `container.ts`), `endEarly`, `reapExpired`; `CheckInRepository.archive` (batched); reaper job (5 s) added to the scheduler; endpoints `POST /sessions`, `GET /sessions/me/active`, `DELETE /sessions/me/active`; `scripts/print-checkin-url.ts` (prints a check-in URL with a signed token for the current meal).
- **Folder/file targets:** `apps/api/src/modules/sessions/**`, `apps/api/src/infra/mongo/check-in.repository.ts`, `apps/api/src/infra/scheduler.ts`, `apps/api/src/container.ts`, `apps/api/scripts/print-checkin-url.ts`.
- **Agent prompt hint:** "Implement sessions exactly per DOC3 §3.4. Sessions must not import the occupancy module; use the QueueWaitProvider port. Never persist lat/lng."
- **Done when:** `POST /sessions` with a valid token → `201 SessionDTO`; again → `409 ALREADY_CHECKED_IN`; expired/invalid token → `422 MEAL_TOKEN_INVALID`; fake-clock service tests show weight 1.0 → 0.60 → 0.25 → archived as `expired`; `endEarly` is idempotent; `decayWeightedSessions` and `activeSessions` in the status snapshot reflect live sessions; grep proves no `lat`/`lng` is written to Mongo or logs.
- **Common drift to watch for:** Agent will import `OccupancyService` directly (cycle), add ratings/opt-outs, clamp TTL to a fixed 35 min, or store raw geolocation.

---

**BUILD STEP 10: Demo Simulator (M8)**
- **Reference:** DOC3 → §3.9; DOC3 → §3.0 #6 (scalable clock); DOC1 → M8.
- **What to build:** `core/scenario.ts` (`buildLunchRushScenario`, seeded PRNG), `modules/simulator/{simulator.service,scenario-player,simulator.routes}.ts`, `SwitchableClock` swap to `ScalableClock(speed)` while running (restored in `finally`), player calls `IngestService.recordReading` and `SessionService.startSession({method:'sim'})` — **same code paths as real data**; `POST /admin/simulator/{start,stop}` + `GET status` (admin role, `ALLOW_SIMULATOR=true` guard), boot-time cleanup of `sim-*` sessions, `npm run simulate -- --speed 6 --peak 220 --duration-min 18`.
- **Folder/file targets:** `apps/api/src/core/scenario.ts`, `apps/api/src/modules/simulator/**`, `apps/api/src/infra/clock.ts`, `apps/api/scripts/simulate.ts`, `apps/api/src/container.ts`.
- **Agent prompt hint:** "Build the simulator so it only calls existing services. Do not add any 'if simulator' branch to ingest, occupancy, or the UI."
- **Done when:** `npm run simulate -- --speed 6` makes `watch-status` show a rise-and-fall over ~3 real minutes with sessions decaying; same seed → identical scenario (unit test); `stop` restores the real clock and removes `sim-*` sessions; with `ALLOW_SIMULATOR` unset the endpoint returns `403 SIMULATOR_DISABLED`.
- **Common drift to watch for:** Agent will write fake snapshots straight into the DB/Redis, special-case sim data in services, or leave the scaled clock active after an error.

---

**CHECKPOINT 2** — after Steps 9–10 (backend complete).

---

**BUILD STEP 11: Web Scaffold, Auth Screens, Student Live View (M2 UI)**
- **Reference:** DOC3 → §3.3 (web structure, states), §3.8 (web auth); DOC2 → §2.2 decisions 1 and 8 (serve build from API).
- **What to build:** `apps/web` (Vite+React+TS strict+Tailwind 3+vite-plugin-pwa `manifest.json`, mobile-first); `app/{router,providers,ProtectedRoute}`; `lib/{http,socket,errors,format}.ts`; `features/auth/{LoginPage,OtpForm,StaffPinForm,useAuth}`; `features/student/{StudentPage,components/{OccupancyGauge,WaitTimeCard,BestWindows},hooks/useLiveStatus}`; shared `components/ui/{Card,Badge,Button,Gauge}`; in `apps/api/src/app.ts` serve `apps/web/dist` with SPA fallback in production.
- **Folder/file targets:** `apps/web/**`, `apps/api/src/app.ts`.
- **Agent prompt hint:** "Build the student live view that only renders the server's StatusSnapshot. Components are display-only; fetching and sockets live in hooks/lib. No check-in yet, no charts."
- **Done when:** login works via the ConsoleMailer code; `/student` shows gauge + wait range + best windows updating live while the simulator runs; verified states: `closed`, `stale` (badge "Estimated"), `reconnecting` (banner, auto-recovers); layout correct at 360 px; Chrome shows the app as installable; refreshing or waking the phone re-fetches status; no level/wait calculation exists in `apps/web`.
- **Common drift to watch for:** Agent will compute levels/wait in components, `fetch` inside components, add a UI kit or chart library to `/student`, or colour-only status indicators.

---

**BUILD STEP 12: Student Check-In UI (M3 UI)**
- **Reference:** DOC3 → §3.4 (web: `CheckInCard`, `useActiveSession`, `geolocation.ts`).
- **What to build:** `features/student/components/CheckInCard.tsx` (states `idle|locating|submitting|active|error`), `hooks/useActiveSession.ts` (expected-stay countdown, "I'm done" → `DELETE`), `lib/geolocation.ts` (5 s timeout, returns `undefined` on denial), route `/student/checkin?t=<token>` that submits the token. **QR is opened by the phone's native camera** (URL) — no in-app scanner library.
- **Folder/file targets:** `apps/web/src/features/student/**`, `apps/web/src/lib/geolocation.ts`, `apps/web/src/app/router.tsx`.
- **Agent prompt hint:** "Add the check-in card and token-URL route using the existing API. No camera/QR scanning library. Never send or display precise coordinates beyond what the API needs."
- **Done when:** opening the URL from `npm run print-checkin-url` creates a session and shows a countdown; geolocation denied → still checks in with `geofence:'unknown'`; double-tap is harmless (shows the existing session); "I'm done" removes it; active-session count in the status snapshot changes accordingly.
- **Common drift to watch for:** Agent will add an in-browser QR scanner dependency, show raw coordinates, or build the ratings prompt (Phase 2, Step 18).

---

**CHECKPOINT 3** — after Steps 11–12 (student journey).

---

**BUILD STEP 13: Alerts and Staff Controller (M5)**
- **Reference:** DOC3 → §3.6; DOC1 → M5.
- **What to build:** `modules/alerts/{alert-engine,alert-rule,rules/tray-depletion.rule,alerts.service,alerts.routes,alerts.ports}.ts` (open-alert dedupe per `(ruleId,mealId)`, 3-min cooldown, hysteresis clear, persist + publish), endpoints `GET /staff/alerts`, `POST /staff/alerts/:id/ack`, `PUT /staff/meals/:mealId/trays`; wire `alert.raised/cleared` through `RealtimeGateway` to `staff` and `admin` rooms; web `features/staff/{StaffPage,components/{OccupancyHeadline,TrayProgress,AlertBanner,AlertFeed,TrayCapacityForm,EnableSoundButton},hooks/{useAlerts,useAlertSound}}`.
- **Folder/file targets:** `apps/api/src/modules/alerts/**`, `apps/api/src/modules/realtime/**`, `apps/web/src/features/staff/**`.
- **Agent prompt hint:** "Implement AlertEngine + TrayDepletionRule per DOC3 §3.6; adding another rule later must not modify the engine. Staff screen stays calm unless an alert is open."
- **Done when:** with tray capacity set low and the simulator at peak, `alert:raised` appears on `/staff` within one tick; acking works; raising capacity clears it after the next tick; no re-raise within the 3-min cooldown; no capacity entered → a gentle hint and no alert; chime only after tapping "Enable sound"; a throwing rule does not stop other rules (unit-tested).
- **Common drift to watch for:** Agent will implement the Phase 2 rules (unaccounted entries, batch quality — Step 20), hardcode thresholds instead of using settings, or make the staff screen noisy.

---

**BUILD STEP 14: Admin API + UI + Check-In QR (M6)**
- **Reference:** DOC3 → §3.7; DOC2 → §2.4 (admin endpoints).
- **What to build:** `modules/admin/{admin.routes,admin.service,admin.ports}.ts` — `GET /admin/mess/:id/timeseries` (server-side downsample, ≤ 31 days), `GET …/decay-curve` (theoretical curve from `sessionWeight` + live weight histogram), `GET/PATCH …/settings` (zod cross-field validation, `.strict()`, `updatedAt` conflict check, `settings.changed` event, audit log line), **`GET /admin/meals/:mealId/checkin-token` → `{url, expiresAt}`** *(gap found in planning: DOC 3 had no way to produce the QR; added here)*; web `features/admin/{AdminPage,components/{OccupancyChart,DecayCurveChart,CameraHealthCard,SettingsForm,SimulatorControls,CheckInQr},hooks/*}` with `React.lazy` for chart tabs and `qrcode.react` for the QR.
- **Folder/file targets:** `apps/api/src/modules/admin/**`, `apps/web/src/features/admin/**`.
- **Agent prompt hint:** "Admin module reuses core/ functions for the decay curve — no formulas in admin. Settings validation uses the shared zod schema on both client and server."
- **Done when:** admin sees occupancy (camera) vs decay-weighted sessions on one chart and the decay curve; changing capacity updates the student gauge on the next tick; invalid settings return `422` with per-field details; staff token on `PATCH settings` → `403`; the on-screen QR opens the check-in flow on a phone; simulator can be started/stopped from the UI; charts load lazily (not in the `/student` bundle).
- **Common drift to watch for:** Agent will build the History/DPS/hygiene dashboards (Phase 2, Steps 19–27), duplicate decay math in the admin service, or load Recharts on every route.

---

**CHECKPOINT 4** — after Steps 13–14 (full demo run).

---

**BUILD STEP 15: Demo Hardening and Deployment**
- **Reference:** DOC2 → §2.2 decision 8, §2.6 (risks), §2.5 (12-factor); DOC1 → §1.8 (success metrics, S2 privacy badge).
- **What to build:** `README.md` (setup, env, run, demo script, privacy-by-architecture statement), `docker-compose.demo.yml` (api + redis + mongo, runs fully offline with ConsoleMailer and simulator), `Dockerfile` (multi-stage: build web → run API), deployment to Railway/Render per §4.4, `docs/demo-runbook.md` (pre-flight checklist, 5-minute demo script, fallback steps), stopwatch calibration of `servicePerMin`, seeded 3-day history so best-windows uses real buckets, graceful shutdown, git tag `v1.0-mvp` (Phase 1 release).
- **Folder/file targets:** repo root, `Dockerfile`, `docker-compose.demo.yml`, `docs/**`.
- **Agent prompt hint:** "Do not add features. Make the existing system reproducible, deployable, and demoable offline. Fix only bugs found during rehearsal."
- **Done when:** a fresh clone + README instructions reaches a running demo using only `docker compose -f docker-compose.demo.yml up`, `npm run seed`, `npm run simulate`; the hosted URL passes the §4.4 smoke test; the demo script is rehearsed once end-to-end in ≤ 5 minutes; the 31-second stale-camera fallback is demonstrated.
- **Common drift to watch for:** Agent will start Phase 2 features ("one more thing before the demo"), refactor working modules, or change the stack to fix a deploy problem.

---

## 4.1b — Phase 2 Build Sequence (Steps 16–28: all SHOULD + COULD features)

> **Phase gate:** Phase 2 starts only when Step 15 is done, Checkpoint 4 passed, and the repo is tagged `v1.0-mvp`. CONTROLLER `PHASE` flips from `1` to `2` by Nilesh's explicit confirmation — never by the agent. In Phase 2 the stack list in §4.0 is extended by exactly: `web-push`, `multer`, `sharp`, `@aws-sdk/client-s3` (majors pinned at install; never upgrade mid-build). **Ordering logic:** foundation first, then dependency order (opt-outs → ratings → waste/prep → complaints/alerts → timetable/forecast → queues → push → hygiene → DPS → rebates → audit). Every step: Phase 1 suite must still pass (`npm run typecheck && npm run lint && npm test`).

**Phase 2 cut lines:** **E** after 18 (student feedback loop: opt-out + rating) · **F** after 21 (kitchen + forecasting) · **G** after 24 (queues + push + hygiene) · **H** after 27 (incentives + integrity). *If behind schedule, cut in this order:* Step 27 → 26 → 25 → 23 → 22. Step 28 is non-negotiable.

---

**BUILD STEP 16: Phase 2 Foundation (contracts, ports, repositories, settings, seed)**
- **Reference:** DOC2 → §2.7.1–§2.7.5; DOC3 → §3.12.
- **What to build:** `packages/shared` schemas for every DOC2 §2.7.5 payload + extended `SocketEvents`/`StatusSnapshot` (optional fields only)/`LiveCountPayload.zone`; extend `SettingsDTO`/`SettingsPatchSchema` with DOC2 §2.7.3 keys + defaults; add the DOC3 §3.12 ports to `core/ports.ts`; Mongoose models + repositories (plain objects) for all DOC2 §2.7.2 entities with the listed unique/TTL indexes; `Meal.autoCalibrated`, `Meal.counters`, `Alert.subjectKey`; memory twins for new stores; `infra/storage/local-disk.storage.ts`; `infra/push/noop.notifier.ts`; seed additions (settings defaults, sample timetable, sample menu).
- **Folder/file targets:** `packages/shared/src/**`, `apps/api/src/core/ports.ts`, `apps/api/src/infra/{mongo,memory,redis,storage,push}/**`, `apps/api/scripts/seed.ts`, `apps/api/src/container.ts` (wiring only).
- **Agent prompt hint:** "Add Phase 2 contracts, ports, models and repositories exactly per DOC2 §2.7.2/§2.7.3. No routes, no services, no UI. Existing Phase 1 tests must stay green."
- **Done when:** Phase 1 suite green; every new repository has an integration test; seed twice → no duplicates; manual diff of new model fields vs DOC2 §2.7.2 shows zero extra/renamed fields; Phase 1 `StatusSnapshot` consumers still parse (optional fields only).
- **Common drift to watch for:** Agent will build features while adding models, make new snapshot fields required, or return Mongoose documents.

**BUILD STEP 17: Advance Opt-Out (P1)**
- **Reference:** DOC3 → §3.13; DOC2 → §2.7.5 (`/optouts`).
- **What to build:** `core/optout.ts` (+ tests), `modules/optouts/**`, route + service wiring in `container.ts`, `features/optouts/{OptOutToggle,useOptOut}` on `/student`.
- **Folder/file targets:** `apps/api/src/core/optout*.ts`, `apps/api/src/modules/optouts/**`, `apps/web/src/features/optouts/**`.
- **Agent prompt hint:** "Implement only the opt-out window rule, service, endpoints and the toggle. No rebates, no prep advice."
- **Done when:** set/unset works before cutoff, 422 `OPTOUT_WINDOW_CLOSED` after; boundary tests at cutoff −1 s/0/+1 s; role matrix test; toggle works on a phone viewport.
- **Common drift to watch for:** Agent will add rebate points or kitchen advice here.

**BUILD STEP 18: Post-Meal Rating + Dish Votes (P2) — wires `PushNotifier` (Noop)**
- **Reference:** DOC3 → §3.14; DOC2 → §2.7.4 (`ratingdue`), §2.7.5 (`/ratings`).
- **What to build:** `core/rating.ts`, `infra/redis/rating-due-store.redis.ts` (+ memory), scheduler job `rating-due`, `modules/ratings/**`, gateway room `user:{userId}` + `rating:due`, `features/ratings/{RatingSheet,hooks/usePendingRating}` (check on open + `visibilitychange`).
- **Folder/file targets:** `apps/api/src/{core,modules/ratings,modules/realtime,infra/redis,infra/scheduler.ts}`, `apps/web/src/features/ratings/**`.
- **Agent prompt hint:** "Implement ratings only: due scheduling, submit/pending endpoints, the rating sheet. Push uses the NoopNotifier port. No complaints yet."
- **Done when:** after the simulated delay a rating prompt appears; reopening the app shows a pending rating; second rating → 409 `ALREADY_RATED`; non-owner → 403; dish votes validated against `Meal.menuItems`; contract suite passes for `RatingDueStore` memory + Redis.
- **Common drift to watch for:** Agent will build real web-push here (that is Step 23) or add a rating-history page.

**CHECKPOINT 5** — after Steps 16–18 (see §4.3).

**BUILD STEP 19: Waste Ledger + Kitchen Prep Advisor (P3)**
- **Reference:** DOC3 → §3.15; DOC2 → §2.7.2 (`WasteLedger`, `MealSummary`).
- **What to build:** `core/prep.ts`, `modules/prep/**`, scheduler job `meal-summary`, `/staff` `WasteForm` + `PrepAdviceCard`, `/admin` lazy `WasteChart`; seed 3 days of `MealSummary`.
- **Folder/file targets:** `apps/api/src/{core/prep*.ts,modules/prep,infra/scheduler.ts}`, `apps/web/src/features/{staff,admin}/components/**`.
- **Agent prompt hint:** "Implement the pure prep functions first with table tests, then the service/endpoints/UI. Fall back to enrolledCount × defaultEatRate when history is empty and say so."
- **Done when:** advice changes when opt-outs change; empty-history fallback labelled `basis:'default'`; waste entry adapts the safety margin within 3–15; admin chart shows cooked vs consumed vs leftover.
- **Common drift to watch for:** Agent will add ML forecasting or per-dish quantities.

**BUILD STEP 20: Batch-Quality Complaints + Unaccounted-Entries Alert Rules (P4, P5)**
- **Reference:** DOC3 → §3.16, §3.17; DOC2 → §2.7.2 (`Complaint`).
- **What to build:** `core/{batch-quality,unaccounted}.ts`, `modules/complaints/**`, `modules/alerts/rules/{batch-quality,unaccounted-entries}.rule.ts` registered in the `AlertEngine` (no engine edits), `QuickReport` chips.
- **Folder/file targets:** `apps/api/src/{core,modules/complaints,modules/alerts/rules}`, `apps/web/src/features/ratings/components/QuickReport.tsx`.
- **Agent prompt hint:** "Add two AlertRule classes and the complaint endpoint. Do not modify AlertEngine. Aggregate payloads only — no identity fields."
- **Done when:** 5 same-category reports in 10 min from 5 sessions raise one staff alert, cooldown suppresses repeats; duplicate category per session → 409; unaccounted rule fires only above all three thresholds and its payload contains no user/device fields (contract test).
- **Common drift to watch for:** Agent will edit `AlertEngine`, name students in an alert, or let the rule fire on a stale camera.

**BUILD STEP 21: Timetable, Lecture Wave, Forecast, Nudge (P6)**
- **Reference:** DOC3 → §3.18; DOC2 → §2.7.5 (`/timetable`, `/forecast`).
- **What to build:** `core/{forecast,wave}.ts`, `modules/timetable/**`, optional `lectureWave`/`nudge` on `StatusSnapshot` via `OccupancyService`, `ForecastCurve` + `RushBanner` (student), lazy `TimetableEditor` (admin).
- **Folder/file targets:** `apps/api/src/{core,modules/timetable,modules/occupancy}`, `apps/web/src/features/{student,admin}/components/**`.
- **Agent prompt hint:** "Rolling-average forecast and wave detection as pure functions; manual timetable entry only. No PDF/timetable parsing."
- **Done when:** forecast curve renders from seeded history with `basis` labelled; overlapping breaks → 422; banner appears before a configured break; nudge never suggests a window inside the wave.
- **Common drift to watch for:** Agent will add timetable-file parsing or an ML model.

**CHECKPOINT 6** — after Steps 19–21.

**BUILD STEP 22: Split Queues (P7)**
- **Reference:** DOC3 → §3.19; DOC2 → §2.7.4 (`zone`, `queueManual`).
- **What to build:** `services/vision/zone_counter.py` (+ pytest), reporter `zone` field, `core/queues.ts`, `modules/queues/**`, zone/manual stores, `queues[]` in the snapshot, staff manual queue input, student per-counter waits.
- **Folder/file targets:** `services/vision/**`, `apps/api/src/{core,modules/queues,infra/redis}`, `apps/web/src/features/{student,staff}/**`.
- **Agent prompt hint:** "Add zone counting and the manual fallback. Entrance counting from Phase 1 must behave identically when no zones are configured."
- **Done when:** with zones off, Phase 1 behaviour is unchanged; with zones on, per-counter waits show; stale zone → manual → omitted (never invented); point-in-polygon tests pass.
- **Common drift to watch for:** Agent will import `shapely`, or claim one camera reliably sees both queues.

**BUILD STEP 23: Web Push (P8)**
- **Reference:** DOC3 → §3.20; DOC2 → §2.7.1.
- **What to build:** `modules/push/**`, `infra/push/web-push.notifier.ts`, subscription repository, `apps/web/src/sw.ts` with `vite-plugin-pwa` injectManifest, `usePushSubscription` + `PushOptIn`, swap `NoopNotifier` → `WebPushNotifier` in `container.ts` when VAPID keys are set.
- **Folder/file targets:** `apps/api/src/{modules/push,infra/push,container.ts}`, `apps/web/src/{sw.ts,features/student}`.
- **Agent prompt hint:** "Implement push behind the PushNotifier port only. Payload is title/body/url. 404/410 deletes the subscription."
- **Done when:** installed Android PWA receives a rating prompt with the app closed; denied permission leaves in-app prompts working; 410 removes the subscription (fake client test); iOS limitation documented in the UI.
- **Common drift to watch for:** Agent will switch to FCM/OneSignal or put push logic inside ratings.

**BUILD STEP 24: Hygiene Reports + Tray Quality Holds (P9)**
- **Reference:** DOC3 → §3.21; DOC2 → §2.7.1, §2.7.6.
- **What to build:** `infra/image/sanitize-image.ts` (sharp), `infra/storage/s3.storage.ts`, `modules/hygiene/**`, scheduler job `image-retention`, student `HygieneReportForm`, staff `HoldBanner`, admin `HygieneLog`.
- **Folder/file targets:** `apps/api/src/{modules/hygiene,infra/image,infra/storage,infra/scheduler.ts}`, `apps/web/src/features/{student,staff,admin}/**`.
- **Agent prompt hint:** "Sanitize every image server-side (strip EXIF, re-encode) before storage. A failed upload creates no hold. Images never appear in logs."
- **Done when:** report → hold appears on `/staff` within a tick; admin releases/resolves; EXIF-GPS fixture comes out clean; signed URL expires in 5 min; 4th report in a day → 429; retention job deletes old images (FakeClock test).
- **Common drift to watch for:** Agent will use presigned direct uploads (bypasses sanitising) or store raw images.

**CHECKPOINT 7** — after Steps 22–24.

**BUILD STEP 25: Dish Popularity Score + Demand Auto-Calibration (P10)**
- **Reference:** DOC3 → §3.22; DOC1 → §1.6 (A5).
- **What to build:** `core/dps.ts`, `modules/dishes/**`, `DishStat` updates from `rating.submitted`, admin leaderboard + "apply demand suggestion" (suggestion only).
- **Folder/file targets:** `apps/api/src/{core,modules/dishes}`, `apps/web/src/features/admin/**`.
- **Agent prompt hint:** "DPS is computed from rating and skip-deviation with damping for low counts. Never auto-apply a suggestion without the admin action or the `autoCalibrateDemand` setting."
- **Done when:** leaderboard order matches seeded data; scores below the sample minimum show "not enough data"; applying a suggestion updates `Meal.menuDemandFactorMin` within 0–5.
- **Common drift to watch for:** Agent will present DPS as proven popularity or add ML.

**BUILD STEP 26: Rebate Points + Fast-Track Pass (P11)**
- **Reference:** DOC3 → §3.23.
- **What to build:** `core/rebate.ts`, `modules/rebates/**`, scheduler job `rebate-settle`, student rebate balance + pass UI, staff verify screen.
- **Folder/file targets:** `apps/api/src/{core,modules/rebates}`, `apps/web/src/features/{student,staff}/**`.
- **Agent prompt hint:** "Virtual ledger only. Settlement is idempotent via the unique index. Passes are single-use."
- **Done when:** opt-out honoured → points; opt-out then check-in → violation, no points; double settle adds nothing; pass verified once, second verify → 409; real-money paths do not exist.
- **Common drift to watch for:** Agent will add payment/mess-fee integration (WON'T).

**BUILD STEP 27: Random Audit Mode + Device-Duplicate Flag (P12)**
- **Reference:** DOC3 → §3.24; DOC2 → §2.7.6.
- **What to build:** `core/{audit,device}.ts`, `modules/audit/**`, audit counter store, `AuditPrompt` (staff), `deviceId` (random UUID in localStorage) sent on check-in.
- **Folder/file targets:** `apps/api/src/{core,modules/audit,infra/redis}`, `apps/web/src/features/{student,staff}/**`.
- **Agent prompt hint:** "Every Nth counted entry prompts staff; no per-person tracking. Device flags go to the admin log only and never auto-penalise."
- **Done when:** Nth-entry prompt fires exactly on boundaries; disabled mode creates nothing; two users on one device flag to admin only; `deviceId` is a random UUID, not a fingerprint.
- **Common drift to watch for:** Agent will fingerprint devices, name users in audit events, or auto-block accounts.

**CHECKPOINT 8** — after Steps 25–27.

**BUILD STEP 28: Phase 2 Hardening and Release**
- **Reference:** DOC2 → §2.7.6; DOC3 → §3.25; DOC4 → §4.4.
- **What to build:** `/privacy` page (`GET /privacy` static copy), README + `docs/demo-runbook.md` updates (Phase 2 demo script), retention/TTL verification, env/.env.example completion, full regression, tag `v2.0`.
- **Folder/file targets:** repo root, `docs/**`, `apps/api/src/modules/*/` (bug fixes only).
- **Agent prompt hint:** "No new features. Fix only defects found in regression and rehearsal."
- **Done when:** Phase 1 and Phase 2 suites green; Checkpoints 4–8 scripts re-run clean; §4.4 Phase 2 items ticked; demo script rehearsed.
- **Common drift to watch for:** Agent will start new features or refactor working modules.

---

## 4.2 — Agentic Coding Rules

```
ALWAYS:
  [ ] Work on exactly one build step; read only that step's entry and its DOC2/DOC3 section pointers
  [ ] Check CONTROLLER `PHASE` before starting a step: Steps 1–15 need PHASE 1; Steps 16–28 need PHASE 2 (set by Nilesh, never by you)
  [ ] In Phase 2, add behaviour by registering a new module/AlertRule/adapter in container.ts — extend, don't edit, Phase 1 modules
  [ ] Put every business rule (timing, decay, occupancy, wait, geofence, tray, otp, scenario) in apps/api/src/core/ as pure functions taking `now` as a parameter
  [ ] Keep routes thin: zod-validate → call ONE service method → return; throw AppError subclasses from services (apps/api/src/shared-kernel/errors.ts)
  [ ] Construct concrete classes only in apps/api/src/container.ts; services receive ports (core/ports.ts) via constructor
  [ ] Take time from the injected Clock (apps/api/src/infra/clock.ts); store epoch ms; put units in names (…Sec, …Min)
  [ ] Use shared zod schemas/types from packages/shared for every API, socket and settings payload (server and client)
  [ ] Keep Redis key names and the ZSET member encoding inside apps/api/src/infra/redis/ only
  [ ] Return plain typed objects from repositories in apps/api/src/infra/mongo/ (never Mongoose documents)
  [ ] Emit socket events only through modules/realtime (RealtimeGateway); services publish typed events on infra/event-bus.ts
  [ ] Read config from env via apps/api/src/config.ts (zod, fail fast); list every new env var in .env.example and DOC4 §4.4
  [ ] Run `npm run typecheck && npm run lint && npm test` before declaring a step done; write tests before/with core/ code
  [ ] Make React components display-only; fetching and socket logic live in features/*/hooks and apps/web/src/lib/

NEVER:
  [ ] Never import express, ioredis, mongoose, socket.io, pino or node:* inside apps/api/src/core/
  [ ] Never import a repository or store from a different module — use a port or the event bus
  [ ] Never call Date.now()/new Date() outside infra/clock.ts
  [ ] Never persist or log raw latitude/longitude, OTP codes, PINs, tokens, push endpoints, unsanitised images (EXIF), or any camera frame
  [ ] Never substitute a library (e.g. Passport/NextAuth/Clerk, Prisma, Next.js, Firebase/FCM/OneSignal, Kafka/BullMQ, Cloudinary, shapely, another detector than YOLOv8n) — if the chosen one fails, set BLOCKED. Phase 2 adds only web-push, multer, sharp, @aws-sdk/client-s3
  [ ] Never rely on Redis keyspace/expiry notifications; occupancy is computed on read from the sorted set
  [ ] Never put occupancy level, wait-time or decay calculations in apps/web — render the server's StatusSnapshot
  [ ] Never add a simulator-only branch to ingest, occupancy, sessions, or the UI — the simulator uses the same services
  [ ] Never implement a Phase 2 feature (Steps 16–28) while CONTROLLER PHASE is 1, and never start a Phase 2 step out of order
  [ ] Never implement a WON'T feature in any phase (face recognition/face anomaly, storing or streaming frames, new hardware, punitive use of alerts, billing/payments, multi-mess, native apps)
  [ ] Never add fields to a model or contract that are not in DOC2 §2.3 / DOC3 §3.1 (Phase 1) or additionally DOC2 §2.7 / DOC3 §3.12–§3.24 (Phase 2) — report the need instead
  [ ] Never change a DOC3 interface or signature silently; if it seems wrong, report it
  [ ] Never skip a checkpoint, merge two steps, or mark a step done with files from "Folder/file targets" missing
  [ ] Never read DOC1 in full during a build session

IF THE AGENT GOES OFF-TRACK:
  Scope creep → "Stop. We are only doing Build Step [N]: [name]. Done When: [paste]. Anything else is a future step.
                 Add `// [FUTURE IDEA: …]` and return. What is your next action toward Done When?"
  Layer violation → "That logic belongs in [core/ | service | repository | hook]. Move it, keep the interface from DOC3 §[x]."
  Stack swap → "Stop. DOC4 §4.0 fixes the stack. Revert to [library]. If it is blocking you, set BLOCKED and report."
  Stuck 3+ attempts → "Stop trying fixes. Isolate: write a failing test that reproduces it, then report cause and options."
```

---

## 4.3 — Integration Checkpoints

```
CHECKPOINT 1: After Build Steps 7 through 8
  What to verify:   Vision script (or a replayed clip) → API → Redis → status snapshot → socket, with staleness fallback.
  How to test it:   1) docker compose up -d; npm run seed; npm run dev:api  2) python services/vision/main.py --source clip.mp4
                    3) npm run watch-status — numbers rise/fall with the clip, ≤1 update/s  4) kill the script, wait 31 s —
                    watch-status shows stale:true, source:'sessions'  5) restart script — returns to camera source.
  If it breaks:     No updates → ingest key / URL path (/api/v1/mess/live-count) mismatch; frozen numbers → scheduler not started
                    in server.ts or seq rejected as older; wrong values → cameraBaseline captured at the wrong time (Step 7).

CHECKPOINT 2: After Build Steps 9 through 10
  What to verify:   Backend end-to-end: simulator drives ingest and sessions; sessions decay and expire; clock restores.
  How to test it:   npm run simulate -- --speed 6; watch-status for ~3 min; use print-checkin-url + curl for a real session;
                    confirm activeSessions/decayWeightedSessions move; stop the simulator; confirm real clock and no sim-* sessions.
  If it breaks:     Sessions never expire → reaper not scheduled or Clock mismatch (ScalableClock vs EXPIRE seconds);
                    decay looks wrong → re-check §3.0 #1 offsets in core/decay.ts tests.

CHECKPOINT 3: After Build Steps 11 through 12
  What to verify:   Student journey in a real phone browser.
  How to test it:   On a phone (same network/tunnel): log in with OTP from the server log → see live gauge while simulator runs →
                    open the check-in URL → countdown shows → "I'm done" → gauge/active count changes; toggle airplane mode
                    → "Reconnecting" banner then recovery; install the PWA.
  If it breaks:     Socket not connecting → CORS/JWT handshake or serving the SPA from the wrong origin; stale UI after wake
                    → missing visibilitychange refetch.

CHECKPOINT 4: After Build Steps 13 through 14
  What to verify:   The full demo: three roles, one data flow.
  How to test it:   Admin starts simulator → student sees rush → staff sets low tray capacity and gets one alert → ack → refill clears
                    → admin charts show camera vs decay-weighted → change capacity → student gauge updates → QR check-in works.
  If it breaks:     Alert never fires → tray capacity unset or velocity window empty (EntryVelocityStore); admin chart empty →
                    snapshot job not running or range query; role leak → requireRole missing on a route.

CHECKPOINT 5: After Build Steps 16 through 18 (Phase 2)
  What to verify:   Phase 1 regression + student feedback loop: opt-out → check-in → rating prompt → rating stored.
  How to test it:   Re-run the Checkpoint 4 script; then on a phone: opt out before cutoff, (second account) check in under simulator,
                    wait the scaled rating delay → prompt appears; close the app, reopen → pending rating shows; submit twice → 409.
  If it breaks:     No prompt → rating-due job not scheduled or Clock mismatch; prompt for wrong user → room user:{userId} join missing.

CHECKPOINT 6: After Build Steps 19 through 21 (Phase 2)
  What to verify:   Kitchen + forecasting: prep advice reacts to opt-outs; waste entry adapts margin; forecast and wave banner render.
  How to test it:   Seed 3 days of history; change opt-out count → advice changes; enter waste → margin changes; configure a break 10 min away → banner + nudge.
  If it breaks:     Advice constant → MealSummary history empty; no banner → timetable module not registered or time-zone mix-up (convert in UI only).

CHECKPOINT 7: After Build Steps 22 through 24 (Phase 2)
  What to verify:   Queues, push, hygiene: per-counter waits, push to an installed PWA, report → tray hold → release.
  How to test it:   Zones off → Phase 1 behaviour identical; manual queue length shows a wait; install PWA, receive a rating push with app closed;
                    submit a hygiene photo with GPS EXIF → hold on /staff, admin views image via expiring URL, EXIF stripped.
  If it breaks:     No push → VAPID keys/SW registration; hold not created → storage failure (by design creates nothing); GPS still present → sanitize step skipped.

CHECKPOINT 8: After Build Steps 25 through 27 (Phase 2)
  What to verify:   Incentives + integrity: DPS leaderboard, rebate settle, fast pass single-use, audit prompts, device flag (admin only).
  How to test it:   Seed ratings → leaderboard; opt out + no check-in → points; verify a pass twice (second → 409); set everyN=5 → prompt on the 5th entry.
  If it breaks:     Points doubled → settle not idempotent (unique index); audit never fires → counter store or counter-reset handling.
```

---

## 4.4 — Deployment Checklist

```
[ ] Env vars set on the host (Railway/Render) for the API service:
      NODE_ENV, PORT, LOG_LEVEL, MESS_ID, MONGODB_URI, REDIS_URL, JWT_SECRET (≥32 chars), OTP_HMAC_SECRET,
      MEAL_QR_SECRET, INGEST_API_KEY, ALLOWED_EMAIL_DOMAINS, RESEND_API_KEY, MAIL_FROM,
      STAFF_SEED_PIN, ADMIN_SEED_PIN, DEMO_MODE, ALLOW_SIMULATOR, CLIENT_ORIGIN (dev only)
    Vision script env: MESSPULSE_API_URL, MESSPULSE_INGEST_KEY, MESS_ID, VIDEO_SOURCE
[ ] MongoDB Atlas M0 cluster created, IP/network access allows the host; indexes created by the app/seed on first boot
[ ] Hosted Redis provisioned (Railway/Render/Upstash); REDIS_URL set; TLS flag if required
[ ] `npm run build` passes with zero type errors and zero lint errors; `npm test` green (core 100% branches)
[ ] Web build is produced and served by the API (SPA fallback confirmed)
[ ] First deploy via platform; run `npm run seed` once against the production DB (staff/admin PINs from env)
[ ] Smoke test: GET /healthz → 200, GET /readyz → 200; student OTP login works; POST /api/v1/mess/live-count with the ingest key
    → status changes; unauthenticated socket is rejected
[ ] Free-tier sleep mitigated: warm-up ping scheduled for 10 min before the demo; local `docker compose -f docker-compose.demo.yml up`
    verified as the fallback; tunnel (e.g. Cloudflare Tunnel) tested
[ ] ALLOW_SIMULATOR=true only on the demo environment; JWT/ingest secrets rotated after the event if the repo is public

Phase 2 additions (Step 28):
[ ] Extra env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, OBJECT_STORAGE_DRIVER (local|s3), S3_BUCKET, S3_REGION,
    S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, IMAGE_RETENTION_DAYS — all in .env.example
[ ] Object storage bucket private; signed URLs only; retention job verified; Mongo TTL indexes confirmed (CheckIn 90 d, DeviceSighting 30 d, etc.)
[ ] Service worker served from the site root; push test on an installed Android PWA
[ ] GET /privacy live; README states the privacy-by-architecture claim (counts only, no faces, no frames)
[ ] Phase 1 + Phase 2 suites green; Checkpoints 4–8 re-run; git tag v2.0
```

---

## ⛔ GATE

**Confirm DOC 4 before coding.** The sequence in §4.1 is the contract; deviations should be conscious decisions.

Please confirm:
1. The 15-step Phase 1 order and **cut lines** (A–D), and the **Phase 2 plan**: Steps 16–28, gated on Step 15 + Checkpoint 4, with cut lines E–H and Checkpoints 5–8.
2. Native phone camera for QR (no in-app scanner) and the added **admin check-in-token endpoint** (a gap I found in DOC 3).
3. Parallel lanes are optional; the single-agent flow stays strictly sequential.

`CONTROLLER.md` (session state, load order, state machine, project-specific triggers, quick reference) is generated alongside this document and bundled with DOC1–4 and the two reference files (`vibe-antipatterns.md`, `prompt-patterns.md`) in `docs/`.
