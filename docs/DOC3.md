# DOC 3 — Module & Coding Architecture: MessPulse

**Status:** Draft for sign-off · **Builds on:** DOC 1 (features M1–M8), DOC 2 (architecture)
**Scope:** Phase 1 = MVP features M1–M8 (§3.1–§3.11). Phase 2 = every SHOULD/COULD feature (§3.12–§3.25 addendum, designed against DOC 2 §2.7) — built only after Phase 1's DOC 4 Step 15 and Checkpoint 4 pass.

---

## 3.0 — Amendments to DOC 1 / DOC 2 (found while designing the code)

> DOC 1 and DOC 2 have been updated in place to match. Treat earlier documents as living: these are the changes.

1. **TTL vs. decay were inconsistent (real bug in the original PRD).** With `TTL = 18 + queueWait + demandFactor` and brackets at 18/26/35 min, a session is hard-expired at ≈ 18–23 min, so the 0.60/0.25 brackets could never be reached. **Fix:** the PRD's "TTL" is the session's **expected stay** `S`. Weight is `1.0` before `S`, then decays by **offsets from `S`**: `0.60` for `S … S+8`, `0.25` for `S+8 … S+17`, `0` after. With zero queue wait `S = 18`, which reproduces the original 18/26/35 table exactly. Redis hard expiry = `S + 17 min`, bounded by a safety cap `maxSessionMin` (default 60).
2. **Geofence result is tri-state** (`inside | outside | unknown`), not boolean — indoor GPS accuracy is often too poor to decide.
3. **Interface Segregation:** `SessionStore` no longer owns entry velocity. Three narrow ports: `SessionStore`, `EntryVelocityStore`, `CameraReadingStore`.
4. **Session timing fields are encoded in the ZSET member** so the 1 s occupancy tick reads one sorted set, not N hashes.
5. **Camera drift control:** camera occupancy = `max(0, count − cameraBaseline)`, with the baseline captured at meal start (the mess is empty then — a free calibration point).
6. **Demo clock:** a `Clock` port with a scalable implementation enables the 3-minute "simulated lunch rush" (M8) without special-casing production code.
7. **`CheckIn` archive carries `sessionId` (unique).** Phase 2 ratings, complaints and hygiene reports are session-gated and reference the session; adding the field in Phase 1 (DOC 2 §2.3, DOC 4 Step 5) avoids a later migration. `CheckInRepository.archive` writes it from `ActiveSession.sessionId`.
8. **Phasing:** SHOULD/COULD are in scope as Phase 2 (owner decision, Oct 2026). Their module designs are §3.12–§3.25; DOC 4 Steps 16–28 build them.

---

## 3.1 — Shared Conventions

### Backend source tree (`apps/api/src`)

```
core/                      PURE domain — no imports from express, mongoose, ioredis, socket.io, pino, node:*
 ├─ timing.ts              computeSessionTiming
 ├─ decay.ts               sessionWeight, sumSessionWeights
 ├─ occupancy.ts           selectOccupancy, estimateWaitMin, occupancyLevel, calibrationRatio
 ├─ windows.ts             suggestBestWindows
 ├─ geofence.ts            evaluateGeofence (haversine)
 ├─ tray.ts                evaluateTrayDepletion
 ├─ scenario.ts            buildLunchRushScenario (seeded, for the simulator)
 └─ otp.ts                 generateOtp, hashOtp, verifyOtpHash
modules/                   one folder per feature (Screaming Architecture)
 ├─ ingest/   ├─ sessions/  ├─ occupancy/  ├─ alerts/
 ├─ auth/     ├─ admin/     ├─ simulator/  └─ realtime/
infra/                     adapters that implement ports
 ├─ redis/    session-store.redis.ts · entry-velocity-store.redis.ts · camera-reading-store.redis.ts · otp-store.redis.ts
 ├─ memory/   in-memory versions of every Redis port (tests + emergency fallback)
 ├─ mongo/    models/*.ts · *.repository.ts
 ├─ mail/     resend.mailer.ts · console.mailer.ts
 ├─ clock.ts  SystemClock · ScalableClock
 ├─ event-bus.ts
 └─ logger.ts (pino + PII redaction)
shared-kernel/             AppError hierarchy, Result helpers, request-id middleware
container.ts               composition root — the ONLY place concrete classes are constructed and wired
app.ts                     builds the Express app from the container (no listen)
server.ts                  listen + start scheduler + graceful shutdown
config.ts                  env parsed with zod; fail fast
```

**Per-module layout:** `<name>.routes.ts` (presentation) · `<name>.service.ts` (use cases) · `<name>.ports.ts` (interfaces the service needs) · `<name>.test.ts`. Repositories and stores live in `infra/`, never in a module folder.

### Allowed import directions (enforced by an ESLint `no-restricted-imports` rule)

| From → To | `core/` | `modules/*/service` | `modules/*/routes` | `infra/` | other module |
|---|---|---|---|---|---|
| `core/` | ✔ | ✘ | ✘ | ✘ | ✘ |
| `service` | ✔ | ✔ (own) | ✘ | ✘ (ports only) | ✔ **only via a port or the event bus** |
| `routes` | ✘ | ✔ (own) | ✘ | ✘ | ✘ |
| `infra/` | ✔ (types) | ✘ | ✘ | ✔ | ✘ |

### Shared contracts (`packages/shared`, zod → `z.infer`)

```ts
type Role = 'student' | 'staff' | 'admin';

const LiveCountPayload = z.object({
  messId: z.string(), seq: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),         // running net count from the script
  inCount: z.number().int().nonnegative(),       // cumulative since script start
  outCount: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative().optional(), // people visible now (optional cross-check)
  capturedAt: z.number().int(),                  // epoch ms, camera side (informational only)
});

type OccupancyLevel = 'low' | 'medium' | 'high';
type StatusSnapshot = {
  messId: string; mealId: string | null; ts: number;
  state: 'closed' | 'open';
  occupancy: { value: number; capacity: number; level: OccupancyLevel;
               source: 'camera' | 'sessions'; stale: boolean };
  activeSessions: number; decayWeightedSessions: number;
  waitMin: number; waitRangeMin: [number, number];
  bestWindows: { startsAt: number; endsAt: number; expectedLevel: OccupancyLevel; estWaitMin: number }[];
  camera: { lastSeenAt: number | null; stale: boolean };
};

type SessionDTO = { sessionId: string; mealId: string; checkedInAt: number;
                    expectedStayEndsAt: number; hardExpiresAt: number; geofence: 'inside'|'outside'|'unknown' };
type AlertDTO = { id: string; ruleId: string; mealId: string; severity: 'info'|'warning'|'critical';
                  message: string; raisedAt: number; ackedAt?: number; clearedAt?: number };
const SocketEvents = { StatusUpdate: 'status:update', AlertRaised: 'alert:raised',
                       AlertCleared: 'alert:cleared', CameraHealth: 'camera:health' } as const;
```

### Error model (applies to every module)

```ts
abstract class AppError extends Error { abstract code: string; abstract httpStatus: number; details?: unknown }
// ValidationError(422) AuthError(401) ForbiddenError(403) NotFoundError(404) ConflictError(409)
// RateLimitError(429) DependencyUnavailableError(503)  — all declared in shared-kernel/
```
- **Services throw `AppError` subclasses; they never return `null` for "failure".** Repositories may return `null` for "not found" only for `findX`, and the service converts to `NotFoundError`.
- **One Express error middleware** maps `AppError` → `{error:{code,message,details}}`; anything else → `500 INTERNAL_ERROR` with a generic message and a `requestId` (stack goes to logs only).
- **Every background job** (`Scheduler`) wraps each run in `try/catch` that logs with the job name and continues — a failing tick must never kill the process or silently stop the loop.
- **Event-bus handlers** are isolated: one handler throwing does not stop others; the bus logs it.
- **Client:** `lib/http.ts` throws `ApiError{code,status}`; `lib/errors.ts` maps `code → user-friendly text`; raw messages are never shown to users.

### Ports used across modules (declared once, in `core/ports.ts`, typed with `shared` types)

```ts
interface Clock { now(): number }                         // epoch ms
interface EventBus { publish<K extends EventName>(e: K, p: EventPayload[K]): void; subscribe(...): Unsubscribe }
interface SessionStore {
  start(s: ActiveSession): Promise<'created' | 'already_active'>;
  getActiveForUser(userId: string, mealId: string): Promise<ActiveSession | null>;
  end(userId: string, mealId: string): Promise<ActiveSession | null>;
  listActive(mealId: string, now: number): Promise<ActiveSession[]>;
  removeExpired(mealId: string, now: number): Promise<ActiveSession[]>;
}
interface EntryVelocityStore { record(mealId: string, eventId: string, at: number, n: number): Promise<void>;
                               countSince(mealId: string, sinceMs: number): Promise<number>; }
interface CameraReadingStore { saveLatest(mealId: string, r: CameraReading): Promise<void>;
                               getLatest(mealId: string): Promise<CameraReading | null>; }
```

### Naming & style rules (Clean Code)
- Functions are **verb phrases**, ≤ 20 lines, ≤ 3 parameters (use an options object beyond that); booleans are predicates (`isStale`, `hasActiveSession`); units in names (`queueWaitSec`, `expectedStayMin`).
- Command/query separation: `get*/list*/compute*/estimate*` return values and have no side effects; `start*/record*/end*/save*` do things and return `void` or a result token.
- All time arithmetic is **epoch ms + explicit unit suffixes**; no `new Date()` / `Date.now()` outside `SystemClock` (use `clock.now()` or a passed-in `now`).
- No `any`; no non-null `!` assertions on external data; no default exports except React pages.

