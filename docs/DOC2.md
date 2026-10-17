# DOC 2 — System & Technical Architecture: MessPulse

**Status:** Draft for sign-off · **Builds on:** DOC 1 (MUST = M1–M8, SHOULD/COULD as tiered)
**Build profile:** Hackathon / vibecoding — lean by design (`[ASSUMPTION: 2–4 devs, 24–48 h]`)

---

## 2.0 — Resolved Technical Assumptions (second-round questions)

| Question | Answer used in this doc |
|---|---|
| Data volume | One mess, ~500–1,500 students, 3–4 meals/day, ~300 concurrent sockets at peak, 1 ingest POST / 5 s. Trivial load: a **single Node process** is enough. `[ASSUMPTION]` |
| Real-time? | Yes — occupancy, alerts, camera health pushed over Socket.io (target < 2 s end to end, per DOC 1 §1.8) |
| Background work | Small in-process scheduler: session reaper, occupancy snapshots, tray/velocity checks. **No external queue.** |
| Auth model | Students: email one-time code (OTP). Staff/admin: PIN. Ingest: separate API key. |
| File/media | None in MVP. Image storage only if Tier 2 hygiene (COULD) is built → decision deferred. |
| NFRs | Mobile-first 360 px, installable PWA, read-only offline shell, no offline writes. Availability: demo-grade, not 24×7. |
| Open-source / self-host | Not a goal for MVP. Note the Ultralytics **AGPL-3.0** licence if this is ever published or commercialised. |

---

## 2.1 — Architecture Overview

**ARCHITECTURE STYLE:** **Modular monolith** (Node API + Socket.io + static PWA in one deployable) plus **one adapter process** (Python vision script) that talks to it only through a single HTTP endpoint.

**RATIONALE:** Per the *Monolith-First Rule* (project < 6 months, < 5 devs, unknown requirements), one deployable keeps the 4-person build simple: no inter-service networking, one log stream, one set of env vars. The vision script is separate only because it is a different language/runtime (Python, ML deps, runs next to the camera). It behaves as an *infrastructure adapter*: the backend never imports it and just receives integers.

### Layer diagram

```
 ┌──────────────────────────┐        ┌──────────────────────────────────────────┐
 │ Vision Adapter (Python)  │        │ Client Layer — React PWA (Vite, TS)      │
 │ YOLOv8n + ByteTrack      │        │  /student  /staff  /admin                 │
 │ webcam | CCTV | .mp4     │        └───────────────┬──────────────────────────┘
 └────────────┬─────────────┘             REST (TanStack Query) + Socket.io
   POST /api/v1/mess/live-count                       │
   (X-Ingest-Key, integers only)                      ▼
              │        ┌────────────────────────────────────────────────────────┐
              └───────►│ Presentation Layer — Express routes + Socket.io gateway │
                       │  zod validation · authN/authZ middleware · no logic    │
                       ├────────────────────────────────────────────────────────┤
                       │ Application Layer — feature services (use cases)       │
                       │  ingest · sessions · occupancy · alerts · auth · admin  │
                       ├────────────────────────────────────────────────────────┤
                       │ Domain Layer — pure TS functions/types (no frameworks)  │
                       │  computeSessionTiming · sessionWeight · selectOccupancy    │
                       │  estimateWaitTime · AlertRule strategies                │
                       ├────────────────────────────────────────────────────────┤
                       │ Infrastructure Layer — adapters implementing ports      │
                       │  SessionStore(Redis) · *Repository(Mongo) · Mailer      │
                       └───────────────┬─────────────────────┬──────────────────┘
                                       ▼                     ▼
                                    Redis                 MongoDB
                              (live state, TTL)     (history, config, users)
```

**Dependency rule (Clean Architecture):** arrows point inward only. Domain imports nothing; application depends on domain + *port interfaces*; infrastructure implements the ports.

### Repository layout (npm workspaces monorepo)

```
messpulse/
├── apps/
│   ├── api/            # Node + Express + Socket.io (also serves web build in prod)
│   └── web/            # React + Vite PWA
├── services/
│   └── vision/         # Python YOLOv8n counter
├── packages/
│   └── shared/         # zod schemas + TS types + socket event names (single source of contract)
├── docker-compose.yml  # redis + mongo for local dev
└── docs/               # DOC1..DOC4, CONTROLLER.md
```

---

## 2.2 — Technology Stack Decisions

