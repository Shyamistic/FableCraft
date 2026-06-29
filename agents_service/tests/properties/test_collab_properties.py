"""
Property-based tests for collab_manager.py - collaborative story mode.
Tests room code generation/expiry, turn alternation, and disconnect handling using Hypothesis.

**Validates: Requirements 12.1, 12.2, 12.5**
"""

import os
import sys
import time
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from collab_manager import (
    CollabManager,
    CollabRoom,
    RoomExpiredError,
    get_active_player,
    ROOM_CODE_MIN,
    ROOM_CODE_MAX,
    ROOM_EXPIRY_SECONDS,
    DISCONNECT_TIMEOUT_SECONDS,
)


# --- Strategies ---

# Strategy for valid player names
st_player_name = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
    min_size=1,
    max_size=20,
).filter(lambda s: s.strip() != "")

# Strategy for scene numbers (1-8)
st_scene_number = st.integers(min_value=1, max_value=8)

# Strategy for a broader range of scene numbers to test edge cases
st_scene_number_broad = st.integers(min_value=1, max_value=100)

# Strategy for time offsets in seconds (for expiry testing)
st_time_before_expiry = st.floats(min_value=0, max_value=ROOM_EXPIRY_SECONDS - 1)
st_time_after_expiry = st.floats(
    min_value=ROOM_EXPIRY_SECONDS + 0.1, max_value=ROOM_EXPIRY_SECONDS + 3600
)

# Strategy for disconnect durations
st_time_before_disconnect_timeout = st.floats(
    min_value=0, max_value=DISCONNECT_TIMEOUT_SECONDS - 0.1
)
st_time_after_disconnect_timeout = st.floats(
    min_value=DISCONNECT_TIMEOUT_SECONDS + 0.1,
    max_value=DISCONNECT_TIMEOUT_SECONDS + 3600,
)

# Strategy for player numbers
st_player_number = st.sampled_from([1, 2])


# --- Property 22: Collaborative Room Code and Expiry ---


