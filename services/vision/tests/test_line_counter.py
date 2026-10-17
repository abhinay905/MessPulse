"""Unit tests for LineCrossingCounter (Step 1 Feasibility Spike).

Verifies:
- clean in-crossing
- clean out-crossing
- jitter around the line = 0 counts
- track appearing on the far side = 0 counts
- two simultaneous tracks
- stale-track eviction
"""

import pytest
from services.vision.detector import TrackedPerson
from services.vision.line_counter import LineCrossingCounter


@pytest.fixture
def vertical_counter():
    """Line at x=100 from y=0 to y=500. Entry is left (x < 100), exit is right (x > 100)."""
    return LineCrossingCounter(
        line=((100, 0), (100, 500)),
        entry_side="left",
        hysteresis_px=15.0,
        min_track_frames=3,
        max_unseen_frames=10,
    )


def test_clean_in_crossing(vertical_counter):
    """Person walks cleanly from left (entry) to right (exit)."""
    # Frame 1-3: track seen on entry side (x < 85)
    d1 = vertical_counter.update([TrackedPerson(id=1, cx=40.0, cy=250.0)])
    assert d1.in_count == 0 and d1.out_count == 0

    d2 = vertical_counter.update([TrackedPerson(id=1, cx=50.0, cy=250.0)])
    assert d2.in_count == 0 and d2.out_count == 0

    d3 = vertical_counter.update([TrackedPerson(id=1, cx=60.0, cy=250.0)])
    assert d3.in_count == 0 and d3.out_count == 0

    # Frame 4: crossing inside hysteresis band (x=100)
    d4 = vertical_counter.update([TrackedPerson(id=1, cx=100.0, cy=250.0)])
    assert d4.in_count == 0 and d4.out_count == 0

    # Frame 5: cleanly exits past hysteresis band on exit side (x=140 > 115)
    d5 = vertical_counter.update([TrackedPerson(id=1, cx=140.0, cy=250.0)])
    assert d5.in_count == 1
    assert d5.out_count == 0

    # Frame 6: continues walking on exit side - no double count
    d6 = vertical_counter.update([TrackedPerson(id=1, cx=160.0, cy=250.0)])
    assert d6.in_count == 0 and d6.out_count == 0


def test_clean_out_crossing(vertical_counter):
    """Person walks cleanly from right (exit side) to left (entry side)."""
    # Frame 1-3: track seen on exit side (x=150 > 115)
    vertical_counter.update([TrackedPerson(id=2, cx=150.0, cy=250.0)])
    vertical_counter.update([TrackedPerson(id=2, cx=140.0, cy=250.0)])
    vertical_counter.update([TrackedPerson(id=2, cx=130.0, cy=250.0)])

    # Frame 4: crossing into entry side past hysteresis band (x=50 < 85)
    d = vertical_counter.update([TrackedPerson(id=2, cx=50.0, cy=250.0)])
    assert d.in_count == 0
    assert d.out_count == 1


def test_jitter_around_line_zero_counts(vertical_counter):
    """Oscillation within the hysteresis band or near the line must yield 0 counts."""
    # Jitter entirely inside the hysteresis band [85, 115]
    for _ in range(8):
        d = vertical_counter.update([TrackedPerson(id=3, cx=95.0, cy=250.0)])
        assert d.in_count == 0 and d.out_count == 0
        d = vertical_counter.update([TrackedPerson(id=3, cx=105.0, cy=250.0)])
        assert d.in_count == 0 and d.out_count == 0

    # Also test track confirmed on left, then oscillating near line without reaching x > 115
    counter2 = LineCrossingCounter(
        line=((100, 0), (100, 500)),
        entry_side="left",
        hysteresis_px=15.0,
        min_track_frames=3,
    )
    # 3 frames confirmed on left (x=40)
    for _ in range(3):
        counter2.update([TrackedPerson(id=4, cx=40.0, cy=250.0)])

    # Moves to x=95, 105, 95 (never past 115)
    for cx in [95.0, 105.0, 100.0, 110.0, 95.0]:
        d = counter2.update([TrackedPerson(id=4, cx=cx, cy=250.0)])
        assert d.in_count == 0 and d.out_count == 0


def test_track_appearing_on_far_side_zero_counts(vertical_counter):
    """Track that appears directly on the far (exit) side must not be counted as a crossing."""
    # Track appears at x=160 (already inside the venue)
    d1 = vertical_counter.update([TrackedPerson(id=5, cx=160.0, cy=250.0)])
    assert d1.in_count == 0 and d1.out_count == 0

    d2 = vertical_counter.update([TrackedPerson(id=5, cx=170.0, cy=250.0)])
    assert d2.in_count == 0 and d2.out_count == 0

    d3 = vertical_counter.update([TrackedPerson(id=5, cx=180.0, cy=250.0)])
    assert d3.in_count == 0 and d3.out_count == 0


def test_two_simultaneous_tracks(vertical_counter):
    """Two tracks crossing at the same time: one IN and one OUT."""
    # Establish both tracks for min_track_frames (3 frames)
    # Track 10 starts on left (entry), Track 20 starts on right (exit)
    for i in range(3):
        vertical_counter.update([
            TrackedPerson(id=10, cx=50.0 + i * 5, cy=200.0),
            TrackedPerson(id=20, cx=150.0 - i * 5, cy=300.0),
        ])

    # Both cross opposite sides beyond hysteresis in the next frame
    d = vertical_counter.update([
        TrackedPerson(id=10, cx=140.0, cy=200.0),  # left -> right = IN
        TrackedPerson(id=20, cx=60.0, cy=300.0),   # right -> left = OUT
    ])
    assert d.in_count == 1
    assert d.out_count == 1


def test_stale_track_eviction(vertical_counter):
    """Tracks not seen for max_unseen_frames are evicted from memory."""
    # See track 99 once
    vertical_counter.update([TrackedPerson(id=99, cx=50.0, cy=200.0)])
    assert 99 in vertical_counter.tracks

    # Advance 11 frames with no tracks (max_unseen_frames = 10)
    for _ in range(11):
        vertical_counter.update([])

    assert 99 not in vertical_counter.tracks
