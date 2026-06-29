"""
Unit tests for the Collaborative Manager service.
Tests room creation, joining, turn alternation, coin tracking,
disconnect handling, and WebSocket message flow.

Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocketDisconnect

from collab_manager import (
    CollabManager,
    CollabRoom,
    RoomExpiredError,
    RoomFullError,
    RoomNotFoundError,
    get_active_player,
    ROOM_CODE_MIN,
    ROOM_CODE_MAX,
    ROOM_EXPIRY_SECONDS,
    DISCONNECT_TIMEOUT_SECONDS,
    TURN_TIMEOUT_SECONDS,
    MAX_COINS,
    TOTAL_SCENES,
)


# --- Room Code Generation Tests ---


class TestRoomCodeGeneration:
    """Tests for room code generation (Requirement 12.1)."""

    def test_create_room_returns_4_digit_code(self):
        """Room code should be exactly 4 numeric digits."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        assert len(code) == 4
        assert code.isdigit()
        assert ROOM_CODE_MIN <= int(code) <= ROOM_CODE_MAX

    def test_create_room_stores_room(self):
        """Created room should be stored in manager."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager.get_room(code)
        assert room is not None
        assert room.player1_name == "Alice"
        assert room.status == "waiting"

    def test_create_multiple_rooms_unique_codes(self):
        """Multiple rooms should get unique codes."""
        manager = CollabManager()
        codes = set()
        for i in range(10):
            code = manager.create_room(f"Player{i}")
            codes.add(code)
        assert len(codes) == 10

    def test_room_expires_after_5_minutes(self):
        """Room should expire if P2 hasn't joined within 5 minutes."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager.get_room(code)

        # Simulate time passing beyond expiry
        room.created_at = time.time() - ROOM_EXPIRY_SECONDS - 1

        assert room.is_expired is True
        # Cleanup should remove it
        assert manager.get_room(code) is None

    def test_room_not_expired_within_5_minutes(self):
        """Room should not expire within 5 minutes."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager.get_room(code)
        assert room.is_expired is False

    def test_room_not_expired_after_p2_joins(self):
        """Room should not expire once P2 has joined."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        manager.join_room(code, "Bob")
        room = manager.get_room(code)

        # Even if time has passed, it shouldn't expire
        room.created_at = time.time() - ROOM_EXPIRY_SECONDS - 1
        assert room.is_expired is False


# --- Room Joining Tests ---


class TestRoomJoining:
    """Tests for joining rooms (Requirement 12.7)."""

    def test_join_room_sets_player2(self):
        """Joining a room should set player2 name and activate the room."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager.join_room(code, "Bob")
        assert room.player2_name == "Bob"
        assert room.status == "active"

    def test_join_nonexistent_room_raises(self):
        """Joining a non-existent room should raise RoomNotFoundError."""
        manager = CollabManager()
        with pytest.raises(RoomNotFoundError):
            manager.join_room("0000", "Bob")

    def test_join_expired_room_raises(self):
        """Joining an expired room should raise RoomExpiredError."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.created_at = time.time() - ROOM_EXPIRY_SECONDS - 1

        with pytest.raises(RoomExpiredError):
            manager.join_room(code, "Bob")

    def test_join_full_room_raises(self):
        """Joining a room that already has 2 players should raise RoomFullError."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        manager.join_room(code, "Bob")

        with pytest.raises(RoomFullError):
            manager.join_room(code, "Charlie")


# --- Turn Alternation Tests ---


class TestTurnAlternation:
    """Tests for turn alternation logic (Requirement 12.2)."""

    def test_odd_scenes_player1(self):
        """Odd-numbered scenes should be Player 1's turn."""
        assert get_active_player(1) == 1
        assert get_active_player(3) == 1
        assert get_active_player(5) == 1
        assert get_active_player(7) == 1

    def test_even_scenes_player2(self):
        """Even-numbered scenes should be Player 2's turn."""
        assert get_active_player(2) == 2
        assert get_active_player(4) == 2
        assert get_active_player(6) == 2
        assert get_active_player(8) == 2

    def test_room_active_player_matches(self):
        """Room's active_player property should match the function."""
        room = CollabRoom("1234", "Alice")
        room.current_scene = 1
        assert room.active_player == 1

        room.current_scene = 2
        assert room.active_player == 2

        room.current_scene = 5
        assert room.active_player == 1


# --- Coin Tracking Tests ---


