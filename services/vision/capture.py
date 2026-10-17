"""Frame capture module for webcam, RTSP stream, or video file."""

import time
import logging
from typing import Generator, Tuple, Union
import cv2
import numpy as np

logger = logging.getLogger(__name__)


class FrameSource:
    """Iterates frames from a video file, webcam index, or RTSP stream."""

    def __init__(self, source: Union[str, int], max_reconnect_attempts: int = 5, reconnect_delay_s: float = 1.0):
        self.source = int(source) if str(source).isdigit() else str(source)
        self.is_file = not str(source).isdigit() and not str(source).startswith("rtsp://")
        self.max_reconnect_attempts = max_reconnect_attempts
        self.reconnect_delay_s = reconnect_delay_s
        self.cap = None

    def _open(self) -> bool:
        if self.cap is not None:
            self.cap.release()
        self.cap = cv2.VideoCapture(self.source)
        return bool(self.cap.isOpened())

    def __iter__(self) -> Generator[Tuple[int, np.ndarray], None, None]:
        attempts = 0
        while not self._open():
            if self.is_file:
                logger.error(f"Cannot open video file: {self.source}")
                return
            attempts += 1
            if attempts > self.max_reconnect_attempts:
                logger.error(f"Failed to open source after {self.max_reconnect_attempts} attempts: {self.source}")
                return
            logger.warning(f"Connection failed to {self.source}. Retrying in {self.reconnect_delay_s}s...")
            time.sleep(self.reconnect_delay_s)

        frame_idx = 0
        try:
            while True:
                if self.cap is None or not self.cap.isOpened():
                    if self.is_file:
                        break
                    if not self._open():
                        time.sleep(self.reconnect_delay_s)
                        continue

                ret, frame = self.cap.read()
                if not ret or frame is None:
                    if self.is_file:
                        logger.info("Reached end of video file.")
                        break
                    else:
                        logger.warning("Frame read failed. Attempting reconnect...")
                        time.sleep(self.reconnect_delay_s)
                        self._open()
                        continue

                yield frame_idx, frame
                frame_idx += 1
        finally:
            self.release()

    def get_fps(self) -> float:
        if self.cap and self.cap.isOpened():
            fps = self.cap.get(cv2.CAP_PROP_FPS)
            if fps > 0:
                return float(fps)
        return 30.0

    def get_frame_count(self) -> int:
        if self.cap and self.cap.isOpened() and self.is_file:
            return int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        return -1

    def release(self) -> None:
        if self.cap is not None:
            self.cap.release()
            self.cap = None
