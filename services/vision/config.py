"""Configuration dataclass for services/vision."""

from dataclasses import dataclass, field
from typing import Tuple


@dataclass
class VisionConfig:
    source: str = "0"
    api_url: str = "http://localhost:3000/api/v1"
    ingest_key: str = ""
    mess_id: str = "mess-default"
    post_interval_s: float = 5.0
    line: Tuple[Tuple[int, int], Tuple[int, int]] = ((0, 240), (640, 240))
    entry_side: str = "left"  # "left", "right", "top", "bottom"
    stride: int = 2
    imgsz: int = 640
    min_track_frames: int = 3
    hysteresis_px: float = 15.0
    max_unseen_frames: int = 30
