# DOC 1 — Project Brief & Feature Specification: MessPulse

**Status:** Draft for sign-off (verified against `project-spec` DOC 1 template) · **Scope update (Oct 2026):** all SHOULD and COULD features are now in scope, delivered as **Phase 2** after the MVP is demo-ready (see DOC 2 §2.7, DOC 3 §3.12+, DOC 4 Steps 16–28). WON'T items stay cut.
**Platform:** Responsive web app / PWA
**Target environment:** College hostel messes (AIT Pune)
**Project type:** Hackathon / vibecoding build (solo/team size: `[ASSUMPTION: 2–4 people, 24–48 h build window]`)

---

## 1.1 — Design Thinking Foundation

**PROJECT NAME:** MessPulse

**TAGLINE:** A real-time crowd and kitchen-demand platform that tells hostel students when to eat and tells mess staff how much to cook — using existing cameras and students' own phones, with no new hardware.

### Problem Statement

| | |
|---|---|
| **Who** | Hostel students with short lecture breaks; mess staff who cook and serve; hostel admin/warden |
| **Pain** | Students walk to a packed mess and lose 15–25 min of a 50-min break in a queue, or skip the meal. Staff cook by habit, so food runs out mid-rush on some days and is thrown away on others. |
| **Current state** | Guesswork, WhatsApp messages ("mess is empty/full"), peeking in, fixed cooking quantities, paper attendance or turnstiles that create their own queue |
| **Root insight** | The queue problem and the food-waste problem are the same problem: **a demand-information failure.** Students lack a live crowd signal; the kitchen lacks a forward-looking demand signal. One data pipeline (head-count + timetable + opt-outs) fixes both. |

### Point of View

- **Primary:** A hostel student with a 50-minute lecture break needs to know *when* the mess will be quiet, because arriving into a 25-minute queue costs them either a hot meal or the next lecture.
- **Secondary:** A mess manager needs to see demand building *before* the rush hits, because by the time trays are visibly empty the queue is already angry and the next batch is 15 minutes away.

### How Might We

- **HMW-1 (amplify the good):** HMW make the thing students already do — peeking in or asking friends — instant, accurate and remote?
- **HMW-2 (eliminate friction):** HMW count people in the mess without making anyone stop, scan, or queue to be counted?
- **HMW-3 (reframe from the goal):** HMW help students plan their *meal slot* around their timetable, not just avoid a queue?
- **HMW-4 (question an assumption):** HMW estimate crowd if we assumed nobody will ever scan anything and we can't buy sensors?
- **HMW-5 (goal behind the goal):** HMW help the kitchen cook the right amount, so that crowd smoothing and waste reduction both follow?

### Core Value Proposition

MessPulse gives students a live, trustworthy occupancy and wait-time view, and gives staff exception-only alerts plus demand-based prep guidance. It works with a webcam/CCTV feed that already exists and students' phones, so the mess needs no turnstiles, RFID or biometric hardware. Camera counts act as ground truth while lightweight app sessions explain *who* is inside, which is what unlocks verified ratings, complaints and opt-outs.

### Primary Job-To-Be-Done

> "When my break is short, help me decide *go now or wait* so I eat a hot meal and still make my next lecture."

---

## 1.2 — Personas

| Persona | Needs | Frustration if done poorly |
|---|---|---|
| **Hosteller (primary)** — 2nd-year student, 50-min break, phone-first | Live gauge, wait time, best arrival window, quick rating, safe way to report hygiene issues | Wrong wait times (trust lost after one miss), being forced to scan/stop at the door, notification spam |
| **Mess staff / manager** — on a tablet while serving, hands busy | Calm screen that only interrupts when it matters, tray-depletion warning, quality alerts | Alert fatigue, false alarms that blame students, needing a laptop |
| **Hostel admin / warden** — occasional, analytical | Occupancy trends, wastage and dish insights, hygiene escalation log | Dashboards with no actionable insight |
| *Secondary:* day scholars eating in the mess `[ASSUMPTION: out of MVP scope; same flow if they have the app]` | | |

---

## 1.3 — Feature Set (MoSCoW)

> **Phasing (Oct 2026 decision):** MUST = **Phase 1** (DOC 4 Steps 1–15, release `v1.0-mvp`). SHOULD + COULD = **Phase 2** (DOC 4 Steps 16–28), started only after Phase 1's Checkpoint 4 and Step 15 pass. The tier labels below describe *priority and dependency*, not exclusion.
>
> **Scope principle:** every MUST feature must be demoable end-to-end live or via replay in the hackathon window. The original PRD put 14+ ambitious features at P0/P1; they are re-tiered below.