class TestCoinTracking:
    """Tests for shared coin total (Requirement 12.4)."""

    def test_initial_coins_zero(self):
        """Room starts with 0 coins."""
        room = CollabRoom("1234", "Alice")
        assert room.shared_coins == 0

    def test_add_coin_increments(self):
        """Adding a coin should increment the total."""
        room = CollabRoom("1234", "Alice")
        result = room.add_coin()
        assert result == 1
        assert room.shared_coins == 1

    def test_coins_max_at_8(self):
        """Coins should cap at MAX_COINS (8)."""
        room = CollabRoom("1234", "Alice")
        for _ in range(10):
            room.add_coin()
        assert room.shared_coins == MAX_COINS

    def test_coins_accumulate_across_scenes(self):
        """Coins should accumulate as scenes are completed."""
        room = CollabRoom("1234", "Alice")
        for i in range(5):
            room.add_coin()
            room.advance_scene()
        assert room.shared_coins == 5
        assert room.current_scene == 6


# --- Scene Advancement Tests ---


class TestSceneAdvancement:
    """Tests for scene progression."""

    def test_advance_scene(self):
        """Advancing scene should increment current_scene."""
        room = CollabRoom("1234", "Alice")
        assert room.current_scene == 1
        room.advance_scene()
        assert room.current_scene == 2

    def test_advance_does_not_exceed_total(self):
        """Scene should not advance beyond TOTAL_SCENES + 1 (completion marker)."""
        room = CollabRoom("1234", "Alice")
        for _ in range(TOTAL_SCENES + 5):
            room.advance_scene()
        # After advancing past TOTAL_SCENES, current_scene goes to TOTAL_SCENES + 1
        # and stays there (no further advancing since current_scene > TOTAL_SCENES)
        assert room.current_scene == TOTAL_SCENES + 1

    def test_quest_complete_detection(self):
        """Quest should be detected as complete after all scenes are advanced through."""
        room = CollabRoom("1234", "Alice")
        for i in range(TOTAL_SCENES):
            assert room.is_quest_complete() is False
            room.advance_scene()
        # After advancing 8 times, current_scene = 9 which means quest is complete
        assert room.is_quest_complete() is True


# --- WebSocket Handler Tests ---


