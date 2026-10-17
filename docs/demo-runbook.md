# MessPulse — Demo Runbook & Rehearsal Guide (v1.0-mvp)

This runbook guides presenters through the end-to-end 5-minute MessPulse demonstration for evaluators, college administrators, and students.

---

## 1. Pre-Flight Checklist

Before the demo begins:

- [ ] **Infrastructure Running**:
  ```bash
  # Option A: Offline Docker Demo (recommended)
  docker compose -f docker-compose.demo.yml up -d

  # Option B: Local Dev Mode
  npm run prepare
  npm run dev:api
  ```
- [ ] **Database Seeded**:
  ```bash
  npm run seed
  ```
  *Verifies: Default dining hall settings, staff user (`staff@messpulse.internal`, PIN `1234`), admin user (`admin@messpulse.internal`, PIN `4321`), today's lunch/dinner meals, and 3-day snapshot history.*
- [ ] **Health Checks Clean**:
  - `curl -s http://localhost:3000/healthz` → `{"status":"ok"}`
  - `curl -s http://localhost:3000/readyz` → `{"status":"ready"}`
- [ ] **Browser Windows / Tabs Ready**:
  1. Tab 1: `http://localhost:3000/student` (or mobile phone on same Wi-Fi)
  2. Tab 2: `http://localhost:3000/staff`
  3. Tab 3: `http://localhost:3000/admin`

---

## 2. 5-Minute Live Demo Script

### Minute 0:00 – 1:00 · The Student Experience
1. Open `http://localhost:3000/student`.
2. Point out:
   - **Calm, glanceable status**: Circular occupancy gauge (Low / Medium / High).
   - **Real-time wait estimate**: EMA-smoothed wait range (e.g. `2–5 min`), not a jittery raw number.
   - **Best arrival windows**: Chronological 10-minute green windows derived from 3-day history.
   - **Mobile PWA**: Installable, works on any smartphone without an app store download.
3. Show the **Check-In Card**:
   - The on-screen check-in flow allows students to opt in upon arrival.

### Minute 1:00 – 2:00 · The Lunch Rush Simulator
1. Switch to `http://localhost:3000/admin` (Sign in with PIN `4321`).
2. On the **Live Ops & QR** tab, locate **Demo Simulator & Rush Replay**:
   - Set speed to `6x` (simulates an 18-minute meal rush in 3 real minutes).
   - Click **Start Rush Simulation**.
3. Switch back to the **Student Tab**:
   - Watch the occupancy gauge and estimated wait time climb in real time over Socket.io without refreshing the page!
4. Check in a student:
   - On the Admin screen, copy the student check-in link from the QR card.
   - Open link in student tab → student session starts with a countdown timer.
   - Tap **"I'm done"** → session immediately ends, dropping the decay-weighted load.

### Minute 2:00 – 3:00 · The Kitchen Staff Controller
1. Open `http://localhost:3000/staff` (Sign in with PIN `1234`).
2. Point out:
   - **Calm by default**: The screen is non-intrusive and silent during normal operations.
   - **Tray progress**: Visual indicator of cooked trays remaining vs dining rate.
3. Trigger an alert condition:
   - In the **Tray Capacity Form**, lower tray capacity to `30` while the simulator is running near peak.
   - Within 1 second, an **Alert Banner** appears:
     > *"Tray depletion predicted in 8 minutes — prepare refill immediately."*
   - Audio chime plays (if sound was enabled).
4. Demonstrate staff resolution:
   - Click **Acknowledge** (1-tap ack records timestamp and staff ID).
   - Update tray capacity to `300` (kitchen refilled trays) → alert auto-clears on the very next tick with hysteresis.

### Minute 3:00 – 4:00 · The Administrator Analytics & Live Calibration
1. Switch to `http://localhost:3000/admin`.
2. Open the **Analytics & Curves** tab:
   - **Occupancy vs Sessions Chart**: Notice the camera headcount (cyan) plotted alongside the decay-weighted student sessions (violet). Recharts is loaded lazily on-demand!
   - **Theoretical Decay Curve**: Displays the piecewise decay function $w(t)$ from 1.0 down to 0.0 at hard expiry (60 min).
   - **Active Distribution Histogram**: Shows active students binned by weight tier.
3. Open the **Hall Settings** tab:
   - Change **Seating Capacity** from `200` to `250`.
   - Click **Save Operations Settings**.
   - Switch to the Student view → student occupancy percentage immediately adjusts on the next tick!

### Minute 4:00 – 5:00 · Privacy by Architecture & Stale Camera Failover
1. Explain **Privacy by Architecture**:
   - The edge camera script (YOLOv8 + ByteTrack) runs on local edge hardware.
   - **Zero frames and zero facial images are ever stored or transmitted**.
   - The script sends only anonymous integers: `POST /api/v1/mess/live-count` with an HMAC/API key.
2. Demonstrate **31-Second Stale Camera Fallback**:
   - When no camera tick is received for > 30 seconds, the camera reading is marked **stale**.
   - The API smoothly falls back to the decay-weighted session model.
   - On the Student UI, an amber badge displays **"Estimated"** instead of leaving students blind.

---

## 3. Stopwatch Calibration Guide (`servicePerMin`)

To calibrate the dining hall's serving speed:

1. Position a staff member with a stopwatch at the meal service counter during peak service.
2. Time exactly **20 consecutive students** receiving their trays:
   $$\text{Elapsed Time} = T \text{ seconds}$$
3. Calculate flow rate:
   $$\text{servicePerMin} = \left(\frac{20}{T}\right) \times 60$$
   *Example: 20 students served in 80 seconds $\rightarrow (20 / 80) \times 60 = 15.0 \text{ students/min}$.*
4. Enter this calibrated value in `/admin` under **Hall Settings** $\rightarrow$ **Service Flow Rate**.

---

## 4. Troubleshooting & Fallback Matrix

| Issue | Cause | Rapid Fix |
|---|---|---|
| Student UI shows "Offline" / "Reconnecting" | Socket.io disconnected or wrong port | Verify API is listening on port 3000; check browser console; click "Retry". |
| "Simulator Disabled" (403) | `ALLOW_SIMULATOR` is not `true` | Set `ALLOW_SIMULATOR=true` in `.env` or compose file and restart. |
| Alert never fires on `/staff` | Tray capacity unset or simulator not running | Enter a low tray number (e.g. 20) while simulator is active. |
| Admin chart is empty | No historical snapshots | Run `npm run seed` to load 3-day sample snapshots. |
| Port 3000 already in use | Stale process running | Run `npx kill-port 3000` or change `PORT=3001` in `.env`. |
