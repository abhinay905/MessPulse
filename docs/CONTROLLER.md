# CONTROLLER — MessPulse

## Session State
```
PHASE:           1                      (1 = Steps 1–15 MVP · 2 = Steps 16–28 SHOULD/COULD. Only Nilesh changes this.)
CURRENT_STEP:    Build Step 5 — Mongo Repositories and Seed
LAST_COMPLETED:  Build Step 4 — Store Ports and Redis / In-Memory Implementations
SESSION_STATUS:  ACTIVE                 (ACTIVE | RESUMING | BLOCKED | CHECKPOINT)
PAUSED_AT:
```
Update this block after every completed step and before every session end. Parallel lanes (DOC4 §4.1) each keep their own copy.

---

## Load Order (follow exactly — do not load speculatively)

SESSION START:
  1. Read CONTROLLER.md fully
  2. Check SESSION_STATUS:
       RESUMING   → RESUMING protocol below
       BLOCKED    → re-read PAUSED_AT / the BLOCKED entry, wait for Nilesh
       CHECKPOINT → CHECKPOINT protocol below
       ACTIVE     → continue
  3. Check PHASE against CURRENT_STEP (Steps 1–15 ⇒ PHASE 1; Steps 16–28 ⇒ PHASE 2). Mismatch → BLOCKED.
  4. Open DOC4.md → find the CURRENT_STEP entry → read only that entry
  5. Follow its DOC2/DOC3 pointers → read only the named sections
  6. Begin work

NEW STEP: update Session State → read next Build Step entry in DOC4.md only → follow pointers → begin.

WHEN SOMETHING IS UNCLEAR:
  Feature intent / user behaviour     → DOC1.md, the relevant feature entry only
  Stack / layers / data / API         → DOC2.md, the relevant section only (Phase 2 data/API: §2.7)
  Module structure / signatures       → DOC3.md, the relevant feature section only (Phase 2: §3.12–§3.25)
  Build order / done condition        → DOC4.md, current step entry only

NEVER load a whole document when a section pointer exists. NEVER pre-load the next step.
NEVER read DOC1 in full during a build session. NEVER load vibe-antipatterns.md or prompt-patterns.md unless Triggers say so.

---

## States

### ACTIVE
Working on CURRENT_STEP. Stay until Done When is satisfied.
  ✓ Work only on the current step; follow its Folder/file targets exactly
  ✓ Follow Agentic Coding Rules (below and DOC4 §4.2) at all times
  ✓ Run `npm run typecheck && npm run lint && npm test` (and `pytest services/vision` for vision work) before declaring done
  ✗ Do not touch code outside the step's scope; do not load extra context
  ✗ Do not ask Nilesh questions the docs already answer
  → CHECKPOINT  if Done When is satisfied and a Checkpoint follows (DOC4 §4.3)
  → BLOCKED     if you cannot finish without information you don't have
  → ACTIVE (next step) if Done When is satisfied and no Checkpoint follows

### CHECKPOINT
Verification gate. Do not continue until it passes.
  1. Read the Checkpoint entry in DOC4.md §4.3
  2. Run the exact verification described
  3. Report to Nilesh: what you tested, what happened
  4. Wait for Nilesh's confirmation
  → ACTIVE if confirmed · BLOCKED if it fails

### BLOCKED
Cannot proceed: something is missing, broken, or needs a human decision.
  1. Set SESSION_STATUS: BLOCKED
  2. State what you were trying to do (one sentence)
  3. State exactly what blocks you (paste the error or quote the ambiguity)
  4. State which doc section you checked and what it said
  5. State what you need from Nilesh
  6. Check Triggers below — if one matches, follow its pointer
  7. Wait. Do not attempt workarounds.
  → ACTIVE when Nilesh supplies the answer and confirms

### RESUMING
Picking up after a break.
  1. Go to LAST_COMPLETED in DOC4 and verify its Done When still holds in the codebase
  2. Verified → set CURRENT_STEP to the next step, SESSION_STATUS: ACTIVE
  3. Not verified → tell Nilesh what is incomplete; ask whether to finish or move on
  4. Say in one sentence: what is done, what is next
  5. Do not assume prior work is correct. Verify first.

### PHASE GATE (Step 15 → Step 16)
When Step 15 is done AND Checkpoint 4 has passed AND the repo is tagged `v1.0-mvp`:
  1. Set SESSION_STATUS: BLOCKED, PAUSED_AT: "Phase 1 complete — awaiting Nilesh to set PHASE: 2"
  2. Tell Nilesh in one sentence what shipped. Stop. Do not start Step 16.
  3. Only Nilesh edits `PHASE: 2` (and may re-prioritise using Phase 2 cut lines E–H in DOC4 §4.1b).
  Phase 2 checkpoints (5–8) re-run the Checkpoint 4 script first — Phase 1 regressions block Phase 2.

---

## Triggers

When you notice...                                              → Read this immediately

You put a rule, formula, threshold check or `Date.now()` in a    → vibe-antipatterns.md AP-06 (layer violation guard)
route, service, socket handler, repository or React component      then prompt-patterns.md PP-07
instead of `apps/api/src/core/` (or you emit socket events
outside `modules/realtime`, or write Redis/Mongo calls in a service)

You reach for Passport/NextAuth/Clerk, Prisma, Next.js,           → vibe-antipatterns.md AP-07 (stack substitution guard)
Firebase/FCM/OneSignal, BullMQ, Cloudinary, shapely, or any         then prompt-patterns.md PP-09
detector other than YOLOv8n (Phase 2 allows only web-push,
multer, sharp, @aws-sdk/client-s3)

