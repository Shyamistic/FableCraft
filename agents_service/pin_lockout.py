"""
PIN lockout logic for the Parent Dashboard.
Tracks consecutive failed PIN attempts and enforces a 60-second lockout
after 5 consecutive incorrect attempts.
"""

import time
from dataclasses import dataclass, field


@dataclass
class LockoutState:
    """Tracks PIN attempt state for lockout logic."""

    consecutive_failures: int = 0
    locked_until: float = 0.0  # Unix timestamp when lockout expires


# Global lockout state (single-instance; no per-IP tracking needed for MVP)
_lockout_state = LockoutState()

MAX_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 60


def get_lockout_state() -> LockoutState:
    """Return the global lockout state (useful for testing)."""
    return _lockout_state


def reset_lockout_state() -> None:
    """Reset the lockout state (useful for testing)."""
    _lockout_state.consecutive_failures = 0
    _lockout_state.locked_until = 0.0


def is_locked_out() -> bool:
    """Check if PIN entry is currently locked out."""
    if _lockout_state.locked_until == 0.0:
        return False
    now = time.time()
    if now < _lockout_state.locked_until:
        return True
    # Lockout has expired — reset state
    reset_lockout_state()
    return False


def remaining_lockout_seconds() -> int:
    """Return remaining lockout time in seconds (0 if not locked)."""
    if not is_locked_out():
        return 0
    return max(0, int(_lockout_state.locked_until - time.time()))


def record_failed_attempt() -> bool:
    """
    Record a failed PIN attempt. Returns True if this attempt triggers lockout.
    """
    _lockout_state.consecutive_failures += 1
    if _lockout_state.consecutive_failures >= MAX_ATTEMPTS:
        _lockout_state.locked_until = time.time() + LOCKOUT_DURATION_SECONDS
        return True
    return False


def record_success() -> None:
    """Record a successful PIN entry — resets failure counter."""
    reset_lockout_state()
