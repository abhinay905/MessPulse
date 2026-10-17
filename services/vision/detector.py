"""Detector and tracker wrapping Ultralytics YOLOv8n with ByteTrack."""

from dataclasses import dataclass
from typing import List, Optional
import numpy as np


@dataclass
class TrackedPerson:
    id: int
    cx: float
    cy: float


class PersonTracker:
    """Wraps YOLOv8n .track() with ByteTrack to detect and track persons (class 0)."""

    def __init__(self, model_name: str = "yolov8n.pt", imgsz: int = 640, device: str = "cpu"):
        from ultralytics import YOLO

        self.model = YOLO(model_name)
        self.imgsz = imgsz
        self.device = device

    def track(self, frame: np.ndarray) -> List[TrackedPerson]:
        """Track persons in the frame and return centroids for confirmed tracks."""
        results = self.model.track(
            source=frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],  # COCO class 0 is 'person'
            verbose=False,
            imgsz=self.imgsz,
            device=self.device,
        )

        tracked_persons: List[TrackedPerson] = []
        if not results or len(results) == 0:
            return tracked_persons

        boxes = results[0].boxes
        if boxes is None or boxes.id is None:
            return tracked_persons

        ids = boxes.id.cpu().numpy().astype(int)
        xyxy = boxes.xyxy.cpu().numpy()

        for track_id, (x1, y1, x2, y2) in zip(ids, xyxy):
            cx = float((x1 + x2) / 2.0)
            cy = float((y1 + y2) / 2.0)
            tracked_persons.append(TrackedPerson(id=int(track_id), cx=cx, cy=cy))

        return tracked_persons
