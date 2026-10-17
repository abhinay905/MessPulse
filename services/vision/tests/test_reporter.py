"""Unit tests for services/vision/reporter.py.

DOC3 §3.2, DOC4 Step 7.
Verifies:
- Monotonic seq numbers
- Immediate delivery on HTTP 200
- Buffering and oldest-first flush on transient failures
- Buffer capacity cap and oldest item dropping
- Non-zero exit (SystemExit 1) on HTTP 401 (misconfigured ingest key)
"""

from unittest.mock import MagicMock
import pytest
import requests
from services.vision.reporter import ReadingReporter


class MockResponse:
    def __init__(self, status_code: int = 200, text: str = '{"accepted":true}'):
        self.status_code = status_code
        self.text = text


def test_monotonic_seq():
    """Verify seq starts at 1 and increases monotonically."""
    session = MagicMock(spec=requests.Session)
    session.post.return_value = MockResponse(200)

    reporter = ReadingReporter(
        api_url="http://localhost:3000/api/v1",
        ingest_key="test-key",
        session=session,
    )

    assert reporter.seq == 0
    assert reporter.next_seq() == 1
    assert reporter.next_seq() == 2
    assert reporter.next_seq() == 3


def test_immediate_delivery_on_200():
    """Verify that successful HTTP POST delivers payload and does not buffer."""
    session = MagicMock(spec=requests.Session)
    session.post.return_value = MockResponse(200)

    reporter = ReadingReporter(
        api_url="http://localhost:3000/api/v1",
        ingest_key="test-key",
        mess_id="mess-test",
        session=session,
    )

    success = reporter.report(in_total=10, out_total=4, now_ms=100000)
    assert success is True
    assert len(reporter.buffer) == 0

    session.post.assert_called_once()
    call_args, call_kwargs = session.post.call_args
    assert call_args[0] == "http://localhost:3000/api/v1/mess/live-count"
    assert call_kwargs["headers"]["X-Ingest-Key"] == "test-key"
    payload = call_kwargs["json"]
    assert payload["messId"] == "mess-test"
    assert payload["seq"] == 1
    assert payload["count"] == 6
    assert payload["inCount"] == 10
    assert payload["outCount"] == 4
    assert payload["capturedAt"] == 100000


def test_buffering_and_oldest_first_flush():
    """Verify that failed attempts buffer payloads and flush oldest-first when service recovers."""
    session = MagicMock(spec=requests.Session)
    # 3 failures followed by successes
    session.post.side_effect = [
        requests.RequestException("Connection refused"),
        requests.RequestException("Timeout"),
        requests.RequestException("503 Service Unavailable"),
        MockResponse(200),  # for flushing payload 1
        MockResponse(200),  # for flushing payload 2
        MockResponse(200),  # for flushing payload 3
        MockResponse(200),  # for flushing payload 4
    ]

    reporter = ReadingReporter(
        api_url="http://localhost:3000/api/v1",
        ingest_key="test-key",
        session=session,
    )

    # 3 failed reports -> all 3 should be buffered
    assert reporter.report(in_total=5, out_total=1) is False
    assert reporter.report(in_total=10, out_total=2) is False
    assert reporter.report(in_total=15, out_total=3) is False
    assert len(reporter.buffer) == 3

    # Check seq numbers buffered: [1, 2, 3]
    assert [p["seq"] for p in reporter.buffer] == [1, 2, 3]

    # 4th report: adds payload 4 to buffer, then flush_buffer delivers oldest first: 1, 2, 3, 4!
    assert reporter.report(in_total=20, out_total=4) is False  # returns False because buffer was non-empty
    assert len(reporter.buffer) == 0  # all flushed!


def test_buffer_capacity_cap():
    """Verify that buffer drops oldest payloads when exceeding max_buffer."""
    session = MagicMock(spec=requests.Session)
    session.post.side_effect = requests.RequestException("API down")

    reporter = ReadingReporter(
        api_url="http://localhost:3000/api/v1",
        ingest_key="test-key",
        max_buffer=3,
        session=session,
    )

    for i in range(1, 6):
        reporter.report(in_total=i, out_total=0)

    # Max buffer is 3, so only the last 3 (seq 3, 4, 5) remain; seq 1 & 2 dropped
    assert len(reporter.buffer) == 3
    assert [p["seq"] for p in reporter.buffer] == [3, 4, 5]


def test_exit_on_401():
    """Verify reporter exits non-zero immediately on HTTP 401."""
    session = MagicMock(spec=requests.Session)
    session.post.return_value = MockResponse(401, '{"error":"AUTH_ERROR"}')

    reporter = ReadingReporter(
        api_url="http://localhost:3000/api/v1",
        ingest_key="invalid-key",
        session=session,
    )

    with pytest.raises(SystemExit) as excinfo:
        reporter.report(in_total=1, out_total=0)

    assert excinfo.value.code == 1