### MUST HAVE (MVP — project fails without these)

**M1. Live Head-Count Ingestion (Vision Microservice)**
- *Description:* Python script (YOLOv8n + OpenCV) reads an entrance webcam/CCTV stream **or a recorded video file**, counts people crossing an entry/exit line (or in-frame occupancy), and posts only integers + timestamp to `POST /api/v1/mess/live-count`. No frames are stored or transmitted.
- *Why load-bearing:* It is the ground-truth signal and the main technical differentiator.
- *Acceptance criteria:* On a 5-minute test clip, count is within ±10% of a manual count `[ASSUMPTION: threshold]`; script posts at least once every 5 s; backend rejects requests without a valid ingest key.

**M2. Live Occupancy & Wait-Time View (Student `/student`)**
- *Description:* Occupancy gauge (people / capacity), estimated wait time, and "best time to arrive" (next 30–60 min), pushed over WebSockets.
- *Why load-bearing:* This is the student value; without it nothing else matters.
- *Acceptance criteria:* UI updates within 2 s of a new live-count post; gauge changes colour at defined thresholds (e.g. <50%, 50–80%, >80% of capacity); works on a 360 px-wide phone viewport and installs as a PWA.
- *Wait-time model (MVP):* single combined queue, estimated from current occupancy, recent entry rate and an admin-set service rate `[ASSUMPTION]`.

**M3. App Check-In Session with Queue-Adjusted TTL & Probabilistic Decay**
- *Description:* A one-tap check-in (QR at the entrance **or** geofence prompt) creates a Redis session. Sessions expire without any check-out action.
  - `Expected Stay (the PRD's "TTL") = Base Meal Time (18 min) + Queue Wait at entry + Menu Demand Factor`. Until the expected stay elapses, the session counts fully; after it, probabilistic decay applies (see below). Redis hard expiry = expected stay + 17 min, with a safety cap `maxSessionMin` `[ASSUMPTION: 60]`. *(Amended in DOC 3: the original fixed 35-min cap made the decay brackets unreachable.)*
  - *Menu Demand Factor:* additive minutes (0–5), admin-set per meal for MVP (default 0); auto-calibration is a COULD.
  - *Decay (soft weighting of a session toward "still inside"):* brackets are **offsets from the session's own expected stay**, so queued students are not wrongly decayed: before expected stay → 1.00, 0–8 min after → 0.60, 8–17 min after → 0.25, 17+ min after → 0.00. With no queue wait (expected stay 18 min) this equals the original 0–18 / 18–26 / 26–35 / 35+ table.
- *Why load-bearing:* This is the "zero-friction check-out" idea and gives sessions that gate ratings and complaints.
- *Acceptance criteria:* Session auto-expires at its TTL in Redis; admin chart shows the decay-weighted occupancy next to the camera count; a unit test covers each decay bracket boundary, the queue-wait shift, and the `maxSessionMin` cap.

**M4. Camera-Calibrated Occupancy Estimate**
- *Description:* Displayed occupancy = camera count (ground truth). Session-based estimate is shown to admin as a secondary line; the ratio between them is used as the drift/calibration signal.
- *Acceptance criteria:* If the camera feed is stale >30 s, UI falls back to the session-based estimate and shows a "estimated" badge.

**M5. Staff Controller (`/staff`) — Calm Screen with Tray-Depletion Alert**
- *Description:* Live occupancy plus a single high-inflow "tray depletion likely" alert triggered when check-in/entry velocity exceeds a threshold relative to the tray capacity the staff entered for that meal.
- *Acceptance criteria:* Alert fires when velocity exceeds threshold and clears after a cooldown (no repeated spam within 3 min `[ASSUMPTION]`).

**M6. Admin Command Center (`/admin`) — Core Analytics**
- *Description:* Occupancy time series, active sessions and decay curve, camera health (last post time), and the manual controls for capacity, base service rate, menu demand factor.
- *Acceptance criteria:* Charts render with seeded + live data; admin can change capacity and see the gauge update.

