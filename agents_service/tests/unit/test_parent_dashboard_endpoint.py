"""
Unit tests for the GET /api/parent/dashboard endpoint.
Tests PIN authentication, lockout logic, and response structure.
"""

import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from models import ErrorCode
from pin_lockout import reset_lockout_state, get_lockout_state, MAX_ATTEMPTS, LOCKOUT_DURATION_SECONDS


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_lockout():
    """Reset lockout state before each test."""
    reset_lockout_state()
    yield
    reset_lockout_state()


class TestParentDashboardPINAuth:
    """Tests for PIN authentication on the parent dashboard."""

    def test_correct_pin_returns_200(self):
        """A correct 4-digit PIN returns 200 with dashboard data."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "stats" in data
        assert "recent_quests" in data

    def test_incorrect_pin_returns_401(self):
        """An incorrect PIN returns 401 with PIN_INCORRECT error."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "9999"})

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_INCORRECT.value
        assert detail["status"] == "error"

    def test_missing_pin_header_returns_422(self):
        """Missing X-PIN header returns 422 (FastAPI validation)."""
        response = client.get("/api/parent/dashboard")

        assert response.status_code == 422

    def test_non_numeric_pin_returns_401(self):
        """A non-numeric PIN returns 401."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "abcd"})

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_INCORRECT.value

    def test_pin_too_short_returns_401(self):
        """A PIN shorter than 4 digits returns 401."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "123"})

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_INCORRECT.value

    def test_pin_too_long_returns_401(self):
        """A PIN longer than 4 digits returns 401."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "12345"})

        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_INCORRECT.value


class TestParentDashboardLockout:
    """Tests for PIN lockout logic."""

    def test_lockout_after_5_failed_attempts(self):
        """After 5 consecutive incorrect PINs, the endpoint returns 429."""
        for i in range(4):
            response = client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})
            assert response.status_code == 401, f"Attempt {i+1} should return 401"

        # 5th attempt triggers lockout
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})
        assert response.status_code == 429
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_LOCKOUT.value

    def test_locked_out_state_returns_429_even_with_correct_pin(self):
        """Once locked out, even the correct PIN returns 429."""
        # Trigger lockout
        for _ in range(5):
            client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})

        # Now try with correct PIN
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})
        assert response.status_code == 429
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.PIN_LOCKOUT.value

    def test_lockout_expires_after_60_seconds(self):
        """Lockout expires after 60 seconds and access is restored."""
        # Trigger lockout
        for _ in range(5):
            client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})

        # Verify locked
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})
        assert response.status_code == 429

        # Simulate time passing by manipulating the lockout state
        state = get_lockout_state()
        state.locked_until = time.time() - 1  # Set to past

        # Now correct PIN should work
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})
        assert response.status_code == 200

    def test_correct_pin_resets_failure_counter(self):
        """A correct PIN resets the failure counter."""
        # 3 failed attempts
        for _ in range(3):
            client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})

        # Correct PIN
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})
        assert response.status_code == 200

        # Another 4 failed attempts — should NOT trigger lockout (counter was reset)
        for i in range(4):
            response = client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})
            assert response.status_code == 401, f"Attempt {i+1} after reset should be 401"

    def test_lockout_message_is_child_friendly(self):
        """Lockout error messages are child-friendly (no technical jargon)."""
        for _ in range(5):
            client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})

        response = client.get("/api/parent/dashboard", headers={"X-PIN": "0000"})
        assert response.status_code == 429
        detail = response.json()["detail"]
        msg = detail["message"].lower()
        assert "wait" in msg or "try again" in msg
        assert "exception" not in msg
        assert "stack" not in msg


class TestParentDashboardResponse:
    """Tests for the dashboard response structure."""

    def test_stats_fields_present(self):
        """The stats object contains all expected fields."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})

        assert response.status_code == 200
        stats = response.json()["stats"]
        assert "quests_completed" in stats
        assert "lessons_covered" in stats
        assert "total_coins" in stats
        assert "characters_created" in stats
        assert "total_time_minutes" in stats

    def test_stats_fields_are_integers(self):
        """All stats fields are integers."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})

        stats = response.json()["stats"]
        for key, value in stats.items():
            assert isinstance(value, int), f"stats.{key} should be int, got {type(value)}"

    def test_recent_quests_is_list(self):
        """recent_quests is a list."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})

        data = response.json()
        assert isinstance(data["recent_quests"], list)

    def test_recent_quests_capped_at_50(self):
        """recent_quests list should never exceed 50 entries."""
        response = client.get("/api/parent/dashboard", headers={"X-PIN": "1234"})

        data = response.json()
        assert len(data["recent_quests"]) <= 50
