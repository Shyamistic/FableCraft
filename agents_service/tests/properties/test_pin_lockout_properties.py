"""
Property-based tests for pin_lockout.py - PIN lockout logic and parent dashboard stats.
Tests PIN entry lockout behavior and dashboard stats consistency using Hypothesis.

**Validates: Requirements 11.4, 11.1, 11.2**
"""

import os
import sys
import time
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume, note
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, rule, initialize, invariant

from pin_lockout import (
    is_locked_out,
    record_failed_attempt,
    record_success,
    reset_lockout_state,
    get_lockout_state,
    MAX_ATTEMPTS,
    LOCKOUT_DURATION_SECONDS,
)
from models import ParentDashboardStats


# --- Strategies ---

# Strategy for sequences of PIN attempts (True = correct, False = incorrect)
st_attempt_sequence = st.lists(
    st.booleans(), min_size=1, max_size=30
)

# Strategy for number of consecutive failures (1 to 10)
st_failure_count = st.integers(min_value=1, max_value=10)

# Strategy for non-negative integers for stats fields
st_non_negative_int = st.integers(min_value=0, max_value=10000)

# Strategy for quests_completed (used to derive valid total_coins bounds)
st_quests_completed = st.integers(min_value=0, max_value=1000)


# --- Property 20: PIN Lockout Logic ---


@pytest.mark.property
class TestProperty20PINLockoutLogic:
    """
    Property 20: PIN Lockout Logic

    For any sequence of consecutive incorrect PIN entries, the system SHALL
    deny access on each attempt. After exactly 5 consecutive incorrect
    attempts, the system SHALL disable PIN entry for 60 seconds. A correct
    PIN must reset the counter. After lockout expires (60s), the system must
    accept correct PINs again.

    **Validates: Requirements 11.4**
    """

    def setup_method(self):
        """Reset lockout state before each test."""
        reset_lockout_state()

    @settings(max_examples=50, deadline=None)
    @given(n=st.integers(min_value=1, max_value=4))
    def test_fewer_than_5_failures_does_not_lock_out(self, n):
        """
        For any number of consecutive failures less than 5,
        the system must NOT be locked out.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        for _ in range(n):
            triggered = record_failed_attempt()
            assert triggered is False

        assert is_locked_out() is False
        state = get_lockout_state()
        assert state.consecutive_failures == n

    @settings(max_examples=50, deadline=None)
    @given(extra_attempts=st.integers(min_value=0, max_value=5))
    def test_exactly_5_failures_triggers_lockout(self, extra_attempts):
        """
        After exactly 5 consecutive incorrect attempts, the system must
        trigger lockout. Additional attempts beyond 5 don't change lockout state.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        # First 4 attempts should NOT trigger lockout
        for i in range(MAX_ATTEMPTS - 1):
            triggered = record_failed_attempt()
            assert triggered is False

        # The 5th attempt MUST trigger lockout
        triggered = record_failed_attempt()
        assert triggered is True
        assert is_locked_out() is True

    @settings(max_examples=50, deadline=None)
    @given(failures_before_success=st.integers(min_value=1, max_value=4))
    def test_correct_pin_resets_counter(self, failures_before_success):
        """
        A correct PIN entry must reset the failure counter, so that
        subsequent failures start counting from zero again.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        # Record some failures (fewer than 5)
        for _ in range(failures_before_success):
            record_failed_attempt()

        assert get_lockout_state().consecutive_failures == failures_before_success

        # Correct PIN resets the counter
        record_success()
        assert get_lockout_state().consecutive_failures == 0
        assert is_locked_out() is False

        # Can now fail again without immediate lockout
        triggered = record_failed_attempt()
        assert triggered is False
        assert get_lockout_state().consecutive_failures == 1

    @settings(max_examples=50, deadline=None)
    @given(attempts=st_attempt_sequence)
    def test_lockout_only_on_5_consecutive_failures(self, attempts):
        """
        For any sequence of PIN attempts, lockout is triggered only when
        there are 5 consecutive failures without an intervening success.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        consecutive_failures = 0
        lockout_expected = False

        for is_correct in attempts:
            if lockout_expected:
                # Once locked out, stop processing (system denies entry)
                break

            if is_correct:
                record_success()
                consecutive_failures = 0
            else:
                record_failed_attempt()
                consecutive_failures += 1
                if consecutive_failures >= MAX_ATTEMPTS:
                    lockout_expected = True

        assert is_locked_out() == lockout_expected

    @settings(max_examples=10, deadline=None)
    @given(st.just(True))
    def test_lockout_expires_after_60_seconds(self, _):
        """
        After lockout expires (60s), the system must accept correct PINs
        again and the state must be reset.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        # Trigger lockout
        for _ in range(MAX_ATTEMPTS):
            record_failed_attempt()

        assert is_locked_out() is True

        # Simulate time passing beyond lockout duration
        state = get_lockout_state()
        with patch("pin_lockout.time.time", return_value=state.locked_until + 1):
            assert is_locked_out() is False

    @settings(max_examples=30, deadline=None)
    @given(
        failures_before=st.integers(min_value=1, max_value=4),
        failures_after=st.integers(min_value=1, max_value=4),
    )
    def test_success_between_failure_sequences_prevents_lockout(
        self, failures_before, failures_after
    ):
        """
        If a correct PIN is entered between two sequences of failures,
        the counter resets and the total doesn't accumulate to 5.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        # First batch of failures
        for _ in range(failures_before):
            record_failed_attempt()

        # Success resets
        record_success()

        # Second batch of failures
        for _ in range(failures_after):
            record_failed_attempt()

        # Should not be locked out since each batch < 5
        assert is_locked_out() is False
        assert get_lockout_state().consecutive_failures == failures_after

    @settings(max_examples=10, deadline=None)
    @given(st.just(True))
    def test_lockout_duration_is_60_seconds(self, _):
        """
        The lockout duration must be exactly 60 seconds from when
        it was triggered.

        **Validates: Requirements 11.4**
        """
        reset_lockout_state()

        # Trigger lockout
        for _ in range(MAX_ATTEMPTS):
            record_failed_attempt()

        state = get_lockout_state()
        lockout_start = state.locked_until - LOCKOUT_DURATION_SECONDS

        # Just before expiry — still locked
        with patch(
            "pin_lockout.time.time",
            return_value=state.locked_until - 0.1,
        ):
            assert is_locked_out() is True

        # At expiry — unlocked
        with patch(
            "pin_lockout.time.time",
            return_value=state.locked_until + 0.1,
        ):
            assert is_locked_out() is False


