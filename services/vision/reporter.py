"""services/vision/reporter.py — HTTP reading reporter with retry, backoff, and buffering.

DOC3 §3.2, DOC4 Step 7.
- Monotonically increasing seq number.
- 3 s timeout.
- Bounded deque(maxlen=100) buffering un-sent readings.
- Flushes buffer oldest first on successful HTTP POST.
- Drops oldest if buffer exceeds 100 entries and logs warning.
- Exits with sys.exit(1) on HTTP 401 (misconfigured ingest key).
"""

from collections import deque
import logging
import sys
import time
from typing import Any, Deque, Dict, Optional
import requests

logger = logging.getLogger("vision.reporter")


class ReadingReporter:
    def __init__(
        self,
        api_url: str,
        ingest_key: str,
        mess_id: str = "mess-default",
        timeout_s: float = 3.0,
        max_buffer: int = 100,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.ingest_key = ingest_key
        self.mess_id = mess_id
        self.timeout_s = timeout_s
        self.max_buffer = max_buffer
        self.seq = 0
        self.buffer: Deque[Dict[str, Any]] = deque(maxlen=max_buffer)
        self.session = session or requests.Session()

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq

    def _post(self, payload: Dict[str, Any]) -> bool:
        url = f"{self.api_url}/mess/live-count"
        headers = {
            "Content-Type": "application/json",
            "X-Ingest-Key": self.ingest_key,
        }
        try:
            resp = self.session.post(url, json=payload, headers=headers, timeout=self.timeout_s)
            if resp.status_code == 401:
                logger.error("401 Unauthorized from MessPulse API: check X-Ingest-Key configuration")
                sys.exit(1)

            if 200 <= resp.status_code < 300:
                return True
            else:
                logger.warning(
                    "Ingest POST returned HTTP %d: %s", resp.status_code, resp.text
                )
                return False
        except requests.RequestException as exc:
            logger.warning("Ingest POST failed: %s", exc)
            return False

    def flush_buffer(self) -> int:
        """Flushes buffered readings oldest first. Returns count of successfully flushed payloads."""
        flushed_count = 0
        while self.buffer:
            oldest_payload = self.buffer[0]
            if self._post(oldest_payload):
                self.buffer.popleft()
                flushed_count += 1
            else:
                break
        return flushed_count

    def report(
        self,
        in_total: int,
        out_total: int,
        now_ms: Optional[int] = None,
        frame_count: Optional[int] = None,
    ) -> bool:
        net_count = max(0, in_total - out_total)
        captured_at = now_ms if now_ms is not None else int(time.time() * 1000)

        payload: Dict[str, Any] = {
            "messId": self.mess_id,
            "seq": self.next_seq(),
            "count": net_count,
            "inCount": in_total,
            "outCount": out_total,
            "capturedAt": captured_at,
        }
        if frame_count is not None:
            payload["frameCount"] = frame_count

        # If buffer already had items, buffer this new payload and try flushing oldest-first
        if self.buffer:
            if len(self.buffer) >= self.max_buffer:
                logger.warning("Reporter buffer is full (%d); dropping oldest payload", self.max_buffer)
            self.buffer.append(payload)
            self.flush_buffer()
            return False

        # Deliver current payload directly
        delivered = self._post(payload)
        if delivered:
            return True
        else:
            if len(self.buffer) >= self.max_buffer:
                logger.warning("Reporter buffer is full (%d); dropping oldest payload", self.max_buffer)
            self.buffer.append(payload)
            return False