You hardcode decay offsets (8/17 min), maxSessionMin, alert        → vibe-antipatterns.md AP-10 (config hardcoding guard)
thresholds, cooldowns or the base meal time instead of reading       then prompt-patterns.md PP-16
MessSettings / config.ts

You add a model field, zod schema key, endpoint or socket event    → vibe-antipatterns.md AP-08 (schema drift), AP-09 (interface invention)
not in DOC2 §2.3/§2.7 or DOC3 §3.1/§3.12+, or change a DOC3          then prompt-patterns.md PP-08
signature or the DOC3 §3.0 #1 decay/expected-stay semantics

You start work outside the current step: a Phase 2 feature while   → vibe-antipatterns.md AP-01 (feature creep), AP-02 (step merging)
PHASE is 1 (ratings, opt-outs, push…), a WON'T feature (face          then prompt-patterns.md PP-04, then PP-05 to park the idea
recognition, frame storage, payments), or UI during a backend step

You say a step is done without running typecheck/lint/tests or     → vibe-antipatterns.md AP-14 (phantom completion), AP-22 (checkpoint skipping)
the step's Done When, or you skip/merge a Checkpoint                  then prompt-patterns.md PP-20, then PP-15

Session about to end / context filling                          → prompt-patterns.md PP-14
Resuming after any break                                        → prompt-patterns.md PP-02
Agent stuck after 3+ attempts on the same problem               → vibe-antipatterns.md AP-13, then prompt-patterns.md PP-13
Two docs seem to conflict                                       → prompt-patterns.md PP-17
Session completely off track                                    → prompt-patterns.md PP-18

---

## Agentic Coding Rules

ALWAYS:
  - Put every business rule (timing, decay, occupancy, wait, geofence, tray, otp, scenario; Phase 2: prep, forecast, rebate, dps…) in `apps/api/src/core/*.ts` as pure functions taking `now`/settings as parameters
  - Keep routes thin: zod-validate (schemas from `packages/shared`) → call ONE service method; services throw `AppError` subclasses from `apps/api/src/shared-kernel/errors.ts`
  - Construct concrete classes only in `apps/api/src/container.ts`; services receive ports from `apps/api/src/core/ports.ts` by constructor injection
  - Take time from the injected `Clock` (`apps/api/src/infra/clock.ts`); store epoch ms; put units in names (`…Sec`, `…Min`)
  - Keep Redis key names (`mp:` prefix) and the session ZSET member encoding inside `apps/api/src/infra/redis/` only
  - Return plain typed objects from `apps/api/src/infra/mongo/*.repository.ts` — never Mongoose documents
  - Emit Socket.io events only through `apps/api/src/modules/realtime` (RealtimeGateway); services publish typed events on `infra/event-bus.ts`
  - Render the server's `StatusSnapshot` in React; fetching and socket logic live in `apps/web/src/features/*/hooks` and `apps/web/src/lib/`
  - In Phase 2, extend by registering a new module / `AlertRule` / adapter in `container.ts` — do not edit Phase 1 modules except the DOC3-listed "Touches Phase 1" lines

NEVER:
  - Import express, ioredis, mongoose, socket.io, pino or node:* inside `apps/api/src/core/`
  - Import a repository or store from a different module — use a port or the event bus
  - Call `Date.now()` / `new Date()` outside `apps/api/src/infra/clock.ts`
  - Persist or log raw lat/lng, OTP codes, PINs, tokens, push endpoints, unsanitised images, or any camera frame; transmit anything but integers from `services/vision`
  - Rely on Redis keyspace/expiry notifications — occupancy is computed on read from the sorted set
  - Add a simulator-only branch to ingest, occupancy, sessions or the UI — the simulator drives the same services
  - Put occupancy level, wait-time or decay math in `apps/web`
  - Implement a Phase 2 step while PHASE is 1, a step out of order, or any WON'T feature in any phase
  - Skip a checkpoint, merge two steps, or mark a step done with Folder/file targets missing

---

## Quick Reference

DOC1.md              → Feature spec: M1 Live head-count ingestion · M2 Occupancy & wait view · M3 Check-in session (TTL + decay) · M4 Camera-calibrated occupancy · M5 Staff tray alert · M6 Admin analytics · M7 Role access · M8 Demo simulator (+ Phase 2 SHOULD/COULD)
DOC2.md              → Stack: React 18/Vite/TS PWA → Node 20/Express/Socket.io (modular monolith, ports & adapters) → Redis 7 (live) + MongoDB 7 (durable); Python YOLOv8n vision adapter; Phase 2 in §2.7
DOC3.md              → Modules: /ingest /sessions /occupancy /alerts /auth /admin /simulator /realtime + core/ · Phase 2: /optouts /ratings /prep /complaints /timetable /queues /push /hygiene /dishes /rebates /audit (§3.12–§3.25)
DOC4.md              → 28 build steps (Phase 1: 1–15, Phase 2: 16–28), 8 checkpoints. Current: Step 1 — Vision Feasibility Spike
vibe-antipatterns.md → Load only via Triggers above
prompt-patterns.md   → Load only via Triggers above
CONTROLLER.md        → You are here. Update Session State after every step.

Progress:  DOC4.md → CURRENT_STEP entry
Unclear:   Load only the specific doc section that answers it
Stuck:     Set BLOCKED, follow the state protocol, check Triggers
Ending:    Update header, note PAUSED_AT, tell Nilesh, stop cleanly