**1. Frontend framework**
- **Chosen:** React 18 + Vite + TypeScript (strict) + Tailwind CSS + `vite-plugin-pwa`; React Router; TanStack Query (REST); `socket.io-client`; Recharts for charts.
- **Reason:** Already the team's stack; Vite is fast for iteration; Tailwind enables quick mobile-first UI; TanStack Query removes hand-written fetch/cache code.
- **Alternatives:** Next.js — rejected: SSR/App Router overhead is unnecessary for three authenticated client views and complicates Socket.io hosting. Vue/Svelte — rejected: team familiarity.
- **Trade-offs:** No SSR/SEO (irrelevant here). **Migration risk:** Low.

**2. Backend/API**
- **Chosen:** Node 20 LTS, Express, TypeScript (strict), `zod`, `pino`, `socket.io`, `ioredis`, `mongoose`.
- **Reason:** Same language as the frontend (shared types in `packages/shared`), mature real-time story, matches the stated stack.
- **Alternatives:** FastAPI — rejected: would split languages for everything except the vision piece; NestJS — rejected: ceremony too heavy for the time box (its layering is achieved here by convention instead).
- **Trade-offs:** Express is unopinionated, so layering must be enforced by rules (see DOC 4 Agentic Rules). **Risk:** Low.

**3. Primary database**
- **Chosen:** MongoDB (Atlas free tier) via Mongoose, accessed only through repositories.
- **Reason:** Stack already chosen; flexible documents suit ratings/complaints/alerts that will evolve during the hackathon; Atlas M0 is free.
- **Alternatives:** PostgreSQL (the reference default for relational data) — rejected *for this build* only because the team's stack and familiarity are Mongo; relations here are shallow (user → sessions → ratings).
- **Trade-offs:** Weaker integrity guarantees than SQL → mitigated by zod validation at the boundary and unique indexes. **Risk:** Medium (moving to Postgres would be a repository-layer rewrite, which is exactly why repositories exist).

**4. Live-state store / caching**
- **Chosen:** Redis (local Docker in dev; Upstash/Railway/Render Redis in prod) behind a `SessionStore` port; an `InMemorySessionStore` adapter for tests and as an emergency fallback.
- **Reason:** TTL expiry and sorted sets map directly onto sessions and entry-velocity windows.
- **Alternatives:** Mongo TTL indexes — rejected: ~60 s deletion granularity is too coarse for a 5 s occupancy tick; pure in-memory only — rejected as the sole option because state would vanish on restart, but kept as a fallback adapter.
- **Trade-offs:** One more moving part. **Risk:** Low (swappable via the port).
- **⚠️ Design rule:** **Do not rely on Redis key-expiry notifications** (they are best-effort and unsupported on some managed Redis). Occupancy is *computed on read* from a sorted set scored by `expiresAt`; the TTL on keys is only for cleanup.

**5. Authentication**
- **Chosen:** JWT (HS256, short-lived access token, role claim). Students: **email OTP** (code stored hashed in Redis, 10-min TTL, 5 attempts) sent through a `Mailer` port — `ResendMailer` in prod, `ConsoleMailer` for dev/demo. Staff/admin: PIN (bcrypt-hashed, seeded from env). Ingest: static `X-Ingest-Key`, constant-time compare.
- **Reason:** No third-party auth dependency to configure under time pressure; `ConsoleMailer` makes the demo work with no internet.
- **Alternatives:** Google OAuth restricted to the college domain — *preferred upgrade* if AIT uses Google Workspace (`[ASSUMPTION: unknown]`), stronger identity, but adds OAuth setup; Clerk/Supabase Auth — rejected: external service + redirect flows for a 3-role app; self-declared name + roll number — rejected: spoofable, undermines verified ratings/complaints.
- **Trade-offs:** OTP email deliverability. **Risk:** Low–Medium.

**6. Real-time transport**
- **Chosen:** Socket.io with **rooms per role** (`student`, `staff`, `admin`) and handshake-time JWT verification; server pushes **full status snapshots throttled to ≤ 1/s** rather than deltas.
- **Reason:** Snapshots are idempotent — a dropped message or reconnect self-heals; much simpler client logic than reconciling deltas.
- **Alternatives:** Server-Sent Events — rejected: one-directional is enough but Socket.io auth/rooms/reconnect are ready-made; polling — rejected: misses the sub-2 s target.
- **Trade-offs:** Horizontal scale needs the Redis adapter (not required at this scale). **Risk:** Low.