class TestWebSocketHandler:
    """Tests for WebSocket message handling."""

    @pytest.fixture
    def manager(self):
        return CollabManager()

    @pytest.fixture
    def mock_websocket(self):
        ws = AsyncMock()
        ws.send_json = AsyncMock()
        ws.receive_json = AsyncMock()
        ws.accept = AsyncMock()
        ws.close = AsyncMock()
        return ws

    @pytest.mark.asyncio
    async def test_create_room_via_websocket(self, manager, mock_websocket):
        """Player 1 can create a room via WebSocket."""
        call_count = 0

        async def receive_side_effect():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"type": "create", "player_name": "Alice"}
            raise WebSocketDisconnect()

        mock_websocket.receive_json = AsyncMock(side_effect=receive_side_effect)

        await manager.handle_websocket(mock_websocket, "new")

        # Should have sent room_created message
        calls = mock_websocket.send_json.call_args_list
        assert len(calls) >= 1
        first_msg = calls[0][0][0]
        assert first_msg["type"] == "room_created"
        assert "room_code" in first_msg
        assert first_msg["player_number"] == 1

    @pytest.mark.asyncio
    async def test_join_nonexistent_room_sends_error(self, manager, mock_websocket):
        """Joining a non-existent room should send an error message."""
        mock_websocket.receive_json = AsyncMock(
            return_value={"type": "join", "player_name": "Bob", "room_code": "9999"}
        )

        await manager.handle_websocket(mock_websocket, "9999")

        calls = mock_websocket.send_json.call_args_list
        assert len(calls) >= 1
        error_msg = calls[0][0][0]
        assert error_msg["type"] == "error"
        assert "not found" in error_msg["message"].lower() or "Room" in error_msg["message"]

    @pytest.mark.asyncio
    async def test_invalid_message_sends_error(self, manager, mock_websocket):
        """Sending an unknown message type should send an error."""
        mock_websocket.receive_json = AsyncMock(
            return_value={"type": "unknown_type", "player_name": "Alice"}
        )

        await manager.handle_websocket(mock_websocket, "new")

        calls = mock_websocket.send_json.call_args_list
        assert len(calls) >= 1
        error_msg = calls[0][0][0]
        assert error_msg["type"] == "error"

    @pytest.mark.asyncio
    async def test_answer_from_wrong_player_rejected(self, manager):
        """Answer from the non-active player should be rejected."""
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"

        # Scene 1, active player is 1
        assert room.active_player == 1

        # Player 2 tries to answer
        ws2 = AsyncMock()
        room.player2_ws = ws2
        room.player1_ws = AsyncMock()

        data = {"type": "select_answer", "scene_number": 1, "option_id": "a", "is_correct": True}
        await manager._handle_answer(data, room, player_number=2)

        # Should send error to player 2
        ws2.send_json.assert_called()
        error_msg = ws2.send_json.call_args[0][0]
        assert error_msg["type"] == "error"
        assert "not your turn" in error_msg["message"].lower()

    @pytest.mark.asyncio
    async def test_correct_answer_advances_scene(self, manager):
        """A correct answer from the active player should advance the scene."""
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()
        room.player1_connected = True
        room.player2_connected = True

        assert room.current_scene == 1

        data = {"type": "select_answer", "scene_number": 1, "option_id": "a", "is_correct": True}
        await manager._handle_answer(data, room, player_number=1)

        assert room.current_scene == 2
        assert room.shared_coins == 1

    @pytest.mark.asyncio
    async def test_incorrect_answer_does_not_advance(self, manager):
        """An incorrect answer should not advance the scene or add coins."""
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()

        data = {"type": "select_answer", "scene_number": 1, "option_id": "b", "is_correct": False}
        await manager._handle_answer(data, room, player_number=1)

        assert room.current_scene == 1
        assert room.shared_coins == 0

    @pytest.mark.asyncio
    async def test_quest_completes_after_8_correct_scenes(self, manager):
        """Quest should complete after all 8 scenes are answered correctly."""
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()

        for scene_num in range(1, TOTAL_SCENES + 1):
            active = get_active_player(scene_num)
            data = {
                "type": "select_answer",
                "scene_number": scene_num,
                "option_id": "a",
                "is_correct": True,
            }
            await manager._handle_answer(data, room, player_number=active)

        assert room.status == "completed"
        assert room.shared_coins == MAX_COINS

    @pytest.mark.asyncio
    async def test_broadcast_sends_to_both_players(self, manager):
        """Broadcast should send message to both connected players."""
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()

        msg = {"type": "test", "data": "hello"}
        await manager._broadcast(room, msg)

        room.player1_ws.send_json.assert_called_once_with(msg)
        room.player2_ws.send_json.assert_called_once_with(msg)


# --- Disconnect Handling Tests ---


class TestDisconnectHandling:
    """Tests for disconnect handling (Requirement 12.5)."""

    @pytest.mark.asyncio
    async def test_disconnect_marks_player_offline(self):
        """Disconnecting should mark the player as offline."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"
        room.player1_connected = True
        room.player2_connected = True
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()

        await manager._handle_player_disconnect(room, player_number=2)

        assert room.player2_connected is False
        assert room.player2_ws is None

    @pytest.mark.asyncio
    async def test_disconnect_after_30s_enables_solo(self):
        """After 30s offline, remaining player should be notified and solo enabled."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        room = manager._rooms[code]
        room.player2_name = "Bob"
        room.status = "active"
        room.player1_connected = True
        room.player2_connected = True
        room.player1_ws = AsyncMock()
        room.player2_ws = AsyncMock()

        # Mock the sleep to be instant
        with patch("collab_manager.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_sleep.return_value = None
            await manager._handle_player_disconnect(room, player_number=2)
            # Wait for the disconnect task to complete
            if room._disconnect_task:
                await room._disconnect_task

        assert room.status == "solo"
        # Player 1 should have been notified
        room.player1_ws.send_json.assert_called()
        notify_msg = room.player1_ws.send_json.call_args[0][0]
        assert notify_msg["type"] == "disconnect_notice"
        assert notify_msg["player_number"] == 2


# --- Room Removal Tests ---


class TestRoomRemoval:
    """Tests for room cleanup."""

    def test_remove_room(self):
        """Removing a room should delete it from the registry."""
        manager = CollabManager()
        code = manager.create_room("Alice")
        assert manager.get_room(code) is not None
        manager.remove_room(code)
        assert manager.get_room(code) is None

    def test_remove_nonexistent_room_no_error(self):
        """Removing a non-existent room should not raise."""
        manager = CollabManager()
        manager.remove_room("0000")  # Should not raise