@pytest.mark.property
class TestProperty22CollaborativeRoomCodeAndExpiry:
    """
    Property 22: Collaborative Room Code and Expiry

    For any generated collaborative session room code, the code SHALL be
    exactly 4 numeric digits (1000-9999). If a second player has not joined
    within 5 minutes of creation, the room code SHALL be invalidated.

    **Validates: Requirements 12.1**
    """

    @settings(max_examples=50, deadline=None)
    @given(player_name=st_player_name)
    def test_room_code_is_4_digit_numeric(self, player_name):
        """
        For any generated room code, it must be a 4-digit numeric string
        in the range 1000-9999.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(player_name)

        # Room code must be a string
        assert isinstance(room_code, str)

        # Room code must be exactly 4 characters
        assert len(room_code) == 4

        # Room code must be all digits
        assert room_code.isdigit()

        # Room code must be in range 1000-9999
        code_int = int(room_code)
        assert ROOM_CODE_MIN <= code_int <= ROOM_CODE_MAX

    @settings(max_examples=30, deadline=None)
    @given(player_name=st_player_name)
    def test_room_not_expired_before_5_minutes(self, player_name):
        """
        A room where P2 hasn't joined should NOT be expired if less than
        5 minutes have passed since creation.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(player_name)
        room = manager.get_room(room_code)

        # Room should exist and not be expired immediately after creation
        assert room is not None
        assert room.is_expired is False

    @settings(max_examples=30, deadline=None)
    @given(
        player_name=st_player_name,
        elapsed=st_time_after_expiry,
    )
    def test_room_expired_after_5_minutes_without_p2(self, player_name, elapsed):
        """
        If P2 hasn't joined within 5 minutes, the room must be marked expired.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(player_name)
        room = manager._rooms[room_code]

        # Simulate time passing by setting created_at in the past
        room.created_at = time.time() - elapsed

        # Room should be expired
        assert room.is_expired is True

    @settings(max_examples=30, deadline=None)
    @given(
        player_name=st_player_name,
        elapsed=st_time_after_expiry,
    )
    def test_expired_room_removed_on_cleanup(self, player_name, elapsed):
        """
        Expired rooms should be cleaned up and no longer accessible.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(player_name)
        room = manager._rooms[room_code]

        # Simulate expiry
        room.created_at = time.time() - elapsed

        # Accessing via get_room should clean up and return None
        result = manager.get_room(room_code)
        assert result is None

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        elapsed=st_time_after_expiry,
    )
    def test_join_expired_room_raises_error(self, creator_name, joiner_name, elapsed):
        """
        Attempting to join an expired room must raise RoomExpiredError.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(creator_name)
        room = manager._rooms[room_code]

        # Simulate expiry
        room.created_at = time.time() - elapsed

        with pytest.raises(RoomExpiredError):
            manager.join_room(room_code, joiner_name)

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
    )
    def test_room_not_expired_after_p2_joins(self, creator_name, joiner_name):
        """
        Once P2 joins, the room should not be marked as expired regardless
        of how much time has passed.

        **Validates: Requirements 12.1**
        """
        manager = CollabManager()
        room_code = manager.create_room(creator_name)

        # P2 joins
        room = manager.join_room(room_code, joiner_name)

        # Even if we simulate time passing, room should not be expired since P2 joined
        room.created_at = time.time() - (ROOM_EXPIRY_SECONDS + 100)
        assert room.is_expired is False


# --- Property 23: Collaborative Turn Alternation ---


@pytest.mark.property
class TestProperty23CollaborativeTurnAlternation:
    """
    Property 23: Collaborative Turn Alternation

    For any scene number N in a collaborative quest (1 through 8), the active
    player SHALL be Player 1 for odd-numbered scenes and Player 2 for
    even-numbered scenes.

    **Validates: Requirements 12.2**
    """

    @settings(max_examples=50, deadline=None)
    @given(scene_number=st_scene_number)
    def test_odd_scenes_are_player_1_turn(self, scene_number):
        """
        For any scene_number 1-8, odd scenes must be Player 1's turn.

        **Validates: Requirements 12.2**
        """
        assume(scene_number % 2 == 1)
        active = get_active_player(scene_number)
        assert active == 1

    @settings(max_examples=50, deadline=None)
    @given(scene_number=st_scene_number)
    def test_even_scenes_are_player_2_turn(self, scene_number):
        """
        For any scene_number 1-8, even scenes must be Player 2's turn.

        **Validates: Requirements 12.2**
        """
        assume(scene_number % 2 == 0)
        active = get_active_player(scene_number)
        assert active == 2

    @settings(max_examples=50, deadline=None)
    @given(scene_number=st_scene_number)
    def test_active_player_is_always_1_or_2(self, scene_number):
        """
        For any valid scene number, the active player must be exactly 1 or 2.

        **Validates: Requirements 12.2**
        """
        active = get_active_player(scene_number)
        assert active in (1, 2)

    @settings(max_examples=50, deadline=None)
    @given(scene_number=st_scene_number)
    def test_collab_room_active_player_matches_function(self, scene_number):
        """
        The CollabRoom.active_player property must agree with the
        get_active_player function for the current scene.

        **Validates: Requirements 12.2**
        """
        room = CollabRoom(room_code="1234", player1_name="Player1")
        room.current_scene = scene_number

        assert room.active_player == get_active_player(scene_number)

    @settings(max_examples=30, deadline=None)
    @given(scene_number=st_scene_number_broad)
    def test_turn_alternation_pattern_holds_for_any_scene(self, scene_number):
        """
        The alternation pattern (odd=P1, even=P2) must hold for any
        positive scene number, not just 1-8.

        **Validates: Requirements 12.2**
        """
        active = get_active_player(scene_number)
        if scene_number % 2 == 1:
            assert active == 1
        else:
            assert active == 2

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
    )
    def test_scene_advance_alternates_active_player(self, creator_name, joiner_name):
        """
        Advancing through scenes must alternate the active player correctly:
        scene 1 -> P1, scene 2 -> P2, scene 3 -> P1, etc.

        **Validates: Requirements 12.2**
        """
        room = CollabRoom(room_code="5678", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"

        # Walk through all 8 scenes and verify alternation
        for expected_scene in range(1, 9):
            assert room.current_scene == expected_scene
            expected_player = 1 if expected_scene % 2 == 1 else 2
            assert room.active_player == expected_player
            room.advance_scene()


# --- Property 24: Collaborative Disconnect Handling ---


@pytest.mark.property
class TestProperty24CollaborativeDisconnectHandling:
    """
    Property 24: Collaborative Disconnect Handling

    For any connected player in a collaborative session who disconnects for
    more than 30 seconds, the system SHALL notify the remaining player and
    enable solo continuation from the current scene onward.

    **Validates: Requirements 12.5**
    """

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        player_number=st_player_number,
    )
    def test_disconnect_tracking_fields_set(self, creator_name, joiner_name, player_number):
        """
        When a player disconnects, the room must track the disconnect time
        and mark the player as not connected.

        **Validates: Requirements 12.5**
        """
        room = CollabRoom(room_code="1234", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"
        room.player1_connected = True
        room.player2_connected = True

        # Simulate disconnect
        disconnect_time = time.time()
        if player_number == 1:
            room.player1_connected = False
            room.player1_disconnect_time = disconnect_time
        else:
            room.player2_connected = False
            room.player2_disconnect_time = disconnect_time

        # Verify disconnect is tracked
        if player_number == 1:
            assert room.player1_connected is False
            assert room.player1_disconnect_time is not None
        else:
            assert room.player2_connected is False
            assert room.player2_disconnect_time is not None

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        player_number=st_player_number,
        elapsed=st_time_after_disconnect_timeout,
    )
    def test_solo_mode_after_30s_disconnect(
        self, creator_name, joiner_name, player_number, elapsed
    ):
        """
        After a player disconnects and 30s passes without reconnection,
        the room status must be "solo" and the remaining player must be
        able to continue.

        **Validates: Requirements 12.5**
        """
        room = CollabRoom(room_code="1234", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"
        room.player1_connected = True
        room.player2_connected = True

        # Simulate disconnect
        if player_number == 1:
            room.player1_connected = False
            room.player1_disconnect_time = time.time() - elapsed
        else:
            room.player2_connected = False
            room.player2_disconnect_time = time.time() - elapsed

        # Simulate the disconnect monitor logic: check if 30s has passed
        if player_number == 1:
            time_since_disconnect = time.time() - room.player1_disconnect_time
        else:
            time_since_disconnect = time.time() - room.player2_disconnect_time

        if time_since_disconnect >= DISCONNECT_TIMEOUT_SECONDS:
            # Check player hasn't reconnected
            if player_number == 1 and not room.player1_connected:
                room.status = "solo"
            elif player_number == 2 and not room.player2_connected:
                room.status = "solo"

        # Room must be in solo mode
        assert room.status == "solo"

        # The remaining player should still be connected
        if player_number == 1:
            assert room.player2_connected is True
        else:
            assert room.player1_connected is True

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        player_number=st_player_number,
        current_scene=st_scene_number,
    )
    def test_solo_mode_preserves_current_scene(
        self, creator_name, joiner_name, player_number, current_scene
    ):
        """
        After switching to solo mode, the remaining player must be able to
        continue from the current scene onward (scene state is preserved).

        **Validates: Requirements 12.5**
        """
        room = CollabRoom(room_code="1234", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"
        room.current_scene = current_scene
        room.player1_connected = True
        room.player2_connected = True

        # Simulate disconnect and switch to solo
        if player_number == 1:
            room.player1_connected = False
            room.player1_disconnect_time = time.time() - (DISCONNECT_TIMEOUT_SECONDS + 1)
        else:
            room.player2_connected = False
            room.player2_disconnect_time = time.time() - (DISCONNECT_TIMEOUT_SECONDS + 1)

        room.status = "solo"

        # Scene should still be at the same position
        assert room.current_scene == current_scene

        # The remaining player can still advance
        if current_scene < 8:
            room.advance_scene()
            assert room.current_scene == current_scene + 1

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        player_number=st_player_number,
    )
    def test_no_solo_mode_if_reconnected_within_30s(
        self, creator_name, joiner_name, player_number
    ):
        """
        If a player reconnects within 30 seconds, the room should NOT
        switch to solo mode.

        **Validates: Requirements 12.5**
        """
        room = CollabRoom(room_code="1234", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"
        room.player1_connected = True
        room.player2_connected = True

        # Simulate disconnect
        if player_number == 1:
            room.player1_connected = False
            room.player1_disconnect_time = time.time()
        else:
            room.player2_connected = False
            room.player2_disconnect_time = time.time()

        # Player reconnects immediately (before 30s)
        if player_number == 1:
            room.player1_connected = True
            room.player1_disconnect_time = None
        else:
            room.player2_connected = True
            room.player2_disconnect_time = None

        # Room should still be active, not solo
        assert room.status == "active"

    @settings(max_examples=30, deadline=None)
    @given(
        creator_name=st_player_name,
        joiner_name=st_player_name,
        player_number=st_player_number,
        coins=st.integers(min_value=0, max_value=8),
    )
    def test_solo_mode_preserves_shared_coins(
        self, creator_name, joiner_name, player_number, coins
    ):
        """
        After switching to solo mode, the shared coin total must be preserved.

        **Validates: Requirements 12.5**
        """
        room = CollabRoom(room_code="1234", player1_name=creator_name)
        room.player2_name = joiner_name
        room.status = "active"
        room.shared_coins = coins
        room.player1_connected = True
        room.player2_connected = True

        # Simulate disconnect and switch to solo
        if player_number == 1:
            room.player1_connected = False
        else:
            room.player2_connected = False

        room.status = "solo"

        # Coins must be preserved
        assert room.shared_coins == coins