**7. Vision microservice**
- **Chosen:** Python 3.11, Ultralytics YOLOv8n with built-in ByteTrack tracking, OpenCV for capture; counts line-crossings (in/out) plus current in-frame headcount; posts every 5 s.
- **Reason:** Smallest YOLOv8 model runs on laptop CPU; tracking gives stable IDs so line-crossing doesn't double count.
- **Alternatives:** OpenCV HOG/background subtraction — rejected: poor accuracy in crowds/lighting; MediaPipe — rejected: tuned for few close-range people, not entrance crowds; YOLO11n — acceptable drop-in with the same API if available.
- **Trade-offs:** Accuracy depends on camera angle (top-down/oblique works best); **AGPL-3.0** licence. **Risk:** Medium (accuracy), Low (swap).
- **Resilience rule:** the script attaches a monotonically increasing `seq`, retries with backoff, and buffers up to N unsent payloads; the backend ignores duplicate/older `seq`.

**8. Deployment**
- **Chosen:** **One Node service** (API + Socket.io + serves the built PWA to avoid CORS) on Railway or Render; Atlas M0; hosted Redis; the vision script runs on a laptop/edge box at the mess (or against a recorded clip on demo day).
- **Alternatives:** Vercel for frontend + separate API — rejected: Vercel's serverless model does not host persistent WebSockets, and two deployables add CORS/env complexity.
- **Trade-offs/⚠️ Risk:** free tiers may sleep → **demo-day fallback is `docker compose up` locally with a tunnel (e.g. Cloudflare Tunnel)** and a warm-up ping beforehand. **Risk:** Low.

**9. Testing**
- **Chosen:** Vitest (domain + services + React hooks), Supertest (HTTP integration), `pytest` (vision line-crossing logic with synthetic tracks), Playwright for **one** smoke E2E (SHOULD).
- **Reason:** One test runner across the TS code; pure domain functions are cheap to cover heavily. **Risk:** Low.

**10. Monitoring / logging**
- **Chosen:** `pino` JSON logs to stdout, `/healthz` (process) and `/readyz` (Redis + Mongo reachable), `camera:health` event surfaced in `/admin`. Sentry is a COULD.

**11. CI/CD**
- **Chosen:** GitHub Actions: install → typecheck → lint → test on every push; platform auto-deploys `main`.

---

## 2.3 — Data Architecture

### Redis (ephemeral, operational state) — all keys prefixed `mp:` and scoped by meal

| Key | Type | Purpose |
|---|---|---|
| `mp:meal:{mealId}:sessions` | ZSET (score = `expiresAt` epoch ms, member = `sessionId`) | Active diners; reaper does `ZREMRANGEBYSCORE -inf now` |
| `mp:session:{sessionId}` | HASH `{userId, mealId, checkedInAt}` + `EXPIRE hardExpirySec+60` | Lookup/cleanup only; the immutable timing fields (`expectedStaySec`, `hardExpirySec`) are encoded in the ZSET member so occupancy ticks need no per-session reads |
| `mp:meal:{mealId}:entries` | ZSET (score = ts, member = eventId) | Entry velocity (`ZCOUNT` over last N min); trimmed periodically |
| `mp:meal:{mealId}:camera` | STRING (JSON `{count, in, out, seq, ts}`) | Latest ground-truth reading + staleness check |
| `mp:user:{userId}:meal:{mealId}` | STRING (`SET NX`, TTL = session TTL) | One active session per user per meal (idempotent check-in) |
| `mp:otp:{email}` | HASH `{codeHash, attempts}` + 10 min TTL | OTP login |
| `mp:alert:cooldown:{ruleId}:{mealId}` | STRING + TTL | Prevents alert spam (staff screen stays calm) |

### MongoDB (durable) — every document has `_id`, `createdAt`, `updatedAt`

```
Entity: User
  Fields: email (unique, lowercased), rollNo?, name, role: 'student'|'staff'|'admin', pinHash? (staff/admin only)
  Relationships: has many CheckIn, Rating, OptOut, Complaint
  Indexing: unique(email)

Entity: MessSettings            (one doc per mess; admin-editable)
  Fields: messId, name, seatCapacity, servicePerMin, geofence {lat, lng, radiusM}, baseMealMin (18), maxSessionMin (60),
          decay {tail:[{untilOffsetMin:8,weight:0.60},{untilOffsetMin:17,weight:0.25}]} (offsets from expected stay; weight 1.0 before it, 0 after the last),
          staleCameraSec (30), alertThresholds{...}
  Note: decay table and caps are DATA, not code constants (OCP)

Entity: Meal
  Fields: messId, mealId ("YYYYMMDD-lunch"), type, startsAt, endsAt, menuItems[string], menuDemandFactorMin (0–5), trayCapacity?
  Indexing: unique(messId, mealId)

Entity: CheckIn                 (archive of a finished session)
  Fields: sessionId (unique — the Redis session id; Phase 2 ratings/complaints reference it), userId, mealId, checkedInAt, queueWaitSecAtEntry, expectedStaySec, hardExpirySec, method: 'qr'|'geofence'|'sim', geofence: 'inside'|'outside'|'unknown', endedAt?, endReason: 'expired'|'manual'
  Indexing: (mealId, checkedInAt), (userId, mealId)
  Note: raw lat/lng are NOT stored — only the boolean result

Entity: OccupancySnapshot       (sampled every 30 s, NOT every ingest POST)
  Fields: messId, mealId, ts, cameraCount, sessionEstimate, decayWeighted, estWaitMin
  Indexing: (messId, ts) — consider a Mongo time-series collection

Entity: Alert
  Fields: messId, mealId, ruleId ('tray-depletion'|'unaccounted-entries'|'batch-quality'…), severity, payload, raisedAt, ackedBy?, ackedAt?, clearedAt?
  Indexing: (messId, raisedAt desc), (mealId, ruleId)

SHOULD/COULD-tier entities: **authoritative definitions are in §2.7.2** (they key on `sessionId`, not `checkInId`); built in Phase 2 (DOC 4 Steps 16+).
```

