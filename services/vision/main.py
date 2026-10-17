"""services/vision/main.py — CLI entry point for MessPulse vision service.

DOC3 §3.2, DOC4 Step 7.
Wires: FrameSource -> PersonTracker -> LineCrossingCounter -> ReadingReporter.
Runs continuous frame processing loop with frame stride and periodic HTTP reporting.
"""

import argparse
import logging
import os
import sys
import time
from typing import Tuple

from services.vision.capture import FrameSource
from services.vision.config import VisionConfig
from services.vision.detector import PersonTracker
from services.vision.line_counter import LineCrossingCounter
from services.vision.reporter import ReadingReporter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vision.main")


def parse_line_coords(line_str: str) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """Parse x1,y1,x2,y2 into ((x1,y1), (x2,y2))."""
    parts = [int(p.strip()) for p in line_str.split(",")]
    if len(parts) != 4:
        raise ValueError("Line must be 4 comma-separated integers: x1,y1,x2,y2")
    return ((parts[0], parts[1]), (parts[2], parts[3]))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MessPulse Vision Stream Counter & Reporter")
    parser.add_argument("--source", type=str, default=os.getenv("VISION_SOURCE", "0"), help="Video file, webcam index, or RTSP URL")
    parser.add_argument("--api-url", type=str, default=os.getenv("API_URL", "http://localhost:3000/api/v1"), help="MessPulse API base URL")
    parser.add_argument("--ingest-key", type=str, default=os.getenv("INGEST_KEY", ""), help="Static ingest key for X-Ingest-Key header")
    parser.add_argument("--mess-id", type=str, default=os.getenv("MESS_ID", "mess-default"), help="Mess identifier")
    parser.add_argument("--post-interval-s", type=float, default=float(os.getenv("POST_INTERVAL_S", "5.0")), help="Seconds between live count posts")
    parser.add_argument("--line", type=str, default="0,240,640,240", help="Virtual crossing line as x1,y1,x2,y2")
    parser.add_argument("--entry-side", type=str, choices=["left", "right", "top", "bottom"], default="top", help="Side of the line that counts as entering")
    parser.add_argument("--stride", type=int, default=2, help="Frame stride (process every Nth frame)")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image resolution")
    parser.add_argument("--min-track-frames", type=int, default=3, help="Minimum confirmed frames before counting crossing")
    parser.add_argument("--hysteresis-px", type=float, default=15.0, help="Hysteresis band thickness in pixels")
    parser.add_argument("--device", type=str, default="cpu", help="Compute device for inference (cpu/cuda)")
    return parser


def run(config: VisionConfig, device: str = "cpu") -> None:
    logger.info("Initializing MessPulse Vision Service for mess '%s'...", config.mess_id)
    logger.info("Connecting to source: %s", config.source)
    logger.info("Target API: %s/mess/live-count", config.api_url)

    source = FrameSource(config.source)
    tracker = PersonTracker(model_name="yolov8n.pt", imgsz=config.imgsz, device=device)
    counter = LineCrossingCounter(
        line=config.line,
        entry_side=config.entry_side,
        hysteresis_px=config.hysteresis_px,
        min_track_frames=config.min_track_frames,
        max_unseen_frames=config.max_unseen_frames,
    )
    reporter = ReadingReporter(
        api_url=config.api_url,
        ingest_key=config.ingest_key,
        mess_id=config.mess_id,
        timeout_s=3.0,
    )

    in_total = 0
    out_total = 0
    last_post_time = time.time()

    logger.info("Starting frame processing loop (stride=%d)...", config.stride)

    try:
        for frame_idx, frame in source:
            if frame_idx % config.stride != 0:
                continue

            tracks = tracker.track(frame)
            delta = counter.update(tracks)

            if delta.in_count > 0 or delta.out_count > 0:
                in_total += delta.in_count
                out_total += delta.out_count
                logger.info(
                    "Delta: +%d IN, +%d OUT | Cumulative: %d IN, %d OUT | Current visible: %d",
                    delta.in_count,
                    delta.out_count,
                    in_total,
                    out_total,
                    len(tracks),
                )

            now = time.time()
            if now - last_post_time >= config.post_interval_s:
                reporter.report(
                    in_total=in_total,
                    out_total=out_total,
                    now_ms=int(now * 1000),
                    frame_count=len(tracks),
                )
                last_post_time = now

        # Final flush at end of stream/file
        reporter.report(
            in_total=in_total,
            out_total=out_total,
            now_ms=int(time.time() * 1000),
        )
        logger.info("Finished processing video stream. Final counts: IN=%d, OUT=%d", in_total, out_total)

    except KeyboardInterrupt:
        logger.info("Vision service stopped by user.")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    line_coords = parse_line_coords(args.line)

    config = VisionConfig(
        source=args.source,
        api_url=args.api_url,
        ingest_key=args.ingest_key,
        mess_id=args.mess_id,
        post_interval_s=args.post_interval_s,
        line=line_coords,
        entry_side=args.entry_side,
        stride=args.stride,
        imgsz=args.imgsz,
        min_track_frames=args.min_track_frames,
        hysteresis_px=args.hysteresis_px,
    )

    run(config, device=args.device)


if __name__ == "__main__":
    main()