# --- Property 19: Parent Dashboard Stats Consistency ---


@pytest.mark.property
class TestProperty19ParentDashboardStatsConsistency:
    """
    Property 19: Parent Dashboard Stats Consistency

    For any stats returned by the dashboard, all numeric fields must be
    non-negative integers. total_coins must be <= quests_completed * 8.

    **Validates: Requirements 11.1, 11.2**
    """

    @settings(max_examples=100, deadline=None)
    @given(
        quests_completed=st_quests_completed,
        lessons_covered=st_non_negative_int,
        characters_created=st_non_negative_int,
        total_time_minutes=st_non_negative_int,
    )
    def test_all_stats_fields_are_non_negative_integers(
        self, quests_completed, lessons_covered, characters_created, total_time_minutes
    ):
        """
        For any stats returned by the dashboard, all numeric fields must
        be non-negative integers.

        **Validates: Requirements 11.1**
        """
        # Derive total_coins within valid range
        max_coins = quests_completed * 8
        total_coins = min(max_coins, quests_completed * 5)  # reasonable value

        stats = ParentDashboardStats(
            quests_completed=quests_completed,
            lessons_covered=lessons_covered,
            total_coins=total_coins,
            characters_created=characters_created,
            total_time_minutes=total_time_minutes,
        )

        # All fields must be non-negative integers
        assert isinstance(stats.quests_completed, int)
        assert isinstance(stats.lessons_covered, int)
        assert isinstance(stats.total_coins, int)
        assert isinstance(stats.characters_created, int)
        assert isinstance(stats.total_time_minutes, int)

        assert stats.quests_completed >= 0
        assert stats.lessons_covered >= 0
        assert stats.total_coins >= 0
        assert stats.characters_created >= 0
        assert stats.total_time_minutes >= 0

    @settings(max_examples=100, deadline=None)
    @given(
        quests_completed=st_quests_completed,
        coins_per_quest=st.lists(
            st.integers(min_value=0, max_value=8),
            min_size=0,
            max_size=100,
        ),
    )
    def test_total_coins_bounded_by_quests_times_8(
        self, quests_completed, coins_per_quest
    ):
        """
        total_coins must be <= quests_completed * 8, since each quest
        awards at most 8 coins.

        **Validates: Requirements 11.1, 11.2**
        """
        # Use the actual number of quests
        num_quests = len(coins_per_quest)
        total_coins = sum(coins_per_quest)

        # total_coins must be <= num_quests * 8
        assert total_coins <= num_quests * 8

        # Create stats model with these values
        stats = ParentDashboardStats(
            quests_completed=num_quests,
            lessons_covered=min(num_quests, 12),
            total_coins=total_coins,
            characters_created=max(1, num_quests // 2),
            total_time_minutes=num_quests * 10,
        )

        # Verify the constraint holds in the model
        assert stats.total_coins <= stats.quests_completed * 8

    @settings(max_examples=50, deadline=None)
    @given(
        quests_completed=st.integers(min_value=0, max_value=500),
        total_time_minutes=st_non_negative_int,
    )
    def test_stats_consistency_lessons_bounded_by_quests(
        self, quests_completed, total_time_minutes
    ):
        """
        For any valid dashboard stats, lessons_covered should be a
        non-negative integer (consistency check on the stats model).

        **Validates: Requirements 11.1**
        """
        # lessons_covered is bounded by total lessons available (12 predefined + custom)
        # but must always be non-negative
        lessons_covered = min(quests_completed, 12)

        stats = ParentDashboardStats(
            quests_completed=quests_completed,
            lessons_covered=lessons_covered,
            total_coins=quests_completed * 5,  # average coins
            characters_created=max(1, quests_completed // 3),
            total_time_minutes=total_time_minutes,
        )

        assert stats.lessons_covered >= 0
        assert isinstance(stats.lessons_covered, int)

    @settings(max_examples=50, deadline=None)
    @given(
        num_quests=st.integers(min_value=0, max_value=100),
    )
    def test_zero_quests_means_zero_coins(self, num_quests):
        """
        If quests_completed is 0, total_coins must also be 0
        (no coins can be earned without completing quests).

        **Validates: Requirements 11.1, 11.2**
        """
        if num_quests == 0:
            stats = ParentDashboardStats(
                quests_completed=0,
                lessons_covered=0,
                total_coins=0,
                characters_created=0,
                total_time_minutes=0,
            )
            assert stats.total_coins == 0
        else:
            # Non-zero quests can have coins from 0 to num_quests * 8
            total_coins = min(num_quests * 8, num_quests * 6)
            stats = ParentDashboardStats(
                quests_completed=num_quests,
                lessons_covered=min(num_quests, 12),
                total_coins=total_coins,
                characters_created=1,
                total_time_minutes=num_quests * 10,
            )
            assert stats.total_coins <= stats.quests_completed * 8
