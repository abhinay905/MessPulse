"""CLI for Vision Feasibility Spike (Step 1).

Evaluates YOLOv8n + ByteTrack line-crossing counter on a recorded video or webcam.
No networking, no database, no frames saved by default.
"""

import argparse
import sys
import time
from typing import Tuple
import cv2

from services.vision.capture import FrameSource
from services.vision.detector import PersonTracker
from services.vision.line_counter import LineCrossingCounter


def parse_line_coords(line_str: str) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """Parse comma-separated 'x1,y1,x2,y2' string into ((x1, y1), (x2, y2))."""
    try:
        parts = [int(p.strip()) for p in line_str.split(",")]
        if len(parts) != 4:
            raise ValueError
        return ((parts[0], parts[1]), (parts[2], parts[3]))
    except Exception:
        raise argparse.ArgumentTypeError("Line must be 4 comma-separated integers: x1,y1,x2,y2")


def main() -> int:
    parser = argparse.ArgumentParser(description="MessPulse Vision Feasibility Spike (Step 1)")
    parser.add_argument("--source", type=str, default="0", help="Video file path or camera index")
    parser.add_argument(
        "--line",
        type=parse_line_coords,
        default=((0, 240), (640, 240)),
        help="Crossing line as x1,y1,x2,y2 (default: 0,240,640,240)",
    )
    parser.add_argument(
        "--entry-side",
        type=str,
        default="left",
        choices=["left", "right", "top", "bottom", "+", "-"],
        help="Side of the line that counts as entering (default: left)",
    )
    parser.add_argument("--stride", type=int, default=2, help="Process every Nth frame (default: 2)")
    parser.add_argument("--imgsz", type=int, default=640, help="YOLO inference image size (default: 640)")
    parser.add_argument("--device", type=str, default="cpu", help="Device for YOLO (default: cpu)")
    parser.add_argument("--preview", type=str, default=None, help="Optional output path for annotated preview video")
    parser.add_argument("--hysteresis", type=float, default=15.0, help="Hysteresis band in pixels (default: 15.0)")
    parser.add_argument("--min-frames", type=int, default=3, help="Min track frames before crossing (default: 3)")

    args = parser.parse_args()

    print(f"=== MessPulse Vision Spike ===")
    print(f"Source: {args.source}")
    print(f"Line: {args.line} | Entry side: {args.entry_side}")
    print(f"Stride: {args.stride} | Imgsz: {args.imgsz} | Device: {args.device}")

    source = FrameSource(args.source)
    tracker = PersonTracker(model_name="yolov8n.pt", imgsz=args.imgsz, device=args.device)
    counter = LineCrossingCounter(
        line=args.line,
        entry_side=args.entry_side,
        hysteresis_px=args.hysteresis,
        min_track_frames=args.min_frames,
    )

    writer = None
    in_total = 0
    out_total = 0
    processed_frames = 0
    start_time = time.time()
    last_print_time = start_time

    try:
        for frame_idx, frame in source:
            if frame_idx % args.stride != 0:
                continue

            processed_frames += 1
            tracks = tracker.track(frame)
            delta = counter.update(tracks)

            in_total += delta.in_count
            out_total += delta.out_count
            net_count = max(0, in_total - out_total)

            now = time.time()

            # Optional annotated video preview
            if args.preview:
                if writer is None:
                    h, w = frame.shape[:2]
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    writer = cv2.VideoWriter(args.preview, fourcc, 15.0, (w, h))

                p1, p2 = args.line
                cv2.line(frame, p1, p2, (255, 255, 0), 2)
                for person in tracks:
                    cv2.circle(frame, (int(person.cx), int(person.cy)), 5, (0, 0, 255), -1)
                    cv2.putText(
                        frame,
                        f"ID:{person.id}",
                        (int(person.cx) - 10, int(person.cy) - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 0),
                        1,
                    )
                cv2.putText(
                    frame,
                    f"IN: {in_total}  OUT: {out_total}  NET: {net_count}",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (0, 255, 255),
                    2,
                )
                writer.write(frame)

            # Print running totals every 5 seconds
            if now - last_print_time >= 5.0:
                elapsed = now - start_time
                effective_fps = processed_frames / elapsed if elapsed > 0 else 0.0
                print(
                    f"[+{elapsed:5.1f}s] Frame {frame_idx:5d} | "
                    f"In: {in_total:3d} | Out: {out_total:3d} | Net: {net_count:3d} | "
                    f"FPS: {effective_fps:4.1f}"
                )
                last_print_time = now

    except KeyboardInterrupt:
        print("\nInterrupted by user.")
    finally:
        source.release()
        if writer is not None:
            writer.release()

    total_time = time.time() - start_time
    final_fps = processed_frames / total_time if total_time > 0 else 0.0
    net_count = max(0, in_total - out_total)

    print("\n=== Spike Summary ===")
    print(f"Processed frames: {processed_frames} in {total_time:.2f}s ({final_fps:.1f} effective FPS)")
    print(f"Final Count -> In: {in_total} | Out: {out_total} | Net: {net_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