---

## 3.2 — Feature M1: Live Head-Count Ingestion (Vision Adapter + Ingest endpoint)

### MODULE STRUCTURE

```
services/vision/
 ├─ main.py               CLI entry: parse config, wire objects, run loop (no logic)
 ├─ config.py             VisionConfig dataclass (source, api_url, ingest_key, mess_id, post_interval_s,
 │                        line=((x1,y1),(x2,y2)), entry_side, stride, imgsz, min_track_frames)
 ├─ capture.py            FrameSource: iterate frames from webcam | rtsp | file; reconnect on failure
 ├─ detector.py           PersonTracker: wraps YOLOv8n .track(); returns list[TrackedPerson(id, cx, cy)]
 ├─ line_counter.py       LineCrossingCounter — PURE: update(tracks) -> CrossingDelta(in_n, out_n)
 ├─ reporter.py           ReadingReporter: seq numbers, HTTP POST, retry+backoff, bounded buffer
 ├─ tests/                test_line_counter.py · test_reporter.py
 └─ requirements.txt      pinned versions
apps/api/src/modules/ingest/
 ├─ ingest.routes.ts      POST /mess/live-count (ingest-key middleware → zod → service)
 ├─ ingest.service.ts     IngestService.recordReading(payload, now)
 └─ ingest.ports.ts       uses CameraReadingStore, EntryVelocityStore, MealRepository, EventBus, Clock
```

### FUNCTION & CLASS DESIGN

**Python**
- `LineCrossingCounter.update(tracks) -> CrossingDelta` — keeps `last_side[track_id]` and `frames_seen[track_id]`. Computes the signed side of the centroid relative to the line (cross product). A crossing is counted **once** when the side flips from `-` to `+` (or reverse) **and** the centroid has moved beyond a hysteresis band (`±hysteresis_px`) **and** `frames_seen ≥ min_track_frames`. Direction → `in` or `out` using `entry_side`. Stale tracks are evicted after N frames unseen. *Owns:* per-track memory. *Hides:* geometry.
- `ReadingReporter.report(in_total, out_total, now) -> None` — builds payload with `seq = next_seq()`, `count = max(0, in_total − out_total)`, POSTs with a 3 s timeout; on failure retries (exponential backoff, jitter) and appends to `deque(maxlen=100)`; on next success flushes **oldest first**. *Single job:* reliable delivery.
- `main.run()` — loop: `for frame in source: tracks = tracker.track(frame); delta = counter.update(tracks); totals += delta; if due: reporter.report(...)`. Frame stride (`--stride 2`) skips frames for CPU headroom.

**TypeScript**
- `IngestService.recordReading(payload: LiveCountPayload, now: number): Promise<IngestResult>` — (1) look up current meal for `messId` (`null` → accept but store as "off-hours"); (2) `getLatest` → if `payload.seq <= latest.seq` return `{ignored:true}`; (3) capture `cameraBaseline` on the first reading inside the meal's baseline window (`startsAt − 5 min … startsAt + 2 min`); (4) compute `inDelta = max(0, payload.inCount − latest.inCount)` (handles script restarts: if `inCount < latest.inCount` treat as a counter reset and use `payload.inCount`); (5) `saveLatest`, `velocity.record(...)`; (6) publish `reading.recorded`. Returns `{accepted:true}`.
- SRP check: *no* occupancy math here (that is M4) and no socket calls (that is realtime).

### INTERFACES & CONTRACTS
- **Wire contract:** `LiveCountPayload` (shared). Response `200 {accepted:boolean, ignored?:boolean}`.
- **Promises to callers:** idempotent per `seq`; never throws on duplicates. **Keeps private:** baseline logic, counter-reset detection.
- **Auth:** header `X-Ingest-Key`, constant-time compared; not a JWT.

