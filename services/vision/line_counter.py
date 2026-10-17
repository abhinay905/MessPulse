"""Pure line-crossing counter with hysteresis, track-frame filtering, and stale-track eviction."""

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from services.vision.detector import TrackedPerson


@dataclass(frozen=True)
class CrossingDelta:
    in_count: int
    out_count: int


@dataclass
class _TrackRecord:
    frames_seen: int
    last_seen_frame: int
    confirmed_side: Optional[int]  # +1 or -1


class LineCrossingCounter:
    """Pure geometric line-crossing counter.

    Maintains per-track memory to count crossings across an oriented line.
    Requires centroid to move beyond +/- hysteresis_px band with frames_seen >= min_track_frames.
    Evicts stale tracks after max_unseen_frames.
    """

    def __init__(
        self,
        line: Tuple[Tuple[int, int], Tuple[int, int]],
        entry_side: str = "left",
        hysteresis_px: float = 15.0,
        min_track_frames: int = 3,
        max_unseen_frames: int = 30,
    ):
        self.p1, self.p2 = line
        self.entry_side = entry_side.lower()
        self.hysteresis_px = float(hysteresis_px)
        self.min_track_frames = int(min_track_frames)
        self.max_unseen_frames = int(max_unseen_frames)

        self.dx = float(self.p2[0] - self.p1[0])
        self.dy = float(self.p2[1] - self.p1[1])
        self.length = math.hypot(self.dx, self.dy)
        if self.length == 0:
            raise ValueError("Line endpoints must be distinct (length > 0).")

        self.entry_sign = self._determine_entry_sign(self.entry_side)
        self.tracks: Dict[int, _TrackRecord] = {}
        self.current_frame = 0

    def _determine_entry_sign(self, entry_side: str) -> int:
        """Determines whether the +1 or -1 cross-product side corresponds to the entry side."""
        if entry_side in ("+", "1", "+1"):
            return 1
        if entry_side in ("-", "-1"):
            return -1

        # Normal vector n1 = (-dy, dx) has positive cross product (+1)
        # Normal vector n2 = (dy, -dx) has negative cross product (-1)
        # Check which normal vector points in the direction of the desired entry side
        if entry_side == "left":
            # Left means negative x displacement in image coordinates
            return 1 if -self.dy < 0 else -1
        elif entry_side == "right":
            # Right means positive x displacement
            return 1 if -self.dy > 0 else -1
        elif entry_side == "top":
            # Top means negative y displacement
            return 1 if self.dx < 0 else -1
        elif entry_side == "bottom":
            # Bottom means positive y displacement
            return 1 if self.dx > 0 else -1
        else:
            raise ValueError(f"Unknown entry_side: {entry_side}. Expected left, right, top, bottom, +, or -.")

    def _signed_distance(self, cx: float, cy: float) -> float:
        """Perpendicular signed distance from point (cx, cy) to line P1->P2."""
        cross = self.dx * (cy - self.p1[1]) - self.dy * (cx - self.p1[0])
        return cross / self.length

    def update(self, tracks: List[TrackedPerson]) -> CrossingDelta:
        """Update tracker state with detected tracks in current frame and return crossing counts."""
        self.current_frame += 1
        in_delta = 0
        out_delta = 0
        active_ids = set()

        for person in tracks:
            active_ids.add(person.id)
            dist = self._signed_distance(person.cx, person.cy)

            current_side: Optional[int] = None
            if dist > self.hysteresis_px:
                current_side = 1
            elif dist < -self.hysteresis_px:
                current_side = -1

            if person.id not in self.tracks:
                # First time seeing this track: initialize state
                # If seen outside hysteresis band, record confirmed_side so initial presence is not counted as crossing
                self.tracks[person.id] = _TrackRecord(
                    frames_seen=1,
                    last_seen_frame=self.current_frame,
                    confirmed_side=current_side,
                )
            else:
                record = self.tracks[person.id]
                record.frames_seen += 1
                record.last_seen_frame = self.current_frame

                if current_side is not None:
                    if record.confirmed_side is None:
                        record.confirmed_side = current_side
                    elif current_side != record.confirmed_side:
                        # Side flipped outside hysteresis band
                        if record.frames_seen >= self.min_track_frames:
                            if record.confirmed_side == self.entry_sign and current_side == -self.entry_sign:
                                in_delta += 1
                            elif record.confirmed_side == -self.entry_sign and current_side == self.entry_sign:
                                out_delta += 1
                        record.confirmed_side = current_side

        # Evict stale tracks
        stale_ids = [
            tid
            for tid, record in self.tracks.items()
            if (self.current_frame - record.last_seen_frame) > self.max_unseen_frames
        ]
        for tid in stale_ids:
            del self.tracks[tid]

        return CrossingDelta(in_count=in_delta, out_count=out_delta)