**M7. Lightweight Role-Based Access**
- *Description:* Students sign in with a college-email one-time code (OTP); staff/admin use a PIN (roll number and name are profile fields, not credentials, because self-declared identity is spoofable and would undermine verified ratings/complaints — DOC 2 §2.2 decision 5). Three roles gate `/student`, `/staff`, `/admin`.
- *Why load-bearing:* Without identity there is no session gating and anyone can see the staff/admin panels. (Missing from the original PRD.)
- *Acceptance criteria:* Staff/admin routes reject student tokens; ingest endpoint uses a separate API key.

**M8. Demo Simulator & Replay Mode** *(new — hackathon-critical)*
- *Description:* A script/admin toggle that generates synthetic arrivals shaped like a lecture-break wave, and a pre-recorded mess video for the CV script, so judges see the full pipeline even if the real mess is empty.
- *Why load-bearing:* A crowd-dependent product cannot be demoed without a crowd.
- *Acceptance criteria:* One command starts a 3-minute scripted "lunch rush" visible on all three views.

### SHOULD HAVE (v1.1 — high value, not blocking MVP)

| Feature | Description | Why deferred |
|---|---|---|
| **Post-Meal Rating** | Prompt checked-in students ~22 min after entry (1–5 stars, tied to the session). If the PWA is closed, show on next open; web-push is optional. | Needs M3 sessions; push on iOS PWAs is unreliable |
| **Advance Opt-Out ("Skipping Today")** | Per-meal opt-out before a cutoff `[ASSUMPTION: 60 min before meal]`; feeds expected-headcount for the kitchen | Value depends on a working kitchen-facing view |
| **Kitchen Prep Advisor** *(new)* | Suggested "cook for N" = expected headcount (history + opt-outs + current trend). Delivers the *food waste* half of the vision. | Needs a few days of data or seeded history |
| **Exception Alert: Unaccounted Entries** *(redefined Tailgate)* | Soft chime + staff-screen flag when camera count exceeds app check-ins by more than a rolling-window threshold. **Informational only; never identifies a student.** | Only meaningful once app adoption is high; see risks |
| **Tier 1 Batch Quality Alert** | Session-gated micro-complaints (cold food, undercooked chapati…); ≥5 reports of the same category in 10 min triggers a staff alert; one report per session per category | Depends on sessions and ratings UI |
| **Lecture Wave Warning** | Admin enters class-break times; students get "rush expected at 1:05, go at 12:50 or 1:25" | Timetable ingestion is not trivial; manual entry for now |
| **Split Queue (Regular Tray vs Special Counter)** | Separate wait times per counter | One entrance camera cannot see two queues; needs staff input or a second feed |

### COULD HAVE (Backlog)

- **Tier 2 Critical Hygiene Report:** camera capture (`capture="environment"`), instant admin notification, tray "quality hold" state, escalation log. *(Needs image storage + moderation + clear privacy rules.)*
- **Dish Popularity Score (DPS) leaderboard** and auto-calibration of menu demand factor. *(Needs weeks of data; see assumption A5.)*
- **Rebate points / fast-track passes** for opt-outs. *(Needs mess-management buy-in and abuse controls.)*
- **Random Audit Mode:** every 25th counted entry prompts staff for a quick ID check of the next entrant (no per-person tracking).
- **Device-duplicate anomaly flag** (same device claiming multiple sessions).
- **Web-push notifications**, installable offline shell caching.

### WON'T HAVE (explicitly cut)