### ERROR HANDLING STRATEGY
| Failure | Owner | Behaviour |
|---|---|---|
| Camera stream drops | `FrameSource` | Log WARN, retry open with backoff (1→30 s); the reporter keeps posting `heartbeat` readings only if frames flow; otherwise the **backend's staleness check** reveals the outage (single source of truth) |
| HTTP failure / timeout | `ReadingReporter` | Buffer + backoff; if buffer is full, drop the oldest and log |
| 401 from API | `ReadingReporter` | Log ERROR once and exit non-zero (misconfigured key — don't loop forever) |
| Invalid payload | `ingest.routes` | `422 VALIDATION_ERROR` |
| Bad/absent ingest key | middleware | `401 AUTH_ERROR` (no detail about which part) |
| Implausible jump (|Δcount| > 150 in one post) | `IngestService` | Accept, log WARN, flag in `camera:health` (don't silently "fix") |

### EDGE CASES
- Person lingers on the line → hysteresis + once-per-track crossing rule.
- Track ID switches (occlusion) → may double-count; documented known error; accuracy is checked on a test clip (±10%).
- Same door used for entry and exit → `entry_side` defines direction; two doors → run two script instances with different `--line` and a `--camera-id` (deferred; single door in MVP).
- Script restarts mid-meal → `inCount` smaller than stored → treated as counter reset (step 4).
- Clock skew camera vs server → `capturedAt` is informational; the **server receive time** is authoritative.
- Posting during off-hours → stored but ignored by occupancy.

### PERFORMANCE CONSIDERATIONS
- Use YOLOv8n at `imgsz=480–640`, `stride=2–3`, `device=cpu` by default; target ≥ 8 FPS effective. Don't optimise further until the spike shows it's needed.
- Ingest payload < 1 KB, 1 request / 5 s; endpoint does two Redis writes — no DB writes on the hot path.

### TESTING PLAN
- **Unit (pytest):** `LineCrossingCounter` with synthetic tracks — clean in-crossing, clean out-crossing, jitter around the line (0 counts), track that appears on the far side (0 counts), two simultaneous tracks, eviction of stale tracks. `ReadingReporter`: monotonic `seq`, retry ordering, buffer overflow, 401 exit.
- **Unit (Vitest):** `IngestService` with in-memory ports — duplicate `seq`, counter reset, baseline capture, off-hours reading.
- **Integration (Supertest):** missing/invalid key → 401; valid payload → 200; invalid body → 422.
- **Manual:** 5-minute recorded clip with a hand count (accuracy gate, DOC 1 A3).

---

## 3.3 — Feature M2: Live Occupancy & Wait-Time View (`/student`)

### MODULE STRUCTURE

```
apps/api/src/modules/occupancy/
 ├─ occupancy.routes.ts     GET /mess/:messId/status
 ├─ occupancy.service.ts    OccupancyService: tick(now), getLatest(messId)
 └─ occupancy.ports.ts      MealRepository, SettingsRepository, SnapshotRepository (history for windows)
apps/api/src/core/occupancy.ts, windows.ts
apps/web/src/features/student/
 ├─ StudentPage.tsx            layout + state branching only
 ├─ components/OccupancyGauge.tsx   pure display: value, capacity, level, badge
 ├─ components/WaitTimeCard.tsx     "~10–14 min" + "estimated" label
 ├─ components/BestWindows.tsx      next-hour list
 ├─ components/CheckInCard.tsx      (M3) scan/tap + active-session countdown
 ├─ hooks/useLiveStatus.ts          GET once + socket subscription → StatusSnapshot | status
 └─ tests/
apps/web/src/lib/socket.ts          singleton socket with JWT, reconnect, typed events
```

### FUNCTION & CLASS DESIGN

**Domain (`core/occupancy.ts`)**
```ts
estimateWaitMin(i: { occupancy: number; seatCapacity: number; servicePerMin: number }): number
  // queued = max(0, occupancy − seatCapacity); wait = ceil(queued / servicePerMin); servicePerMin ≤ 0 → treated as "unknown" (returns 0 and flags)
waitRange(waitMin: number): [number, number]            // [floor(0.8·w), ceil(1.2·w)] — honest uncertainty
occupancyLevel(value: number, capacity: number): OccupancyLevel   // <0.5 low, <0.8 medium, else high (thresholds from settings)
smoothEma(prev: number | null, next: number, alpha = 0.3): number  // wait-time jitter control
```
**Domain (`core/windows.ts`)** — `suggestBestWindows(history: BucketAverage[], profile: BaselineProfile, now, horizonMin=60): Window[]`: uses 5-minute buckets of past snapshots for the same weekday + meal type; if fewer than 3 days of history, falls back to a static baseline profile (shaped like a lunch wave, shipped as JSON) `[ASSUMPTION]`. Returns the 3 lowest-occupancy 10-minute windows.

**Service** — `OccupancyService.tick(now)`: the *only* place that composes camera reading + sessions + settings into a `StatusSnapshot` (details in M4). `getLatest(messId)` returns the cached snapshot (no recompute per request).

**Web hook** — `useLiveStatus()` owns: initial fetch, socket subscription, connection state (`'connecting'|'live'|'reconnecting'|'offline'`), `lastUpdatedAt`. Exposes `{snapshot, connection}`. Components never call fetch or touch the socket directly.

### INTERFACES & CONTRACTS
- `GET /mess/:messId/status → StatusSnapshot` (identical to `status:update` payload).
- UI **never computes** level/wait — it renders `snapshot.occupancy.level`, `snapshot.waitRangeMin`. Colour is never the only signal (text label + icon for accessibility).

### ERROR HANDLING STRATEGY
- Socket disconnect → banner "Reconnecting… last updated 12 s ago"; data stays visible; auto-retry with backoff.
- `state:'closed'` (no meal now) → friendly "Mess is closed — next meal at 7:30 pm", gauge hidden.
- `stale:true` → badge "Estimated" with tooltip; never hide numbers silently.
- 401 → redirect to login; other API errors → inline message from `lib/errors.ts`.

### EDGE CASES
- `capacity = 0` or unset → `occupancyLevel` returns `'low'` and the admin gets a settings warning (no divide-by-zero).
- Occupancy above capacity (overflow) → clamp the gauge at 100% but show the real number.
- First load before the first tick → API returns a "warming up" snapshot (`state:'closed'`, `occupancy.value = 0`, `stale:true`).
- Phone sleeps/wakes → on `visibilitychange` re-fetch status (snapshots are idempotent).
- Meal ends while page open → snapshot flips to `closed` via the same event.

### PERFORMANCE CONSIDERATIONS
- Server throttles emits to ≤ 1/s and sends **one** shared payload per room (not per socket).
- Web: memoise `OccupancyGauge` on `value/level`; no chart libraries on `/student` (keep the PWA light); lazy-load `/admin` charts via `React.lazy`.
- Don't optimise bundle size beyond route-level code splitting.

### TESTING PLAN
- **Unit:** `estimateWaitMin` (below capacity → 0, exact capacity, overflow, zero service rate), `occupancyLevel` boundaries (49/50/79/80%), `suggestBestWindows` (history vs. fallback), `smoothEma`.
- **Component (Vitest + Testing Library):** `OccupancyGauge` per level, `WaitTimeCard` with `stale`, `StudentPage` in `closed` / `reconnecting` states (mock `useLiveStatus`).
- **Integration:** `GET /status` with in-memory ports returns the exact shared schema (parse with zod).
- **E2E (SHOULD):** simulator running → `/student` gauge changes within 2 s.

---

## 3.4 — Feature M3: App Check-In Session (Queue-Adjusted Timing + Probabilistic Decay)

### MODULE STRUCTURE

```
apps/api/src/core/timing.ts, decay.ts, geofence.ts
apps/api/src/modules/sessions/
 ├─ sessions.routes.ts       POST /sessions · GET /sessions/me/active · DELETE /sessions/me/active
 ├─ sessions.service.ts      SessionService: checkIn · startSession · endEarly · reapExpired
 ├─ meal-token.ts            signMealToken / verifyMealToken (JWT: messId, mealId, exp)
 └─ sessions.ports.ts        SessionStore, CheckInRepository, MealRepository, SettingsRepository, QueueWaitProvider
apps/api/src/infra/redis/session-store.redis.ts   (+ memory/session-store.memory.ts)
apps/api/src/infra/mongo/check-in.repository.ts
apps/web/src/features/student/components/CheckInCard.tsx, hooks/useActiveSession.ts, lib/geolocation.ts
```

### FUNCTION & CLASS DESIGN

**Domain**
```ts
computeSessionTiming(i: { baseMealMin: number; queueWaitSec: number; menuDemandFactorMin: number;
                          decayTailMin: number /* =17, derived from settings */; maxSessionMin: number })
  : { expectedStaySec: number; hardExpirySec: number }
  // expectedStay = (baseMealMin + menuDemandFactorMin)*60 + queueWaitSec
  // hardExpiry   = min(expectedStay + decayTailMin*60, maxSessionMin*60)   // expectedStay itself is also clamped to hardExpiry

sessionWeight(s: { checkedInAt: number; expectedStaySec: number; hardExpirySec: number },
              now: number, decay: DecaySettings): number
  // elapsed = (now − checkedInAt)/1000
  // elapsed ≥ hardExpirySec → 0
  // elapsed < expectedStaySec → 1.0
  // else offset = (elapsed − expectedStaySec)/60 → first tail stage with offset < untilOffsetMin → its weight; beyond last → 0

sumSessionWeights(sessions, now, decay): number

evaluateGeofence(geo: {lat,lng,accuracyM} | undefined, fence: {lat,lng,radiusM}): 'inside'|'outside'|'unknown'
  // undefined or accuracy > 150 m → 'unknown'; haversine distance ≤ radius → 'inside'
```
**Service (`SessionService`)**
- `checkIn(userId, {mealToken, geo})` — **orchestrates only**: `verifyMealToken` → resolve meal/settings → `evaluateGeofence` → `startSession({...})`. (≤ 15 lines.)
- `startSession({userId, mealId, method, geofence})` — **the single place a session is created** (also used by the simulator): gets `queueWaitSec` from `QueueWaitProvider`, `computeSessionTiming`, `store.start`, on `'already_active'` throws `ConflictError`, archives nothing yet, publishes `session.started`.
- `endEarly(userId, mealId)` — `store.end` → archive with `endReason:'manual'` → publish `session.ended`. Idempotent (no active session → no-op).
- `reapExpired(mealId, now)` — `store.removeExpired` → batch `CheckInRepository.archive(...)` → publish `session.ended` for each. Called by the scheduler every 5 s; safe to re-run.

**Redis store (hidden detail)** — `start`: `SET mp:user:{u}:meal:{m} {sessionId} NX EX hardExpirySec+60`; if set, `ZADD mp:meal:{m}:sessions {expiresAtMs} {compactJsonMember}` where the member encodes `{sessionId,userId,checkedInAt,expectedStaySec,hardExpirySec}`; `listActive`: `ZRANGEBYSCORE (now +inf`; `removeExpired`: `ZRANGEBYSCORE -inf now` then `ZREM` and `DEL` user keys, in one `MULTI`. Callers never see key names or the member encoding (**information hiding**).

**Web** — `CheckInCard`: states `idle | locating | submitting | active | error`. `lib/geolocation.ts` wraps `navigator.geolocation` with a 5 s timeout and returns `undefined` on denial (never throws into UI). QR flow: the QR encodes `…/student/checkin?t=<mealToken>`; the page reads the token and calls `POST /sessions`. `useActiveSession` shows the expected-stay countdown and an "I'm done" button (`DELETE`).

### INTERFACES & CONTRACTS
- `POST /sessions {mealToken: string, geo?: {lat,lng,accuracy}} → 201 SessionDTO`. Raw lat/lng are used **only in memory** to compute the tri-state and are never persisted or logged.
- `QueueWaitProvider { getEstimatedWaitSec(mealId): Promise<number> }` implemented by `OccupancyService` (injected in `container.ts`) — **sessions does not import occupancy** (no cycle).
- Archive record (`CheckIn`): timing fields, `geofence`, `method`, `endReason`.

### ERROR HANDLING STRATEGY
| Condition | Error | HTTP | User message |
|---|---|---|---|
| Token bad/expired | `ValidationError('MEAL_TOKEN_INVALID')` | 422 | "This QR code has expired — scan the one at the entrance." |
| No meal open | `ConflictError('NO_ACTIVE_MEAL')` | 409 | "No meal is being served right now." |
| Already checked in | `ConflictError('ALREADY_CHECKED_IN')` | 409 | UI treats as success and shows the active session |
| Redis unavailable | `DependencyUnavailableError` | 503 | "Check-in is temporarily unavailable — you can still eat; just try again." |
| Geolocation denied | not an error | — | Proceeds with `geofence:'unknown'` |

### EDGE CASES
- **Double-tap / retry:** `SET NX` makes check-in idempotent per user+meal.
- **Token replay from outside:** allowed but recorded `geofence:'outside'` (soft signal; counted with `trust` unaffected in MVP — flagged for admin review later).
- **Check-in near meal end:** `hardExpirySec` is not clamped to meal end in MVP; the reaper also expires everything at `meal.endsAt + 20 min`.
- **Phone clock wrong:** only server time is used.
- **Server restart:** sessions survive (Redis); the reaper resumes; in-memory fallback loses sessions (documented, demo-only).
- **Queue wait changes after entry:** timing is fixed at check-in (immutable) — simple and explainable.
- **Meal ends with sessions open:** reaper archives them as `expired`.

### PERFORMANCE CONSIDERATIONS
- Occupancy tick reads **one** sorted set; no per-session HGET (design decision #4).
- Archive writes are batched (`insertMany`) every reaper run — not one write per session.
- **Do not** add a Mongo write on the check-in request path beyond the archive-at-end design.

### TESTING PLAN
- **Unit (table-driven):** `computeSessionTiming` (no queue → 18 min; queue 10 min; demand 5 min; cap hit), `sessionWeight` at `S−1 s`, `S`, `S+7:59`, `S+8`, `S+16:59`, `S+17`, and `maxSessionMin`; `evaluateGeofence` (inside, outside, bad accuracy, missing).
- **Service (in-memory store + fake `Clock`):** checkIn happy path; duplicate → 409; expired token → 422; `reapExpired` after advancing the clock; `endEarly` idempotency.
- **Integration (real Redis in CI):** `RedisSessionStore` contract test suite **run against both** the Redis and in-memory implementations (same test file — proves substitutability, the Liskov Substitution Principle).
- **E2E (SHOULD):** scan token URL → active session shown → "I'm done" removes it.

---

## 3.5 — Feature M4: Camera-Calibrated Occupancy Estimate

### MODULE STRUCTURE

```
apps/api/src/core/occupancy.ts      selectOccupancy, calibrationRatio
apps/api/src/modules/occupancy/occupancy.service.ts    (shared with M2; this section covers its calibration logic)
apps/api/src/infra/mongo/snapshot.repository.ts          save every 30 s; query history by weekday/meal
apps/api/src/modules/realtime/realtime.gateway.ts        subscribes to status.updated, camera health
```

### FUNCTION & CLASS DESIGN
```ts
selectOccupancy(i: { camera: CameraReading | null; cameraBaseline: number; decayWeighted: number;
                     lastRatio: number | null; now: number; staleCameraSec: number })
  : { value: number; source: 'camera' | 'sessions'; stale: boolean; ratio: number | null }
  // fresh camera:  value = max(0, camera.count − baseline); source='camera'; ratio = value / max(decayWeighted, 1) clamped [1, 10]
  // stale/missing: value = round(decayWeighted × (lastRatio ?? 1)); source='sessions'; stale = true
calibrationRatio(prev: number | null, observed: number, alpha = 0.2): number   // EMA, clamped
```
- **Why a ratio:** only the fraction of diners who check in is visible to sessions. While the camera is fresh we learn that fraction; if the camera dies we scale the session estimate by it instead of under-reporting (default 1 = lowest confidence).
- `OccupancyService.tick(now)` — steps: resolve current meal → `getLatest` camera → `listActive` sessions → `sumSessionWeights` → `selectOccupancy` → `estimateWaitMin` → `smoothEma` → assemble `StatusSnapshot` → cache → `publish('status.updated')`. Every 30 s also `snapshotRepository.save(...)`.
- Admin gets the **secondary line** `decayWeightedSessions` (already in the snapshot) and the ratio via `camera:health`.

### INTERFACES & CONTRACTS
- Input ports: `CameraReadingStore`, `SessionStore`, `MealRepository`, `SettingsRepository`, `Clock`, `EventBus`, `SnapshotRepository`.
- Output: `StatusSnapshot` + event `status.updated`; the **only** writer of the snapshot.

### ERROR HANDLING STRATEGY
- `tick` never throws: a failing dependency makes it publish the last good snapshot with `stale:true` and log ERROR (the scheduler's wrapper is the safety net). Two consecutive failures raise an admin-visible `camera:health` warning.
- Missing settings → seed defaults at boot (fail-fast if seeding fails), not at tick time.

### EDGE CASES
- No camera reading ever (script not started) → `source:'sessions'`, `stale:true`, ratio default 1.
- Camera shows 0 but sessions > 0 → camera wins (ground truth); ratio clamps at 1.
- Baseline missing (script started mid-meal) → baseline = 0, flagged in `camera:health` (`baselineMissing:true`); admin can "recalibrate to 0" in settings (`PATCH settings.cameraBaselineOverride`).
- Counter drift over a long meal → baseline re-captured at each meal start (design decision #5).
- Clock jump / DST → all server math in UTC epoch.

### PERFORMANCE CONSIDERATIONS
- Tick interval 1 s; each tick is 3 Redis reads (camera, sessions ZRANGE, nothing else) + pure math. Settings/meal are cached 30 s in-process.
- Avoid premature caching of sessions list; at ~1,000 members the ZRANGE is cheap.

### TESTING PLAN
- **Unit:** `selectOccupancy` (fresh, stale at 29/30/31 s, null camera, baseline subtraction, clamp at 0, ratio clamp), `calibrationRatio` EMA.
- **Service (fake clock):** advance time past `staleCameraSec` → snapshot flips to `stale:true` and `source:'sessions'`; resume readings → flips back.
- **Integration:** ingest POST → `GET /status` reflects it within one tick.

---

## 3.6 — Feature M5: Staff Controller — Calm Screen + Tray-Depletion Alert

### MODULE STRUCTURE

```
apps/api/src/core/tray.ts
apps/api/src/modules/alerts/
 ├─ alert-engine.ts             AlertEngine: register(rule), evaluate(ctx)
 ├─ alert-rule.ts               interface AlertRule { id; evaluate(ctx): RuleOutcome }
 ├─ rules/tray-depletion.rule.ts
 ├─ alerts.service.ts           AlertService: ack, list, handleTick
 ├─ alerts.routes.ts            GET /staff/alerts · POST /staff/alerts/:id/ack · PUT /staff/meals/:mealId/trays
 └─ alerts.ports.ts             AlertRepository, MealRepository, EntryVelocityStore, CameraReadingStore
apps/web/src/features/staff/
 ├─ StaffPage.tsx · components/{OccupancyHeadline, TrayProgress, AlertBanner, AlertFeed, TrayCapacityForm, EnableSoundButton}.tsx
 ├─ hooks/{useAlerts.ts, useAlertSound.ts}
```

### FUNCTION & CLASS DESIGN
```ts
evaluateTrayDepletion(i: { enteredSoFar: number; velocityPerMin: number; trayCapacityPortions: number;
                           portionsPerPerson: number; horizonMin: number; warnRatio: number; clearRatio: number;
                           alreadyOpen: boolean }): 'raise' | 'clear' | 'none'
  // projected = (enteredSoFar + velocityPerMin × horizonMin) × portionsPerPerson
  // raise if !alreadyOpen && projected ≥ trayCapacityPortions × warnRatio (default 0.85, horizon 10 min)
  // clear if  alreadyOpen && projected <  trayCapacityPortions × clearRatio (default 0.70)  — hysteresis stops flapping
```
- `TrayDepletionRule implements AlertRule` — builds the inputs from `RuleContext` (velocity from `EntryVelocityStore.countSince(now − 5 min)/5`, `enteredSoFar` from camera `inCount` since meal start, tray capacity from `Meal`) and calls the pure function. **Skips (returns `none`) when staff has not entered a tray capacity** — and the staff screen shows a gentle "Enter tray capacity to enable alerts".
- `AlertEngine.evaluate(ctx)` loops registered rules; **adding a rule never edits this class** (Open/Closed Principle).
- `AlertService.handleTick(now)` — for each outcome: `raise` → dedupe on one open alert per `(ruleId, mealId)` → cooldown check → persist → `publish('alert.raised')`; `clear` → set `clearedAt` → `publish('alert.cleared')`. `ack` marks `ackedBy/ackedAt` (does not clear; the condition clearing does).
- Web: `useAlertSound` plays a soft chime via Web Audio **only after** the user taps "Enable sound" once (browser autoplay policy); `AlertBanner` never steals focus or blocks the screen.

### INTERFACES & CONTRACTS
- `PUT /staff/meals/:mealId/trays {capacityPortions: number}` → `200 {mealId, capacityPortions}`; raising capacity (refill) lets the rule clear naturally.
- Alert payloads typed as `AlertDTO`; message text built **server-side** (`"Trays may run out in ~8 min at the current inflow"`), localisable later.

### ERROR HANDLING STRATEGY
- Invalid capacity (≤ 0, non-integer, > 10,000) → `422 VALIDATION_ERROR`.
- A throwing rule is caught **per rule** in the engine (logged with `ruleId`); other rules still run.
- Alert persistence failure → still emit the realtime alert (staff safety first), log ERROR and retry persistence on the next tick.

### EDGE CASES
- Velocity spike from one noisy camera post → velocity is computed over a 5-minute window, not per post.
- Staff forgets to enter capacity → no alert, visible hint.
- Meal ends with an open alert → cleared with `reason:'meal_ended'`.
- Duplicate alert after refresh → one open alert per `(ruleId, mealId)`; UI loads open alerts from `GET /staff/alerts?open=true`.
- Cooldown (3 min) prevents re-raise immediately after a clear.
- Multiple staff tablets → all receive the same events; `ack` is last-write-wins and idempotent.

### PERFORMANCE CONSIDERATIONS
- Rules are evaluated on the existing 1 s tick but only recomputed when velocity data changed (cheap anyway). No polling from the tablet — events only.

### TESTING PLAN
- **Unit:** `evaluateTrayDepletion` (below/above warn, between warn and clear = no flap, no capacity, zero velocity).
- **Service (fake clock + in-memory repo):** raise once; cooldown; clear; ack; per-rule exception isolation.
- **Component:** `AlertBanner` and `TrayCapacityForm` validation; `StaffPage` calm state (no banner, no sound).
- **Integration:** `PUT trays` → alert clears after next tick in a simulated refill.

---

## 3.7 — Feature M6: Admin Command Center — Core Analytics & Controls

### MODULE STRUCTURE

```
apps/api/src/modules/admin/
 ├─ admin.routes.ts         GET /admin/mess/:id/timeseries · GET /admin/mess/:id/decay-curve · GET/PATCH /admin/mess/:id/settings
 ├─ admin.service.ts        AdminService: getTimeSeries, getDecayCurve, getSettings, updateSettings
 └─ admin.ports.ts          SnapshotRepository, SettingsRepository, SessionStore, Clock
apps/web/src/features/admin/
 ├─ AdminPage.tsx (tabs: Live · History · Settings)
 ├─ components/{OccupancyChart, DecayCurveChart, CameraHealthCard, SettingsForm, SimulatorControls}.tsx
 └─ hooks/{useTimeSeries, useSettings, useCameraHealth}.ts
```

### FUNCTION & CLASS DESIGN
- `AdminService.getTimeSeries(messId, from, to, maxPoints=300)` — queries `OccupancySnapshot`, **downsamples server-side** (bucket average) and returns `{ts, camera, sessionEstimate, decayWeighted, waitMin}[]`.
- `AdminService.getDecayCurve(messId)` — returns (a) the theoretical weight curve for a default session (`sessionWeight` evaluated per minute from settings) and (b) the live weight **histogram** of active sessions. Reuses core functions — no formulas in the admin module.
- `AdminService.updateSettings(messId, patch)` — validates with `SettingsPatchSchema` (zod) including **cross-field rules** (e.g. `warnRatio > clearRatio`, tail offsets strictly increasing, weights within 0–1), merges, persists, publishes `settings.changed` (the occupancy service invalidates its cache). Writes an audit log line (`pino`, no PII).
- Web `SettingsForm` uses the same shared zod schema for client-side validation (single source of truth); `CameraHealthCard` shows last-seen, stale flag, baseline status, learned ratio.

### INTERFACES & CONTRACTS
- Admin endpoints require role `admin` (staff may `GET` settings but not `PATCH`).
- `SettingsDTO` = shared zod type; PATCH is partial; unknown keys rejected (`.strict()`).

### ERROR HANDLING STRATEGY
- Invalid settings → `422` with per-field `details` shown next to the inputs.
- Time range too large (> 31 days) → `422 RANGE_TOO_LARGE`.
- Chart endpoints returning empty data → UI shows an empty-state message (not an error).

### EDGE CASES
- Changing capacity/decay mid-meal → applies to subsequent ticks; **existing sessions keep their stored timing** (immutable), documented in the UI helper text.
- Two admins editing at once → `updatedAt` version check; conflict returns `409` and the form reloads.
- Seeded vs. live data → charts accept both; the simulator writes the same snapshot collection.
- Timezone → API returns UTC epoch; charts format in `Asia/Kolkata`.

### PERFORMANCE CONSIDERATIONS
- Downsample on the server; index `(messId, ts)`; lazy-load charts (`React.lazy`) and Recharts only on `/admin`.
- Live tab reuses the socket `status:update` — **no polling**.

### TESTING PLAN
- **Unit:** downsample function; `SettingsPatchSchema` cross-field rules; `getDecayCurve` shape.
- **Integration:** PATCH settings → next snapshot reflects new capacity; staff token gets `403` on PATCH.
- **Component:** `SettingsForm` validation messages; `DecayCurveChart` with fixture data.

---

## 3.8 — Feature M7: Lightweight Role-Based Access

### MODULE STRUCTURE

```
apps/api/src/core/otp.ts                generateOtp (crypto.randomInt), hashOtp (HMAC-SHA256 + secret), verifyOtpHash (timingSafeEqual)
apps/api/src/modules/auth/
 ├─ auth.routes.ts            POST /auth/otp/request · /auth/otp/verify · /auth/staff/login · GET /auth/me
 ├─ auth.service.ts           AuthService: requestOtp, verifyOtp, loginStaff
 ├─ token.service.ts          TokenService: sign(user) / verify(token) — the only JWT code
 ├─ auth.middleware.ts        requireAuth · requireRole(...roles) · requireIngestKey
 └─ auth.ports.ts             OtpStore, UserRepository, Mailer, Clock, RateLimiter
apps/api/src/modules/realtime/socket-auth.ts      authenticateSocket(handshake) → Principal (reuses TokenService)
apps/web/src/features/auth/ (LoginPage, OtpForm, StaffPinForm, useAuth.ts, ProtectedRoute.tsx)
```

### FUNCTION & CLASS DESIGN
- `AuthService.requestOtp(email)` — normalise → check allow-listed domain (`ALLOWED_EMAIL_DOMAINS`) → rate-limit (3 / 10 min per email, 20 / hour per IP) → `generateOtp()` → `otpStore.save(email, hashOtp(code), ttl=600)` → `mailer.send(...)`. **Always returns `202`** regardless of whether the email exists/allowed (no user enumeration).
- `AuthService.verifyOtp(email, code)` — fetch record → `attempts += 1` (max 5, then lock for 10 min) → `verifyOtpHash` → on success delete OTP, `upsert` student user, `tokenService.sign`.
- `AuthService.loginStaff(identifier, pin)` — bcrypt compare, with a small fixed delay on failure; backoff after 5 failures.
- `TokenService.sign(user) → string` — claims `{sub, role, exp}`; expiry `student 7 d`, `staff/admin 12 h` `[ASSUMPTION]`; HS256, secret from env (≥ 32 chars, validated at boot).
- `requireRole('admin')` middleware returns `403` (not `401`) when the token is valid but the role is insufficient. `requireIngestKey` uses `timingSafeEqual`.
- Mailers: `ConsoleMailer` logs `OTP for a***@college.edu: 123456` **in dev/demo only** (guarded by `NODE_ENV !== 'production' || DEMO_MODE`), `ResendMailer` for real delivery.
- Web `ProtectedRoute({roles})` is a UX convenience only — **the server is the authority**.

### INTERFACES & CONTRACTS
- Responses: `verify → {token, user:{id, role, name}}`; token sent as `Authorization: Bearer`. Stored in memory + `localStorage` for PWA persistence `[KNOWN RISK: XSS exposure; accepted for a hackathon; httpOnly cookie is the upgrade]`.
- Principal type `{userId, role}` attached to `req.principal`; services receive `Principal`, never raw requests.

### ERROR HANDLING STRATEGY
| Case | Error | Notes |
|---|---|---|
| Too many OTP requests | `RateLimitError` 429 | `Retry-After` header |
| Wrong/expired code | `AuthError('OTP_INVALID')` 401 | Same message for wrong vs. expired |
| Locked after 5 attempts | `RateLimitError('OTP_LOCKED')` 429 | |
| Missing/invalid token | `AuthError` 401 | UI redirects to login |
| Wrong role | `ForbiddenError` 403 | |
| Mail provider down | `DependencyUnavailableError` 503 | UI: "Couldn't send the code — try again" |

### EDGE CASES
- Student enters email with different case/whitespace → normalised before use.
- Code requested twice → only the latest code is valid.
- Token expires mid-session → next API call 401 → login redirect, return to the previous route.
- Socket connection with an expired token → rejected at handshake; client re-auths and reconnects.
- Demo with no internet → `ConsoleMailer` + code shown in server logs (documented in README).
- Rate limiter is in-process memory (resets on restart) `[KNOWN RISK: acceptable for single-instance demo]`.

### PERFORMANCE CONSIDERATIONS
- bcrypt cost 10 for PINs (staff only, rare); OTP hashing is HMAC (fast) because attempts are limited. Do not add refresh tokens or sessions tables in MVP.

### TESTING PLAN
- **Unit:** `generateOtp` (6 digits, uniform), `hashOtp/verifyOtpHash`, `TokenService` (sign/verify/expired/tampered).
- **Service (fake clock + in-memory OtpStore + fake Mailer):** request → verify success; 5 wrong attempts → lock; expiry at 10 min; non-allowed domain still returns 202 but sends nothing.
- **Integration (Supertest):** role matrix — student token on `/staff/*` and `/admin/*` → 403; staff token on `PATCH settings` → 403; ingest key on user routes → 401.
- **Socket:** connection refused without/with bad token.

---

## 3.9 — Feature M8: Demo Simulator & Replay Mode

### MODULE STRUCTURE

```
apps/api/src/core/scenario.ts           buildLunchRushScenario(opts): ScenarioEvent[]   (PURE, seeded PRNG)
apps/api/src/modules/simulator/
 ├─ simulator.service.ts      SimulatorService: start(opts), stop(), status()
 ├─ scenario-player.ts        ScenarioPlayer: plays events against a Clock
 └─ simulator.routes.ts       POST /admin/simulator/start · /stop · GET /admin/simulator/status
apps/api/src/infra/clock.ts   SystemClock · ScalableClock(speed) — the Clock implementations
apps/api/scripts/simulate.ts  CLI: npm run simulate -- --speed 6 --peak 220 --duration-min 18
services/vision/ (M1)         --source path/to/clip.mp4 for recorded-video demos
```

### FUNCTION & CLASS DESIGN
```ts
type ScenarioEvent = { atMs: number;            // simulated time offset from scenario start
                       kind: 'arrive' | 'leave'; n: number; withApp: boolean };
buildLunchRushScenario(o: { seed: number; durationMin: number; peakPeople: number; appAdoption: number }): ScenarioEvent[]
  // Gaussian arrival curve centred ~35% into the meal, dwell times drawn around 18 min ± queue; app adoption = fraction who "check in"
```
- `ScenarioPlayer.play(events)` — for each event due at `clock.now()`: calls `IngestService.recordReading` with updated cumulative `inCount/outCount/count` **(same port as the real vision script)**; for `withApp` arrivals calls `SessionService.startSession({userId:'sim-N', method:'sim', geofence:'unknown'})`. No simulator-only code exists in `IngestService`, `OccupancyService` or the UI — **simulated data enters through the same doors as real data** (that is the design point).
- `SimulatorService.start({speed})` — swaps the shared clock into **demo mode** (`ScalableClock(speed)`, default 6×, so 18 simulated minutes run in 3 real minutes), seeds baseline, starts the player; `stop()` restores the `SystemClock`, removes `sim-*` sessions, and marks demo data. Refused unless `ALLOW_SIMULATOR=true` (never in a real-deployment config).
- Redis `EXPIRE` for cleanup is `ceil(hardExpirySec / speed) + 60` so real-time cleanup matches simulated time; **correctness never depends on EXPIRE** (score-based computation).

### INTERFACES & CONTRACTS
- `POST /admin/simulator/start {speed?, peakPeople?, durationMin?, seed?}` → `202 {runId}`; `GET status → {running, simulatedElapsedMin, eventsRemaining}`.
- Scenario functions are deterministic per `seed` so a demo is **repeatable** and tests are stable.

### ERROR HANDLING STRATEGY
- Start while running → `409 SIMULATOR_RUNNING`. Not allowed in this environment → `403 SIMULATOR_DISABLED`.
- Any exception inside the player stops the run, restores the system clock (in `finally`), and reports `status.error`.

### EDGE CASES
- Real students/camera active during a simulation → simulator is for demo environments; the admin start button warns and requires confirmation.
- Server restart mid-simulation → clock reverts to `SystemClock`; sim sessions are cleaned at boot by prefix `sim-`.
- Speed 1× works (real-time) for rehearsal; speed > 30 is rejected (tick granularity).
- Vision script run on a recorded clip → same ingest key/endpoint; `--source file.mp4 --loop` for a continuous demo.

### PERFORMANCE CONSIDERATIONS
- Player emits at most one ingest-equivalent call per simulated 5 s, mirroring the real script; no extra load on the tick.

### TESTING PLAN
- **Unit:** `buildLunchRushScenario` determinism (same seed → identical events), total arrivals ≈ `peakPeople`, `leave ≤ arrive` invariant.
- **Service (fake clock):** play a 2-minute scenario → `OccupancyService` snapshot rises then falls; `stop()` restores clock and removes `sim-*` sessions.
- **E2E (SHOULD):** `npm run simulate` → all three views update; one staff alert fires.

---

## 3.10 — Module Dependency Map & Build Seams

```
                        ┌──────────┐
        vision script ─►│  ingest  │──reading.recorded──┐
                        └──────────┘                    ▼
 student ─► sessions ──session.started/ended──►  occupancy ──status.updated──► realtime ──► sockets
              ▲  (QueueWaitProvider port)           ▲   │                                  ▲
              └──────────────────────────────────────┘   └──► alerts ─alert.raised/cleared┘
 auth ◄── every route (middleware)        admin ──settings.changed──► occupancy
 simulator ──► ingest + sessions (via their services)
```
**Rules:** arrows are *events or ports*, never direct repository access. `realtime` is a pure subscriber (no domain knowledge). `core/` is imported by everyone and imports nothing.

---

## 3.11 — Cross-Cutting Testing Plan

| Level | Tooling | Target |
|---|---|---|
| Unit | Vitest / pytest | **100% of `core/`** (every branch); line counter; reporter |
| Service | Vitest + in-memory ports + `FakeClock` | Every use case, including failure paths |
| Contract | One suite run against Redis **and** in-memory store implementations | Substitutability (LSP) |
| Integration | Supertest (+ real Redis/Mongo in CI) | Role matrix, ingest → status, settings → snapshot |
| Component | Testing Library | States: loading / live / stale / closed / reconnecting / error |
| E2E | Playwright (SHOULD) | Simulator → check-in → staff alert |
| Manual | Stopwatch + recorded clip | Wait-time heuristic, ±10% head-count accuracy |

*What we deliberately don't test:* Socket.io/Express/Mongoose internals, Tailwind classes, simple DTO mappers.

---

---

# Phase 2 Addendum — SHOULD + COULD Modules (DOC 3 §3.12 – §3.24)

> **Activation rule:** nothing in this addendum is built until DOC 4 Step 15 and Checkpoint 4 pass. Every Phase 2 module plugs into an existing seam (port, event bus, `AlertRule`, settings-as-data) — **Open/Closed**: no Phase 1 file changes except `container.ts` wiring, `core/ports.ts` additions, `shared` schema additions, and the explicit "Touches Phase 1" lines below. Entities/fields/endpoints come from DOC 2 §2.7; names here must match them exactly.

## 3.12 — Phase 2 Shared Conventions

**New `core/` files (pure, 100% branch coverage like Phase 1):** `optout.ts` (`isOptOutWindowOpen`), `rating.ts` (`computeRatingDueAt`, `isRatingEligible`), `prep.ts` (`computeExpectedHeadcount`, `computePrepAdvice`, `adaptSafetyMargin`), `batch-quality.ts` (`evaluateBatchQuality`), `unaccounted.ts` (`evaluateUnaccounted`), `forecast.ts` (`forecastOccupancy`), `wave.ts` (`detectLectureWave`, `suggestNudge`), `queues.ts` (`estimateCounterWait`), `dps.ts` (`computeDps`, `suggestDemandFactor`), `rebate.ts` (`computeRebate`, `canIssueFastPass`, `shouldBlockRebates`), `audit.ts` (`shouldFlagAudit`), `device.ts` (`detectDeviceAnomaly`). Every function takes `now`/settings as parameters.

**New modules (`apps/api/src/modules/`):** `optouts` · `ratings` · `prep` (waste ledger + advisor) · `complaints` · `timetable` (wave, forecast, nudge) · `queues` · `push` · `hygiene` (reports + tray holds) · `dishes` (DPS + calibration) · `rebates` (points + fast pass) · `audit` (random audit + device anomaly). Alert rules live in `modules/alerts/rules/`: `unaccounted-entries.rule.ts`, `batch-quality.rule.ts` (the Phase 1 `tray-depletion.rule.ts` sits beside them).

**New ports (declared in `core/ports.ts`):** repositories — `OptOut`, `Rating`, `Complaint`, `HygieneReport`, `TrayHold`, `WasteLedger`, `MealSummary`, `TimetableBreak`, `DishStat`, `RebateLedger`, `FastPass`, `PushSubscription`, `DeviceSighting`, `AuditEvent`; services/stores — `ObjectStorage` (`put`, `getSignedUrl`, `delete`), `PushNotifier` (`send(userId, payload)`), `RatingDueStore`, `AuditCounterStore`, `ZoneReadingStore`, `ManualQueueStore`. Implementations: `infra/mongo/*.repository.ts`, `infra/redis/*` + `infra/memory/*` (contract-tested like Phase 1), `infra/storage/{local-disk,s3}.storage.ts`, `infra/push/{web-push,noop}.notifier.ts`.

**New events:** `optout.changed`, `rating.due`, `rating.submitted`, `complaint.filed`, `hygiene.reported`, `hold.raised`, `hold.released`, `fastpass.used`, `audit.flagged`. `RealtimeGateway` stays the only Socket.io module; it additionally joins each socket to room `user:{userId}` and maps `rating.due`/`fastpass.used` → that room, `hold.*` → `staff`+`admin`.

**Shared contract additions (`packages/shared`):** zod schemas for every DOC 2 §2.7.5 request/response; `SocketEvents` gains `RatingDue`, `HoldRaised`, `HoldReleased`, `FastPassUsed`; `StatusSnapshot` gains the optional `queues[]`, `lectureWave`, `nudge` (DOC 2 §2.7.5) — optional so Phase 1 clients keep parsing; `LiveCountPayload` gains optional `zone`. `SettingsDTO`/`SettingsPatchSchema` gain the DOC 2 §2.7.3 keys with defaults.

**Cross-feature dependency order (drives DOC 4 Steps 16–28):** foundation → opt-outs → ratings → waste/prep → complaints + alert rules → timetable/forecast → split queues → push → hygiene/holds → DPS → rebates/fast pass → audit/device. Push (§3.20) is wired into ratings via the `PushNotifier` port from Step 18 onward using `NoopNotifier` until Step 23 swaps in `WebPushNotifier` in `container.ts`.

**Error/edge conventions:** unchanged from §3.1. New error codes: `OPTOUT_WINDOW_CLOSED`, `RATING_NOT_ELIGIBLE`, `ALREADY_RATED`, `COMPLAINT_DUPLICATE`, `IMAGE_INVALID`, `IMAGE_TOO_LARGE`, `FASTPASS_UNAVAILABLE`, `INSUFFICIENT_POINTS`.

---

## 3.13 — P1: Advance Opt-Out ("Skipping Today")

```
MODULE STRUCTURE
  core/optout.ts                         isOptOutWindowOpen(mealStartsAt, cutoffMin, now): boolean
  modules/optouts/{optouts.routes,optouts.service,optouts.ports}.ts
  infra/mongo/optout.repository.ts       upsert / remove / findByUserMeal / countByMeal
  apps/web/src/features/optouts/{OptOutToggle.tsx, hooks/useOptOut.ts}   (on /student)
FUNCTION & CLASS DESIGN
  OptOutService.set(userId, mealId, now): window check → idempotent upsert → publish optout.changed
  OptOutService.remove(...) / getMine(...) / countForMeal(mealId)  (count feeds prep + MealSummary)
INTERFACES & CONTRACTS
  POST /optouts {mealId} → 201 | DELETE /optouts {mealId} → 204 | GET /optouts/me?mealId → {optedOut:boolean, cutoffAt}
ERROR HANDLING   After cutoff → ValidationError OPTOUT_WINDOW_CLOSED (422); unknown meal → NotFoundError.
EDGE CASES       Duplicate POST = no-op; opt-out then check-in is allowed (rebate engine marks it "not honoured"); meal already started = closed.
PERFORMANCE      countByMeal uses the unique(userId, mealId) + (mealId) index; no per-request aggregation.
TESTING          Unit: window boundary (cutoff −1 s / 0 / +1 s). Service: idempotency, closed window. Integration: role matrix (student only).
```

## 3.14 — P2: Post-Meal Rating (+ dish votes)

```
MODULE STRUCTURE
  core/rating.ts                         computeRatingDueAt(checkedInAt, ratingDelayMin); isRatingEligible(checkIn, now)
  modules/ratings/{ratings.routes,ratings.service,ratings.ports}.ts
  infra/redis/rating-due-store.redis.ts (+ memory twin)      ZSET score=dueAt
  infra/mongo/rating.repository.ts
  Scheduler job 'rating-due' (5 s): pop due → publish rating.due → gateway → room user:{userId}; PushNotifier.send (best effort)
  web: features/ratings/{RatingSheet.tsx, hooks/usePendingRating.ts}  (also checks GET /ratings/pending on app open + visibilitychange)
FUNCTION & CLASS DESIGN
  RatingService.scheduleDue(session)   subscribed to session.started
  RatingService.submit({userId, sessionId, stars, dishVotes?, comment?}): verifies CheckIn(sessionId).userId === userId (or active session), unique(sessionId), dishes ∈ Meal.menuItems, comment ≤ 280 → save → publish rating.submitted
  RatingService.listPending(userId): archived/active sessions past due with no rating
INTERFACES   GET /ratings/pending → {sessionId, mealId, dishes[]}[] | POST /ratings (zod) → 201
ERROR HANDLING   Not the owner → ForbiddenError; ineligible → RATING_NOT_ELIGIBLE; second rating → ALREADY_RATED (409). Push failure is logged, never thrown.
EDGE CASES       App closed at due time → shown on next open; user ended session early → still eligible; rating after 24 h → NOT_ELIGIBLE; dish not on menu → 422.
PERFORMANCE      Due-set read is one ZRANGEBYSCORE; no per-session Mongo reads in the job.
TESTING          Unit: due time, eligibility window. Service: owner check, duplicate, dishVotes validation. Contract: RatingDueStore memory vs Redis. Integration: submit → DishStat input event.
```

## 3.15 — P3: Waste Ledger + Kitchen Prep Advisor (S4)

```
MODULE STRUCTURE
  core/prep.ts   computeExpectedHeadcount({enrolledCount, optOutCount, defaultEatRate, historicalRates[], trendFactor}) → {mean, low, high}
                 computePrepAdvice({expectedHeadcount, portionsPerPerson, safetyMarginPct}) → {cookPortions, rationale}
                 adaptSafetyMargin(current, recentLeftoverPct[]) → clamp 3–15
  modules/prep/{prep.routes,prep.service,prep.ports}.ts
  infra/mongo/{waste-ledger,meal-summary}.repository.ts
  Scheduler job 'meal-summary' at meal end: writes MealSummary {totalEntries, peakOccupancy, optOutCount, enrolledCount, appCheckIns, adoptionRatio}
  web: features/staff/components/{WasteForm,PrepAdviceCard}.tsx (on /staff); features/admin/components/WasteChart.tsx (lazy)
FUNCTION & CLASS DESIGN
  PrepService.advise(mealId): reads MealSummary history (same type + weekday), opt-outs, settings → pure functions → {cookPortions, low, high, basis}
  PrepService.recordWaste({mealId, cookedPortions, leftoverPortions, advisorUsed, recordedBy}) → unique(mealId), then adaptSafetyMargin
INTERFACES   GET /staff/prep-advice?mealId · PUT /staff/meals/:mealId/waste · GET /admin/waste/summary
ERROR HANDLING   leftover > cooked → ValidationError; no history → advice falls back to enrolledCount × defaultEatRate and says so (`basis:'default'`).
EDGE CASES       First week (no history), holiday/zero-entry meal (excluded from history if totalEntries < minCameraEntries), edited ledger entry (upsert, re-adapt).
PERFORMANCE      History = last N MealSummary docs by index (messId, type, dayOfWeek); no scan of OccupancySnapshot.
TESTING          Unit: table-driven for headcount/advice/margin clamps. Service: fallback path. Integration: waste summary shows cooked vs consumed vs leftover and "advisor used" split.
```

## 3.16 — P4: Tier 1 Batch-Quality Complaints + `batch-quality` AlertRule

```
MODULE STRUCTURE
  core/batch-quality.ts   evaluateBatchQuality(reports[{category, at}], {threshold, windowMin}, now) → {category, count}[] tripped
  modules/complaints/{complaints.routes,complaints.service,complaints.ports}.ts
  modules/alerts/rules/batch-quality.rule.ts     implements AlertRule; subjectKey = category
  infra/mongo/complaint.repository.ts
  web: features/ratings/components/QuickReport.tsx   (session-gated micro-complaint chips)
FUNCTION & CLASS DESIGN
  ComplaintService.file({userId, sessionId, category, note?}): session must be the user's (active or archived this meal), unique(sessionId, category) → save → publish complaint.filed
  BatchQualityRule.evaluate(ctx): counts via ComplaintRepository.countSince(mealId, category, since) → Alert | null; cooldown per (ruleId, meal, category)
INTERFACES   POST /complaints {sessionId, category, note?} → 201 · alerts delivered over the existing alert:raised event
ERROR HANDLING   Duplicate category per session → COMPLAINT_DUPLICATE (409); not your session → ForbiddenError.
EDGE CASES       Reports exactly at threshold boundary; 5 reports from 5 sessions vs same session twice (blocked by unique index); cooldown prevents repeat alert while the batch is being fixed; category 'other' never trips a rule.
PERFORMANCE      countSince hits (mealId, category, createdAt); evaluated on the existing alert tick, not per request.
TESTING          Unit: threshold/window boundaries. Service: uniqueness + ownership. Rule: fires once, cooldown suppresses, clears after window.
```

## 3.17 — P5: Unaccounted-Entries `AlertRule` (redefined Tailgate)

```
MODULE STRUCTURE
  core/unaccounted.ts   evaluateUnaccounted({cameraEntriesInWindow, appCheckInsInWindow, settings.unaccounted}) → {tripped:boolean, gap, pct}
  modules/alerts/rules/unaccounted-entries.rule.ts       implements AlertRule; informational severity only
FUNCTION & CLASS DESIGN
  Rule reads EntryVelocityStore.countSince (camera) and SessionStore-derived check-ins in the same window; trips only if cameraEntries ≥ minCameraEntries AND gap ≥ minAbsolute AND gap% > tolerancePct.
INTERFACES   Alert payload carries counts only — never a user id, device id, or image. Message copy is aggregate ("more people entered than checked in").
ERROR HANDLING   Missing camera data → rule returns null (never alerts on stale feed).
EDGE CASES       Low app adoption (alert would always fire) → `minCameraEntries`/`tolerancePct` are settings; stale camera; window straddling meal start.
PERFORMANCE      Two cheap counts per tick; shares the alert tick.
TESTING          Unit: table of (camera, app, thresholds) combos. Rule: cooldown. Contract: payload contains no identity fields (assert on shape).
```

## 3.18 — P6: Timetable, Lecture-Wave Warning, Forecast (S1) and Rush-Staggering Nudge (S3)

```
MODULE STRUCTURE
  core/forecast.ts   forecastOccupancy(bucketHistory[], now, horizonMin=60) → {tsMs, expectedLevel, expectedValue}[]  (rolling mean per 5-min bucket per weekday)
  core/wave.ts       detectLectureWave(breaks[], now, windowMin) → {startsAt, expectedRushAt} | null
                     suggestNudge(wave, forecast[], walkToMessMin) → {goAt, estWaitMin}[] (≤ 2 windows)
  modules/timetable/{timetable.routes,timetable.service,timetable.ports}.ts
  infra/mongo/timetable-break.repository.ts · reads OccupancySnapshot history through the existing snapshot repository port
  web: features/student/components/{ForecastCurve,RushBanner}.tsx; features/admin/components/TimetableEditor.tsx (lazy)
FUNCTION & CLASS DESIGN
  TimetableService.getBreaks() / replaceBreaks(admin) · TimetableService.waveFor(now)
  OccupancyService.tick() (Phase 1 file) additionally *optionally* attaches `lectureWave` + `nudge` to StatusSnapshot — Touches Phase 1: one additive, optional-field step guarded by "timetable module registered".
INTERFACES   GET /timetable · PUT /admin/timetable (zod: HH:mm, dayOfWeek 0–6, no overlaps) · GET /mess/:messId/forecast
ERROR HANDLING   No history → forecast falls back to `baseline-profile.json` and sets `basis:'baseline'`.
EDGE CASES       Break crossing midnight (rejected), overlapping breaks, DST-free zone (Asia/Kolkata) but still convert at UI only, wave already started.
PERFORMANCE      Forecast cached per 5-min bucket; history read limited to last 4 same-weekday windows.
TESTING          Unit: forecast buckets, wave detection boundaries, nudge picks the lowest-wait window outside the wave. Service: overlap validation.
```

## 3.19 — P7: Split Queue (Regular Tray vs Special Counter)

```
MODULE STRUCTURE
  services/vision/zone_counter.py        pure ray-casting `point_in_polygon`; `ZoneCounter` counts tracked people inside named polygons (regular-queue, special-queue)
  services/vision/reporter.py            posts `zone` field (Touches Phase 1: adds optional `zone`; default 'entrance' unchanged)
  core/queues.ts                         estimateCounterWait(queueLen, servicePerMin) (reuses estimateWaitMin semantics per counter)
  modules/queues/{queues.routes,queues.service,queues.ports}.ts
  infra/redis/{zone-reading-store,manual-queue-store}.redis.ts (+ memory twins)
FUNCTION & CLASS DESIGN
  QueuesService.recordZoneReading(...) (called by IngestService when payload.zone ≠ 'entrance') · QueuesService.setManual(counterId, len) with 10-min TTL
  QueuesService.currentQueues(mealId) → camera zone if fresh else manual fallback else null → feeds `StatusSnapshot.queues[]`
INTERFACES   PUT /staff/meals/:mealId/queues/:counterId {length} · snapshot gains `queues[{counterId,label,len,waitMin,source}]`
ERROR HANDLING   Unknown counterId → NotFoundError; stale zone reading → falls back to manual, else the counter is omitted (never show a made-up wait).
EDGE CASES       One camera cannot see two queues (documented limitation; manual path is the supported default); polygon wrong/empty; zero service rate.
PERFORMANCE      Zone reading is one STRING per zone; no extra tick cost when no zones are configured.
TESTING          pytest: point-in-polygon (inside/outside/edge/concave). Unit: per-counter wait. Service: camera→manual fallback order. Contract tests for the two stores.
```

## 3.20 — P8: Web Push (and installed-PWA notifications)

```
MODULE STRUCTURE
  modules/push/{push.routes,push.service,push.ports}.ts
  infra/push/{web-push.notifier.ts, noop.notifier.ts}           implements PushNotifier
  infra/mongo/push-subscription.repository.ts
  apps/web/src/sw.ts   (vite-plugin-pwa injectManifest: precache app shell + `push` + `notificationclick`)
  web: features/student/hooks/usePushSubscription.ts, PushOptIn.tsx
FUNCTION & CLASS DESIGN
  PushService.subscribe(userId, sub) upsert by endpoint · unsubscribe · send(userId, payload): fan-out, delete subscriptions on 404/410, never throw
INTERFACES   POST/DELETE /push/subscriptions; payload = {title, body, url} only (no PII beyond what the user sees)
ERROR HANDLING   Provider error → logged with endpoint hash; never fails the calling use case.
EDGE CASES       iOS delivers push only to installed PWAs (UI says so; in-app prompt stays primary); permission denied; multiple devices per user; logout deletes that device's subscription.
PERFORMANCE      Fan-out bounded (per-user subscriptions ≤ 5); sends are fire-and-forget behind the port.
TESTING          Unit: payload builder. Service: 410 cleanup via a fake web-push client. Manual: install PWA on Android, receive a rating prompt.
```

## 3.21 — P9: Tier 2 Hygiene Reports + Tray Quality Holds

```
MODULE STRUCTURE
  modules/hygiene/{hygiene.routes,hygiene.service,hygiene.ports}.ts
  infra/storage/{local-disk.storage.ts, s3.storage.ts}          implements ObjectStorage
  infra/image/sanitize-image.ts                                  sharp: decode → strip EXIF/GPS → re-encode → max 1280 px (the ONLY file importing sharp)
  infra/mongo/{hygiene-report,tray-hold}.repository.ts
  Scheduler job 'image-retention' (daily): deletes objects + clears imageKey after imageRetentionDays
  web: features/student/components/HygieneReportForm.tsx (`capture="environment"`, copy: "photograph the food only, no faces"); features/admin/components/HygieneLog.tsx; features/staff/components/HoldBanner.tsx
FUNCTION & CLASS DESIGN
  HygieneService.report({userId, sessionId, kind, image, note?, counterId?, dish?}): session-gated, rate-limit 3/day/user → sanitize → ObjectStorage.put → save → create TrayHold(status:'held') → publish hygiene.reported + hold.raised
  HygieneService.releaseHold(id, adminId) / resolve(id, note) → publish hold.released; getImageUrl(id) → signed URL TTL 5 min (admin only)
INTERFACES   POST /hygiene-reports (multipart ≤ 5 MB, jpeg/png/webp by magic bytes) · GET /staff/holds · GET /admin/hygiene-reports · POST /admin/holds/:id/release · POST /admin/hygiene-reports/:id/resolve · GET /admin/hygiene-reports/:id/image
ERROR HANDLING   Bad type/too large → IMAGE_INVALID / IMAGE_TOO_LARGE; storage failure → DependencyUnavailableError and **no hold created** (all-or-nothing in the service).
EDGE CASES       EXIF with GPS (stripped, tested with a fixture); non-image with image extension; duplicate report for same dish/counter (second report attaches to the open hold); hold left unreleased past meal end (auto-released at meal end, logged).
PERFORMANCE      Memory upload (≤ 5 MB) then stream to storage; sharp work off the request path is not needed at this volume.
TESTING          Unit: kind/type validation. Service: all-or-nothing, rate limit, hold lifecycle. Integration: EXIF fixture comes out with no GPS tags; signed URL expires.
```

## 3.22 — P10: Dish Popularity Score (DPS) + Menu-Demand Auto-Calibration

```
MODULE STRUCTURE
  core/dps.ts   computeDps({ratingAvg, ratingCount, upVotes, downVotes, skipDeviation}, weights{rating:0.7, skip:0.3}) → 0–100 (Bayesian-damped for low counts)
                suggestDemandFactor(historyForDish[]) → 0–5 min
  modules/dishes/{dishes.routes,dishes.service,dishes.ports}.ts · infra/mongo/dish-stat.repository.ts
  Subscribes to rating.submitted and to MealSummary writes (skip deviation = actual vs expected opt-out effect)
FUNCTION & CLASS DESIGN
  DishService.onRating(...) increments DishStat sums · DishService.refresh(mealId) recomputes dps · DishService.suggestForMeal(mealId) → suggestion only; applying it is an admin action
INTERFACES   GET /admin/dishes/leaderboard · POST /admin/meals/:mealId/menu · POST /admin/meals/:mealId/apply-demand-suggestion  (sets Meal.menuDemandFactorMin; if `autoCalibrateDemand` setting is on, Meal.autoCalibrated=true)
ERROR HANDLING   Too few samples → score null and "not enough data" in UI (A5 in DOC 1: never present DPS as proven).
EDGE CASES       Dish renamed between meals (normalized key), single 5★ rating, opt-out spike unrelated to taste.
PERFORMANCE      Incremental sums, not re-aggregation over all ratings.
TESTING          Unit: damping, weights, clamp 0–5. Service: idempotent refresh. Integration: leaderboard order with seeded ratings.
```

## 3.23 — P11: Rebate Points + Fast-Track Pass

```
MODULE STRUCTURE
  core/rebate.ts   computeRebate({optedOut, honoured}, settings.rebate) → points
                   canIssueFastPass({balance, issuedForMeal}, settings.rebate) → boolean
                   shouldBlockRebates(violations, settings.rebate.blockAfterViolations) → boolean
  modules/rebates/{rebates.routes,rebates.service,rebates.ports}.ts · infra/mongo/{rebate-ledger,fast-pass}.repository.ts
  Scheduler job 'rebate-settle' at meal end: a rebate is 'honoured' only if the user opted out AND has no app check-in for that meal (the camera is never used to judge an individual).
FUNCTION & CLASS DESIGN
  RebateService.settle(mealId) → ledger rows (unique userId+mealId+reason) · issueFastPass(userId, mealId): balance ≥ fastPassCost, ≤ maxFastPassesPerMeal, 4-char code
  RebateService.verify(code, staffId): marks 'used' once → publish fastpass.used
INTERFACES   GET /rebates/me · POST /fast-passes · POST /staff/fast-passes/verify · virtual ledger only (real money stays WON'T)
ERROR HANDLING   Insufficient points → INSUFFICIENT_POINTS (422); pass unavailable/expired/used → FASTPASS_UNAVAILABLE (409).
EDGE CASES       Double settle (idempotent via unique index), opt-out then check-in = violation not reward, code collision (regenerate), meal ends with unused pass → 'expired'.
PERFORMANCE      Settlement is one batch per meal.
TESTING          Unit: points/blocking/boundary. Service: idempotent settle, single-use verify. Integration: end-to-end opt-out → settle → issue → verify.
```

## 3.24 — P12: Random Audit Mode + Device-Duplicate Anomaly Flag

```
MODULE STRUCTURE
  core/audit.ts    shouldFlagAudit(counter, everyN) → boolean (every Nth *counted* entry)
  core/device.ts   detectDeviceAnomaly(sightings[], {maxUsersPerDevice, maxDevicesPerUser, windowMin}, now) → {anomaly, reasons[]}
  modules/audit/{audit.routes,audit.service,audit.ports}.ts · infra/redis/audit-counter-store.redis.ts (+ memory) · infra/mongo/{audit-event,device-sighting}.repository.ts
  web: features/staff/components/AuditPrompt.tsx; student client sends a random UUID `deviceId` (localStorage, NOT a fingerprint) on check-in
FUNCTION & CLASS DESIGN
  AuditService.onEntries(mealId, n): increments counter; on every Nth → AuditEvent + publish audit.flagged (to staff room)
  AuditService.recordSighting(userId, deviceId) on session.started; flags go to the admin log only
INTERFACES   PUT /staff/meals/:mealId/audit-mode · POST /staff/audit/:id/ack {outcome:'checked'|'skipped'} — no per-person tracking, no names, no auto-penalty
ERROR HANDLING   Disabled mode → events not created; unknown event id → NotFoundError.
EDGE CASES       Counter reset when the vision script restarts (Phase 1 counter-reset handling reused), shared family phone (flag, never penalise), sighting TTL 30 d.
PERFORMANCE      One INCRBY per ingest; sightings upserted on check-in only.
TESTING          Unit: Nth-entry boundaries, anomaly thresholds. Service: disabled mode no-ops. Contract: AuditCounterStore memory vs Redis.
```

## 3.25 — Phase 2 Cross-Cutting Testing & Privacy Checks

| Check | How |
|---|---|
| New `core/` files at 100% branch coverage | Same Vitest threshold as Phase 1 |
| Privacy: no identity in aggregate alerts | Contract test on `unaccounted` and `audit` payload shapes |
| Image safety | EXIF-GPS fixture → output has no GPS tags; magic-byte validation; signed-URL expiry |
| Retention | Mongo TTL indexes (`DeviceSighting` 30 d; `CheckIn` 90 d etc. per DOC 2 §2.3) + `image-retention` job test with `FakeClock` |
| Phase 1 regression | Full Phase 1 suite + Checkpoint 4 script re-run at every Phase 2 checkpoint (5–8) |

---

## ⛔ GATE

Please confirm before DOC 4 (the build guide + `CONTROLLER.md`):
1. **TTL/decay correction** (§3.0 #1): expected stay + offset-based decay, hard expiry = `S + 17 min` — and that DOC 1/DOC 2 were updated accordingly.
2. **Ports & events architecture** (sessions ↔ occupancy decoupled via `QueueWaitProvider` + event bus; three narrow store ports).
3. **Simulator via a scalable `Clock`** (demo mode, same code paths as production).
4. **Camera baseline captured at meal start** to control counter drift.
5. **Phase 2 addendum (§3.12–§3.25)** — SHOULD/COULD modules designed against existing seams, built only after Phase 1 passes Checkpoint 4; and the `CheckIn.sessionId` amendment (§3.0 #7).
