# Build Step 1: Vision Feasibility Spike Results

## 1. Overview
- **Objective:** Evaluate if YOLOv8n + ByteTrack with a pure geometric `LineCrossingCounter` can accurately count people crossing an entrance boundary.
- **Model:** YOLOv8n (`yolov8n.pt`) with ByteTrack (`bytetrack.yaml`) tracking class 0 (`person`).
- **Target Metrics:**
  - Net count error $\le \pm 10\%$ ($\pm 20\%$ = pass-with-risk).
  - Effective processing speed $\ge 8$ FPS on CPU.
  - Zero networking / zero database on this step.

---

## 2. Unit Test Verification (Synthetic Tracks)
Ran `pytest services/vision -v`:
- `test_clean_in_crossing`: **PASSED**
- `test_clean_out_crossing`: **PASSED**
- `test_jitter_around_line_zero_counts`: **PASSED**
- `test_track_appearing_on_far_side_zero_counts`: **PASSED**
- `test_two_simultaneous_tracks`: **PASSED**
- `test_stale_track_eviction`: **PASSED**

Status: **6/6 passed** (100%).

---

## 3. Video Benchmark on Entrance Clip

### Configuration Parameters
- **CLI Command:** `python -m services.vision.spike --source services/vision/clips/people-detection.mp4 --line 0,240,768,240 --entry-side bottom --stride 2 --imgsz 640 --device cpu`
- **Clip Used:** `services/vision/clips/people-detection.mp4` (Resolution: 768x432, 596 frames, 49.7s)
- **Model / Settings:** YOLOv8n (`yolov8n.pt`) + ByteTrack (`bytetrack.yaml`), `stride=2`, `imgsz=640`, `hysteresis_px=15.0`, `min_track_frames=3`

### Benchmark Results

| Metric | Manual Ground Truth | Vision Spike Count | Error (%) | Status |
|---|---|---|---|---|
| In Count | 7 | 7 | 0.0% | **PASS** ($\le \pm 10\%$) |
| Out Count | 0 | 0 | 0.0% | **PASS** |
| Net Count | 7 | 7 | 0.0% | **PASS** |
| Effective FPS | Target $\ge 8.0$ | **20.9 FPS** | - | **PASS** (2.6x target) |

---

## 4. Conclusion & Feasibility Sign-off
- **Accuracy:** Clean 0% error on the pedestrian benchmark (7 counted vs 7 ground truth).
- **Throughput:** 20.9 effective FPS on CPU at `stride=2` exceeds the 8.0 FPS target comfortably.
- **Pure Geometric Logic:** `LineCrossingCounter` successfully rejects jitter and prevents double-counts.
- **Done When Criteria:** All 4 criteria (a, b, c, d) for Build Step 1 are fully satisfied.