| Feature | Cut rationale |
|---|---|
| **Face recognition / "face anomaly" detection** | Biometric processing of students raises consent and privacy obligations (India's Digital Personal Data Protection Act, 2023), accuracy and bias problems, and is unnecessary for the product's value. Replaced by count-only vision. |
| Storing or streaming CCTV frames/video | Privacy risk and bandwidth cost; only integer counts leave the vision script |
| Turnstiles, RFID, NFC, or any new hardware | Contradicts the "no new hardware" premise |
| Punitive use of mismatch alerts (naming or penalising students) | Alerts are aggregate and soft by design |
| Billing / payments / mess-fee integration | Out of scope for the problem |
| Multi-mess / multi-campus tenancy | Single mess for v1 |
| Native iOS/Android apps | PWA covers the need |

### ⚠️ SCOPE CREEP FLAGS

- **Dish analytics + hygiene tiers + rebates** form three separate products on top of the core crowd product. Each is individually attractive; together they will consume the build window.
- **Auto-calibrating menu surge multipliers** sound "self-learning" but need data nobody will have at demo time.
- **Timetable integration** can balloon (parsing PDFs, per-batch schedules). Keep it to manual admin entry.
- **Real face/device identity checks** — cut; see WON'T.

---

## 1.4 — Novel Feature Suggestions *(for consideration, not requirements)*

| # | Suggestion | Lens | Implementation hint |
|---|---|---|---|
| S1 | **"Popular Times" forecast** — show predicted occupancy for the next 60 min as a simple curve, as in map apps | Analogous inspiration (Google Popular Times / airport security wait boards) | Rolling average of past camera counts per 5-min bucket per weekday; no ML needed |
| S2 | **Privacy-by-architecture badge** — "this camera never stores a face; only a number leaves the room" shown in the UI and pitch | SCAMPER: Eliminate (remove the sensitive data entirely) | Count-only POST; document in README; a strong judging point |
| S3 | **Rush Staggering Nudge** — when a wave is predicted, offer a time window with an estimated shorter wait to students whose break overlaps it | SCAMPER: Combine (timetable + occupancy) | Reuse the Lecture Wave data and the forecast from S1 |
| S4 | **Waste Ledger** — staff log "leftover trays" per meal; admin sees cooked vs consumed vs leftover over time and the improvement after using the Prep Advisor | Worst-idea reversal ("cook blindly and never measure") | One extra form on `/staff`; one chart on `/admin`; supplies the headline impact metric for the pitch |

---

## 1.5 — User Flows

**Student (happy path)**
```
Open PWA → see gauge + wait time + best window → decide to go
   → arrive; one-tap QR / geofence check-in (session starts, TTL set)
   → eat (no check-out) → session decays/expires automatically
   → ~22 min after entry: rating prompt (SHOULD) → optional quality report (SHOULD)
        ↓
 Edge cases: outside geofence → prompt to scan QR · camera feed stale → "estimated" badge
 · no check-in → still counted by camera, but cannot rate or report
```

**Vision pipeline**
```
Webcam / CCTV / recorded clip → YOLOv8n person detection + line-crossing
   → POST integer count (+ ingest key) → Redis + Socket.io broadcast
   → occupancy updates on /student, /staff, /admin
        ↓
 Edge cases: feed drops → stale flag after 30 s · count outlier → clamp/ignore + log
```

**Mess staff**
```
Open /staff → calm live view → (alert only on exception: tray depletion, later: unaccounted entries / batch quality)
   → acknowledge or act → alert clears after cooldown
```

**Admin**
```
Open /admin → set capacity, service rate, menu demand factor → watch occupancy vs decay-weighted sessions
   → review trends / (later) waste ledger, dish analytics, hygiene log
```

---

## 1.6 — Key Assumptions & Risks (Assumption Mapping)

| # | What we believe | Evidence | Risk if wrong | Cheap test |
|---|---|---|---|---|
| A1 | Enough students will tap a one-tap check-in without being forced | None yet | **High** — sessions, ratings, complaints and the mismatch alert all depend on it | Seed a 10-person pilot; measure check-in rate. If low, make the camera the only MUST signal |
| A2 | A webcam/CCTV feed at the entrance is available and legal to process for counting | Unverified | **High** | Ask the mess/hostel office now; fall back to a recorded demo clip |
| A3 | YOLOv8n gives acceptable counts at entrance angles/lighting on a laptop CPU | General capability only | Med | Run it on a 5-min phone clip before building anything else (spike) |
| A4 | Browser geofencing is accurate enough indoors | Weak (GPS indoors is coarse) | Med | Test on a phone at the mess; QR is the reliable path |
| A5 | Opt-out % + ratings reveal dish popularity | Weak: opt-outs are per *meal*, not per dish, and may reflect schedule rather than taste | Med | Treat DPS as COULD; do not present it as proven |
| A6 | Mess staff will use a tablet dashboard and enter tray capacity | Unverified | Med | 5-minute walkthrough with the mess manager |
| A7 | Students accept an unobtrusive app that tracks check-ins | Plausible | Med | State clearly what is stored; no face data, no frames |

**[KNOWN RISK]** The original PRD's "99% of hostellers walk in without scanning" **conflicts** with session-based security, ratings, and tailgate detection (if most people do not check in, camera count will always exceed check-ins). The design above resolves this by making the camera the ground truth for occupancy and the one-tap check-in an incentive-driven opt-in layer; the mismatch alert is therefore SHOULD and informational only.

**[KNOWN RISK]** Four moving parts (Node API, Redis, MongoDB, Python vision service) plus WebSockets are a lot for one hackathon. Decision on whether to simplify (e.g. hosted Redis, or in-process store for MVP) belongs to DOC 2.

---

## 1.7 — Value vs. Effort Snapshot

| | Low effort | High effort |
|---|---|---|
| **High value** | M2 live gauge, M5 tray alert, M8 simulator, S2 privacy badge, S1 forecast | M1 vision ingest, M3 TTL + decay, S4 waste ledger + Prep Advisor |
| **Low value** | Random audit, device flag | Face recognition (cut), DPS auto-calibration, rebates |

**Suggested build emphasis:** Phase 1: M1 → M2 → M3/M4 → M5/M6 → M7 → M8 (actual order in DOC 4 §4.1). Phase 2: SHOULD items by value, then COULD items (DOC 4 Steps 16–28).

---

## 1.8 — Success Metrics

**Demo-day (hackathon):**
- End-to-end latency, camera post → student UI: **< 2 s**
- Head-count accuracy on test footage: **within ±10%**
- A 3-minute simulated lunch rush visible on all three views with at least one staff alert firing

**Impact story (pilot or projected):**
- Reduction in average queue time and in leftover food per meal (from the Waste Ledger, S4)

---

## 1.9 — Constraints Carried Forward to DOC 2

*(Stack was already chosen by the team; DOC 2 will justify it and address the risks above.)*

- **Frontend:** React.js, Tailwind CSS, Vite, PWA `manifest.json`; routes `/student`, `/staff`, `/admin`
- **Real-time:** Socket.io (WebSockets)
- **Backend:** Node.js + Express.js REST
- **In-memory state:** Redis (TTL + Sorted Sets) for sessions and entry velocity
- **Persistent DB:** MongoDB (Mongoose) for history, ratings, opt-outs, timetables
- **Vision microservice:** Python, Ultralytics YOLOv8n, OpenCV
- **Open items for DOC 2:** auth mechanism details, image storage (only if Tier 2 is built), data-retention policy, deployment target and how the vision script reaches the server

---

## ⛔ GATE

Confirm before moving to DOC 2:
1. MUST list (M1–M8) is the right MVP slice.
2. Face anomaly detection is cut.
3. Camera = ground truth, check-in = opt-in layer.

---

## Appendix A — Verification Log (changes from the original PRD)

**Structural gaps fixed**
- Original had no problem statement, POV, HMWs, personas, MoSCoW with acceptance criteria, Won't-Have list, scope-creep flags, user flows, assumptions, or success metrics. All added.
- Stack/API table (DOC 2 material) moved to §1.9 as constraints only. The "Verified Hygiene" and "Exception-Based Security" sections were re-tiered, not deleted.

**Logical inconsistencies found and resolved**
1. **Fast lane vs. verified sessions:** "99% of hostellers don't scan" contradicted session-gated ratings/complaints, Redis sessions and tailgate detection. Resolved via camera-as-ground-truth + opt-in check-in.
2. **"Zero-hardware" wording:** the system needs a camera feed. Reworded to "no *new* hardware (existing CCTV/webcam or phone)".
3. **Decay brackets vs. queue-adjusted TTL:** brackets ignored queue wait, so queued students decayed early. Brackets are now offsets from each session's expected stay (base + queue wait + demand factor), so the original 18/26/35-minute table is the zero-queue special case.
4. **Undefined "Menu Demand Factor":** defined as 0–5 admin-set minutes for MVP.
5. **Tailgate detection** could not work without identity at the door; redefined as an aggregate "unaccounted entries" alert.
6. **Random audit "1 in 25 entries":** a camera cannot pick a person; redefined as every 25th *counted* entry prompts staff.
7. **Admin "live YOLOv8 webcam calibration"** conflicted with the Python microservice design; admin now shows camera health + count vs. session estimate.
8. **Split queues (Regular vs Special)** are not observable from one entrance camera; moved to SHOULD with a stated limitation.
9. **DPS** conflated per-meal opt-outs with per-dish popularity; downgraded to COULD with a flagged assumption.
10. **Food-waste goal had no feature delivering it**; added Kitchen Prep Advisor and Waste Ledger.
11. **Rating prompt at 22 min** can land after the student leaves or closes the app; softened to "on next open; push optional".

**Missing items added:** role-based access (M7), demo simulator (M8), privacy stance, stale-feed fallback, alert cooldowns.

**Removed:** face/device-face anomaly detection (privacy, accuracy, necessity).