### DATA FLOW — primary use case (a student checks in while the camera counts)

1. **Vision adapter** reads frames, tracks people, and every 5 s `POST /api/v1/mess/live-count` `{messId, seq, inCount, outCount, count, capturedAt}` with `X-Ingest-Key`.
2. `ingest.routes` validates (zod) → `IngestService.recordReading()` ignores stale `seq`, writes `mp:meal:{id}:camera`, updates entry velocity from `inCount`, publishes internal event `reading.recorded`.
3. **Student** opens `/student` → `GET /api/v1/mess/:messId/status` returns the current snapshot; the socket joins room `student`.
4. **Student scans QR / taps geofence prompt** → `POST /api/v1/sessions`. `SessionService.checkIn()`: verify signed meal token → (soft) geofence check → `SET NX` per-user key → `computeSessionTiming(settings, queueWaitNow, menuDemandFactor)` → `ZADD` + `HSET` → publish `session.started`.
5. A **1 s tick** (`OccupancyService`) assembles a `StatusSnapshot` {cameraCount, decayWeightedSessions, estWaitMin, stale?, bestWindows} using pure domain functions and publishes `status.updated`.
6. `RealtimeGateway` (the *only* module that knows Socket.io) subscribes and emits `status:update` to each room (throttled ≤ 1/s).
7. `AlertEngine` runs registered `AlertRule`s on each tick (tray depletion in MVP) → if tripped and not in cooldown → persist `Alert` → publish `alert.raised` → emitted to `staff` and `admin` rooms.
8. **Expiry:** the reaper removes elapsed sessions, archives them to Mongo `CheckIn`, and a 30 s job writes `OccupancySnapshot`.
9. **Stale camera:** if `now − camera.ts > staleCameraSec` the snapshot flags `stale: true`; UI falls back to the session estimate with an "estimated" badge (DOC 1 M4).

### SENSITIVE DATA

| Data | Handling |
|---|---|
| Student email / roll no. / name (PII) | Stored only in `User`; never logged (pino redaction); returned only to the owner and admin |
| Location | Browser geolocation is evaluated server-side to a tri-state `geofence` (`inside`/`outside`/`unknown`); **coordinates are never persisted** |
| Camera frames / faces | **Never leave the vision process.** Only integers are transmitted. No biometric processing (Won't-Have in DOC 1). Document this in README as the privacy-by-architecture claim (DOC 1 S2) |
| OTP codes, PINs | OTP stored hashed with short TTL + attempt limit; PIN bcrypt-hashed; neither logged |
| JWT secret, ingest key, DB URLs | Environment variables only; `.env` git-ignored; `.env.example` committed |
| Complaint photos (COULD) | Not stored in MVP; if built: object storage, signed URLs, retention limit, admin-only access |
| Retention `[ASSUMPTION]` | `CheckIn` 90 days, `OccupancySnapshot` 1 year, Alerts 1 year; documented, enforced via Mongo TTL index |
| Regulatory | Treat as personal data under India's DPDP Act, 2023: purpose limitation, minimal fields, deletion on request |

---

## 2.4 — API Design

**API STYLE:** REST for commands and queries, versioned `/api/v1`, JSON everywhere; Socket.io only for server→client push (no business commands over sockets). **Rationale:** REST is cacheable, testable with Supertest, and keeps one authoritative path for each action; sockets stay a thin broadcast channel. (Note: the original PRD's path `/api/mess/live-count` becomes `/api/v1/mess/live-count`; the vision script must use the new path.)

**Error format (consistent):** `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field": "…", "issue": "…" }] } }`; codes map to 400/401/403/404/409/422/429; 500 never exposes stack traces.

### Core endpoints (MVP unless tagged)

| Method & path | Purpose | Auth | Key considerations |
|---|---|---|---|
| `POST /auth/otp/request` | Email a one-time code | none | Rate-limit per email/IP; 429 on abuse; domain allow-list `[ASSUMPTION]` |
| `POST /auth/otp/verify` | Exchange code → JWT | none | 5-attempt limit; returns role claim |
| `POST /auth/staff/login` | PIN → JWT (staff/admin) | none | Lockout/backoff; bcrypt compare |
| `GET /auth/me` | Current user + role | any | — |
| `POST /mess/live-count` | Vision ingest `{messId, seq, count, inCount, outCount, capturedAt}` | ingest key | zod validation; reject non-monotonic `seq` (200 + `ignored:true`); tight rate limit; body < 1 KB |
| `GET /mess/:messId/status` | Current `StatusSnapshot` | student/staff/admin | Cached 1 s in memory; same shape as `status:update` |
| `GET /mess/:messId/forecast` *(S1, SHOULD)* | Next-60-min predicted occupancy | any | Computed from snapshot history |
| `POST /sessions` | Check-in `{mealToken, geo?{lat,lng,accuracy}}` | student | 201 + session; 409 if already active; 422 if token expired |
| `GET /sessions/me/active` | Current session (for UI state) | student | — |
| `DELETE /sessions/me/active` | "I'm done" early exit (improves accuracy) | student | Idempotent 204 |
| `GET /staff/alerts` · `POST /staff/alerts/:id/ack` | Alert feed / acknowledge | staff, admin | Paginate (cursor) |
| `PUT /staff/meals/:mealId/trays` | Enter tray capacity | staff, admin | Validates positive integer |
| `GET /admin/mess/:messId/timeseries?from&to` | Occupancy history + decay curve | admin | Bounded range; downsample server-side |
| `GET/PUT /admin/mess/:messId/settings` | Capacity, service rate, demand factor, thresholds | admin | `PATCH` semantics; audit log entry |
| `POST /admin/simulator/start` · `/stop` | Run the scripted lunch rush (M8) | admin | Feeds the **same** `IngestService`, no special-case path |
| `GET /meals/today` · `POST /optouts` · `POST /ratings` · `POST /complaints` · `PUT /admin/timetable` | **SHOULD-tier** | per role | Specified in DOC 3 when built |

### Socket.io contract (names live in `packages/shared`)

| Event (server → client) | Rooms | Payload |
|---|---|---|
| `status:update` | student, staff, admin | `StatusSnapshot` |
| `alert:raised` / `alert:cleared` | staff, admin | `Alert` |
| `camera:health` | admin | `{lastSeenAt, stale, fps?}` |

Handshake: JWT in `auth.token`; connection rejected without a valid role. Clients never emit domain commands.

---

## 2.5 — Clean Architecture & Engineering Principles

**MODULARITY & COHESION**
Backend is organised **by feature (Screaming Architecture)**: `ingest`, `sessions`, `occupancy`, `alerts`, `auth`, `admin`, `realtime`, plus `core/` (pure domain) and `infra/` (adapters). Modules communicate only via (a) exported service interfaces and (b) a small **typed internal event bus** (`reading.recorded`, `session.started`, `status.updated`, `alert.raised`) — never by reaching into each other's repositories.

**SINGLE RESPONSIBILITY PRINCIPLE**
- Routes translate HTTP ↔ service calls; services orchestrate use cases; domain functions compute; repositories persist; the gateway broadcasts.
- *Tempting violations:* computing TTL inside the check-in route; writing Mongo queries in a service; emitting socket events from services. Each has a named home (`core/ttl.ts`, `*.repository.ts`, `RealtimeGateway`).

**SEPARATION OF CONCERNS**
- Business rules (TTL formula, decay brackets, wait estimate, alert thresholds) live **only** in `core/` as pure, deterministic functions that take `now` and settings as parameters.
- React components are display-only; data access sits in hooks (`useLiveStatus`, `useSession`); no business math in the client — the server computes `StatusSnapshot` and the UI renders it.

**DEPENDENCY INVERSION**
- Services depend on **ports** (`SessionStore`, `CheckInRepository`, `AlertRepository`, `Mailer`, `Clock`) declared next to the service; infrastructure implements them; wiring happens in a single composition root (`apps/api/src/container.ts`) using constructor injection — no DI framework.
- `Clock` is injected so decay/TTL/cooldown logic is tested without waiting.

**OPEN/CLOSED PRINCIPLE**
- New alert types (Unaccounted Entries, Batch Quality) = a new class implementing `AlertRule { id; evaluate(ctx): Alert | null }` registered in the `AlertEngine`; no edits to the engine.
- Decay offsets, session cap, thresholds are **settings data**, so tuning needs no deploy.
- Wait-time estimation sits behind `WaitEstimator` so the MVP heuristic can be replaced with a learned model later.

**INFORMATION HIDING (Ousterhout)**
- `SessionStore` exposes `start`, `end`, `listActive`, `removeExpired` (entry velocity and the latest camera reading sit behind separate ports per Interface Segregation) — callers never see ZSETs/HASHes (deep module, simple interface).
- `RealtimeGateway` hides Socket.io rooms/event names; `VisionClient` details stay in Python; `Mailer` hides the email provider.
- Raw Mongoose documents never cross out of repositories; they return plain typed objects from `packages/shared`.

**TESTABILITY**
- Domain functions: pure unit tests (decay boundaries at expected stay / +8 / +17 min, session cap, queue-wait shift).
- Services: tested with `InMemorySessionStore`, fake repositories, fake `Clock`.
- API: Supertest against the Express app with the in-memory adapters (no Docker needed); one integration suite runs against real Redis/Mongo in CI via service containers.
- Vision: pytest on the line-crossing function using synthetic track data; a recorded clip serves as manual accuracy fixture.

**NAMING & READABILITY (Clean Code)**
- Files `kebab-case` with role suffix: `session.service.ts`, `session.routes.ts`, `session.repository.ts`, `timing.ts`. Types `PascalCase`; functions/variables `camelCase`, verbs for functions (`computeSessionTiming`), nouns for data. Routes: plural nouns, no verbs in paths.
- Constants with units in the name (`baseMealMin`, `queueWaitSec`) — time-unit bugs are the likeliest defect in this system. All timestamps are UTC epoch ms internally; formatted to Asia/Kolkata only in the UI.
- Comments explain *why* (e.g. why snapshots not deltas, why no keyspace events); code self-documents *what*.
- TypeScript `strict`, no `any`; zod schemas in `packages/shared` are the single source of truth for types (`z.infer`).

**12-FACTOR COMPLIANCE**
1. Codebase: one repo, monorepo workspaces. 2. Dependencies: lockfile, pinned Python `requirements.txt`. 3. **Config:** env vars validated at boot with zod (fail fast). 4. **Backing services:** Redis/Mongo/Mailer are attached resources via URLs. 5. Build/release/run: CI builds, platform releases. 6. **Processes:** API is stateless — state lives in Redis/Mongo (restart-safe). 7. Port binding: `PORT` env. 8. Concurrency: scale out needs the Socket.io Redis adapter (not needed now). 9. Disposability: graceful shutdown closes sockets/Redis; sessions survive restarts. 10. Dev/prod parity: docker-compose with the same Redis/Mongo versions. 11. **Logs:** pino JSON to stdout. 12. Admin tasks: `npm run seed` / `npm run simulate` scripts.

---

## 2.6 — Risk Register & Known Risks (carried from DOC 1, extended)

- **[KNOWN RISK] Wait-time estimate is a heuristic.** MVP model: `queued = max(0, occupancy − seatCapacity)`, `waitMin = ceil(queued / servicePerMin)`, tuned by a stopwatch test on demo day. It can be wrong; the UI labels it "estimated".
- **[KNOWN RISK] QR/geofence can be spoofed** (photo of a QR; browser geolocation indoors is coarse). Mitigation: signed per-meal token (short expiry), geofence is a *soft signal*; rotating QR is a COULD.
- **[KNOWN RISK] Free-tier hosting may sleep** → local `docker compose` + tunnel fallback on demo day.
- **[KNOWN RISK] Vision accuracy depends on camera angle/lighting** → run the 5-minute spike (DOC 1 A3) first; keep the recorded-clip path.
- **[KNOWN RISK] Four runtime parts** (API, Redis, Mongo, Python). Mitigated by ports + `InMemorySessionStore` so the demo still works if Redis misbehaves.
- **[KNOWN RISK] Ultralytics AGPL-3.0** — fine for a hackathon; revisit before any commercial or public release.

---

## ⛔ GATE

Please confirm before DOC 3:
1. Modular monolith + separate Python adapter, one deployable for web + API.
2. Redis behind a `SessionStore` port, occupancy computed on read (no key-expiry notifications).
3. Auth: email OTP via a `Mailer` port (console in demo), PIN for staff/admin, ingest key for the camera.
4. Socket.io pushing throttled full snapshots; commands only over REST.

---

# 2.7 — Phase 2 Architecture Additions (all SHOULD + COULD features)

> **Owner decision (Oct 2026):** time is not constrained, so **every SHOULD and COULD feature in DOC 1 is in scope**, built as **Phase 2** *after* Phase 1 (DOC 4 Steps 1–15 + Checkpoint 4). Module designs: DOC 3 §3.12+; build steps: DOC 4 Steps 16–28. WON'T items stay cut (face recognition, frame storage, hardware, punitive use, billing, multi-mess, native apps). The Phase 1 architecture is unchanged; everything below plugs into existing seams (ports, event bus, `AlertRule`, settings-as-data).

## 2.7.1 Additional technology decisions

| Decision | Chosen | Reason / alternatives | Risk |
|---|---|---|---|
| Web push | `web-push` (VAPID) behind a `PushNotifier` port (`WebPushNotifier`, `NoopNotifier`) | No vendor lock-in; FCM/OneSignal rejected (extra account, SDK weight). iOS delivers push only to **installed** PWAs — documented limitation, in-app prompts remain the primary path | Low |
| Service worker | `vite-plugin-pwa` **injectManifest** (custom SW for push + app-shell precache) | Needed for push events; generateSW can't handle them | Low |
| Image upload | `multer` (memory storage, ≤ 5 MB) → `sharp` (re-encode, **strip EXIF/GPS**, max 1280 px) → `ObjectStorage` port | Server-side re-encoding guarantees no metadata leaks; presigned direct upload rejected (bypasses sanitising) | Low |
| Object storage | `ObjectStorage` port: `LocalDiskStorage` (dev/demo) and `S3Storage` (`@aws-sdk/client-s3`, Cloudflare R2 or S3) | Resolves the "image storage" decision deferred in §2.0; GridFS rejected (bloats Mongo, harder lifecycle); Cloudinary rejected (third-party moderation/ToS) | Low |
| Point-in-polygon (queue zones) | Pure ray-casting function in `services/vision/zone_counter.py` | Avoids a `shapely` dependency | Low |
| Scheduling | Same in-process `Scheduler` (new named jobs) | Still no external queue; volumes tiny | Low |
| Pin majors at install | `web-push`, `multer`, `sharp`, `@aws-sdk/client-s3` | Lockfile pins exact; never upgrade majors mid-build | — |

## 2.7.2 New Mongo entities (all with `_id`, `createdAt`, `updatedAt`)

```
Rating          {sessionId (unique), userId, mealId, stars 1–5, dishVotes[{dish, vote:'up'|'down'}]?, comment? (≤280)}
OptOut          {userId, mealId, createdAt}                       unique(userId, mealId)
Complaint       {sessionId, userId, mealId, tier:1, category:'cold_food'|'undercooked'|'oversalted'|'stale'|'quantity'|'other', note?}
                                                                   unique(sessionId, category); index (mealId, category, createdAt)
HygieneReport   {sessionId, userId, mealId, kind:'foreign_object'|'insect'|'other', imageKey, note?, counterId?, dish?, status:'open'|'resolved', resolvedBy?, resolutionNote?}
TrayHold        {mealId, counterId?, dish?, reportId, status:'held'|'released', releasedBy?, releasedAt?}
WasteLedger     {mealId (unique), cookedPortions, leftoverPortions, advisorUsed:boolean, recordedBy}
MealSummary     {messId, mealId (unique), type, dayOfWeek, totalEntries, peakOccupancy, optOutCount, enrolledCount, appCheckIns, adoptionRatio}
TimetableBreak  {messId, dayOfWeek 0–6, startsAt 'HH:mm', endsAt 'HH:mm', label}
DishStat        {messId, dish, mealType, timesServed, ratingSum, ratingCount, upVotes, downVotes, skipDeviationSum, dps 0–100, updatedAt}
RebateLedger    {userId, mealId, points, reason:'opt_out_honoured'|'redeem_pass'|'adjustment'}   unique(userId, mealId, reason)
FastPass        {userId, mealId, code (4 chars), status:'issued'|'used'|'expired', usedAt?, usedBy?}   unique(userId, mealId)
PushSubscription{userId, endpoint (unique), keys{p256dh, auth}, userAgent?}
DeviceSighting  {deviceId, userId, firstSeenAt, lastSeenAt}       unique(deviceId, userId); TTL 30 d
AuditEvent      {mealId, kind:'random_audit'|'unaccounted_entries'|'device_anomaly', raisedAt, ackedAt?, outcome?:'checked'|'skipped'}
```
`Meal` gains `autoCalibrated: boolean`, `counters?: string[]`. `Alert` gains `subjectKey?` (dedupe key, e.g. the complaint category). `CheckIn` unchanged (it already carries `sessionId`, §2.3).

## 2.7.3 Settings additions (data, not constants)

```
enrolledCount (int), defaultEatRate (0.7), portionsPerPerson (1), safetyMarginPct (8, adaptive 3–15),
counters[{id,label,servicePerMin}]   // default: regular, special
optOutCutoffMin (60), ratingDelayMin (22), walkToMessMin (5),
batchQuality{threshold:5, windowMin:10, cooldownMin:10},
unaccounted{windowMin:10, minAbsolute:8, tolerancePct:25, minCameraEntries:15, cooldownMin:10},
randomAudit{enabled:false, everyN:25}, deviceAnomaly{maxUsersPerDevice:2, maxDevicesPerUser:3, windowMin:30},
rebate{pointsPerOptOut:5, fastPassCost:20, maxFastPassesPerMeal:10, blockAfterViolations:2},
autoCalibrateDemand:false, dpsWeights{rating:0.7, skip:0.3}, imageRetentionDays:30
```

## 2.7.4 Redis additions

| Key | Type | Purpose |
|---|---|---|
| `mp:meal:{m}:ratingdue` | ZSET (score = dueAt, member = `sessionId\|userId`) | Rating prompts due |
| `mp:meal:{m}:auditCounter` | STRING (int) | Entries counted toward the next random-audit flag |
| `mp:meal:{m}:zone:{zoneId}` | STRING (JSON latest zone reading) | Queue-zone counts (split queues) |
| `mp:alert:cooldown:{ruleId}:{m}:{subject}` | STRING + TTL | Per-subject cooldown |
| `mp:meal:{m}:queueManual:{counterId}` | STRING + TTL 10 min | Staff-entered queue length fallback |

## 2.7.5 API additions (`/api/v1`)

| Method & path | Role | Purpose |
|---|---|---|
| `POST/DELETE /optouts` · `GET /optouts/me?mealId` | student | Advance opt-out (before cutoff) |
| `GET /ratings/pending` · `POST /ratings` | student | Post-meal rating (+ dish votes) |
| `POST /complaints` (tier 1) | student | Session-gated batch-quality report |
| `POST /hygiene-reports` (multipart: image + fields) | student | Tier 2 critical report (rate-limited 3/day) |
| `GET /staff/holds` · `GET /admin/hygiene-reports` · `POST /admin/holds/:id/release` · `POST /admin/hygiene-reports/:id/resolve` · `GET /admin/hygiene-reports/:id/image` (5-min signed/streamed) | staff/admin | Quality hold + escalation log |
| `GET /timetable` · `PUT /admin/timetable` | any / admin | Lecture-break schedule |
| `GET /mess/:messId/forecast` | any | Next-60-min predicted occupancy (S1) |
| `PUT /staff/meals/:mealId/queues/:counterId` | staff | Manual queue length fallback |
| `PUT /staff/meals/:mealId/waste` · `GET /staff/prep-advice?mealId` · `GET /admin/waste/summary` | staff/admin | Waste ledger + prep advisor |
| `GET /admin/dishes/leaderboard` · `POST /admin/meals/:mealId/menu` · `POST /admin/meals/:mealId/apply-demand-suggestion` | admin | DPS + calibration |
| `GET /rebates/me` · `POST /fast-passes` · `POST /staff/fast-passes/verify` | student/staff | Rebate points + fast-track pass |
| `PUT /staff/meals/:mealId/audit-mode` · `POST /staff/audit/:id/ack` | staff | Random audit mode |
| `POST /push/subscriptions` · `DELETE /push/subscriptions` | any | Web push |
| `GET /privacy` (static copy) | any | Privacy-by-architecture statement |

**Socket additions:** room `user:{userId}` (joined at handshake); events `rating:due` (user), `hold:raised` / `hold:released` (staff, admin), `fastpass:used` (user). `StatusSnapshot` gains optional `queues[]`, `lectureWave`, `nudge`. `LiveCountPayload` gains optional `zone` (`entrance` default | `regular-queue` | `special-queue`).

## 2.7.6 Phase 2 privacy & safety notes
- **Photos:** server re-encodes and strips EXIF; UI says "photograph the food only, no faces"; admin/staff-only access via short-lived URLs; auto-delete after `imageRetentionDays`; admin can delete any report image.
- **Device ID:** random UUID in `localStorage` — **not** a fingerprint; used only for duplicate-claim detection; flags go to admin, never auto-penalise.
- **Staff "snapshot flash" from the original PRD is replaced** by a count-and-time flash (no image) — frames never leave the vision script.
- **Push endpoints** are personal data: stored per user, deleted on logout/unsubscribe and on 404/410 from the push service.
- **Rebates are a virtual ledger**; real-money rebate and mess-fee integration remain WON'T.
