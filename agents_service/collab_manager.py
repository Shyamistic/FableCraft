"""
Collaborative Manager Service.
WebSocket room management, turn logic, and disconnect handling
for Collaborative Story Mode.

Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
"""

import asyncio
import logging
import random
import time
from typing import Dict, Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Constants
ROOM_CODE_MIN = 1000
ROOM_CODE_MAX = 9999
ROOM_EXPIRY_SECONDS = 300  # 5 minutes
DISCONNECT_TIMEOUT_SECONDS = 30
TURN_TIMEOUT_SECONDS = 60
MAX_COINS = 8
TOTAL_SCENES = 8


class RoomExpiredError(Exception):
    """Raised when a room code has expired."""
    pass


class RoomFullError(Exception):
    """Raised when a room already has 2 players."""
    pass


class RoomNotFoundError(Exception):
    """Raised when a room code does not exist."""
    pass


class CollabRoom:
    """Represents an active collaborative room."""

    def __init__(self, room_code: str, player1_name: str):
        self.room_code: str = room_code
        self.player1_name: str = player1_name
        self.player2_name: Optional[str] = None
        self.current_scene: int = 1
        self.shared_coins: int = 0
        self.status: str = "waiting"  # waiting, active, solo, completed
        self.created_at: float = time.time()
        self.last_activity: float = time.time()

        # WebSocket connections
        self.player1_ws: Optional[WebSocket] = None
        self.player2_ws: Optional[WebSocket] = None

        # Disconnect tracking
        self.player1_connected: bool = False
        self.player2_connected: bool = False
        self.player1_disconnect_time: Optional[float] = None
        self.player2_disconnect_time: Optional[float] = None

        # Turn timeout task
        self._turn_timeout_task: Optional[asyncio.Task] = None
        # Disconnect monitoring task
        self._disconnect_task: Optional[asyncio.Task] = None

    @property
    def is_expired(self) -> bool:
        """Check if room has expired (P2 hasn't joined within 5 minutes)."""
        if self.status == "waiting" and self.player2_name is None:
            return (time.time() - self.created_at) > ROOM_EXPIRY_SECONDS
        return False

    @property
    def active_player(self) -> int:
        """Get the active player for the current scene.
        Odd scenes = Player 1, Even scenes = Player 2."""
        return get_active_player(self.current_scene)

    def add_coin(self) -> int:
        """Add a coin to the shared total (max 8). Returns new total."""
        if self.shared_coins < MAX_COINS:
            self.shared_coins += 1
        return self.shared_coins

    def advance_scene(self) -> int:
        """Advance to the next scene. Returns the new scene number."""
        if self.current_scene <= TOTAL_SCENES:
            self.current_scene += 1
            self.last_activity = time.time()
        return self.current_scene

    def is_quest_complete(self) -> bool:
        """Check if all 8 scenes have been completed."""
        return self.current_scene > TOTAL_SCENES

    def cancel_tasks(self):
        """Cancel any running background tasks."""
        if self._turn_timeout_task and not self._turn_timeout_task.done():
            self._turn_timeout_task.cancel()
        if self._disconnect_task and not self._disconnect_task.done():
            self._disconnect_task.cancel()


def get_active_player(scene_number: int) -> int:
    """
    Determine which player is active for a given scene.
    Odd scenes = Player 1, Even scenes = Player 2.

    Args:
        scene_number: Current scene number (1-8)

    Returns:
        1 or 2 indicating the active player
    """
    return 1 if scene_number % 2 == 1 else 2


class CollabManager:
    """Manages collaborative story sessions via WebSocket."""

    def __init__(self):
        # Active rooms: room_code -> CollabRoom
        self._rooms: Dict[str, CollabRoom] = {}

    def _generate_room_code(self) -> str:
        """Generate a unique 4-digit numeric room code (1000-9999)."""
        max_attempts = 100
        for _ in range(max_attempts):
            code = str(random.randint(ROOM_CODE_MIN, ROOM_CODE_MAX))
            if code not in self._rooms:
                return code
        # Fallback: find any available code
        for code_int in range(ROOM_CODE_MIN, ROOM_CODE_MAX + 1):
            code = str(code_int)
            if code not in self._rooms:
                return code
        raise RuntimeError("No available room codes")

    def _cleanup_expired_rooms(self):
        """Remove expired rooms from the registry."""
        expired = [
            code for code, room in self._rooms.items()
            if room.is_expired
        ]
        for code in expired:
            room = self._rooms.pop(code)
            room.cancel_tasks()
            logger.info(f"Room {code} expired and removed")

    def create_room(self, player_name: str) -> str:
        """
        Create a new collaborative room with a 4-digit code.

        Args:
            player_name: Name of Player 1 (room creator)

        Returns:
            4-digit numeric room code
        """
        self._cleanup_expired_rooms()
        room_code = self._generate_room_code()
        room = CollabRoom(room_code=room_code, player1_name=player_name)
        self._rooms[room_code] = room
        logger.info(f"Room {room_code} created by {player_name}")
        return room_code

    def get_room(self, room_code: str) -> Optional[CollabRoom]:
        """Get a room by its code, or None if not found/expired."""
        self._cleanup_expired_rooms()
        return self._rooms.get(room_code)

    def join_room(self, room_code: str, player_name: str) -> CollabRoom:
        """
        Join an existing collaborative room as Player 2.

        Args:
            room_code: 4-digit room code
            player_name: Name of Player 2

        Returns:
            The CollabRoom instance

        Raises:
            RoomNotFoundError: if room code doesn't exist
            RoomExpiredError: if room code has expired
            RoomFullError: if room already has 2 players
        """
        room = self._rooms.get(room_code)
        if room is None:
            raise RoomNotFoundError(f"Room {room_code} not found")

        if room.is_expired:
            self._rooms.pop(room_code, None)
            room.cancel_tasks()
            raise RoomExpiredError(f"Room {room_code} has expired")

        if room.player2_name is not None:
            raise RoomFullError(f"Room {room_code} is full")

        room.player2_name = player_name
        room.status = "active"
        room.last_activity = time.time()
        logger.info(f"Player {player_name} joined room {room_code}")
        return room

    def remove_room(self, room_code: str):
        """Remove a room from the registry."""
        room = self._rooms.pop(room_code, None)
        if room:
            room.cancel_tasks()
            logger.info(f"Room {room_code} removed")

    async def handle_websocket(self, websocket: WebSocket, room_code: str):
        """
        Main WebSocket handler for the collaborative mode.
        Handles the full lifecycle of a player's connection.

        Args:
            websocket: The WebSocket connection
            room_code: The room code from the URL path
        """
        await websocket.accept()

        # Check if room_code is "new" - meaning create a new room
        # Otherwise, this is a join attempt
        room = self.get_room(room_code)

        # Wait for the join message from the client
        try:
            data = await websocket.receive_json()
        except WebSocketDisconnect:
            return
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": "Invalid message format"
            })
            await websocket.close()
            return

        msg_type = data.get("type")
        player_name = data.get("player_name", "Player")

        if msg_type == "create":
            # Player 1 creates a new room
            new_room_code = self.create_room(player_name)
            room = self._rooms[new_room_code]
            room.player1_ws = websocket
            room.player1_connected = True
            await websocket.send_json({
                "type": "room_created",
                "room_code": new_room_code,
                "player_number": 1,
                "player_name": player_name,
            })
            # Wait for P2 or handle messages
            await self._player_loop(websocket, room, player_number=1)

        elif msg_type == "join":
            # Player joining an existing room
            join_room_code = data.get("room_code", room_code)
            try:
                room = self.join_room(join_room_code, player_name)
            except RoomNotFoundError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Room not found. Check the code and try again!"
                })
                await websocket.close()
                return
            except RoomExpiredError:
                await websocket.send_json({
                    "type": "error",
                    "message": "The invite code expired. Ask your friend for a new one!"
                })
                await websocket.close()
                return
            except RoomFullError:
                await websocket.send_json({
                    "type": "error",
                    "message": "This room already has two players!"
                })
                await websocket.close()
                return

            room.player2_ws = websocket
            room.player2_connected = True

            # Notify both players
            await websocket.send_json({
                "type": "player_joined",
                "player_name": player_name,
                "player_number": 2,
                "other_player_name": room.player1_name,
            })

            if room.player1_ws:
                try:
                    await room.player1_ws.send_json({
                        "type": "player_joined",
                        "player_name": player_name,
                        "player_number": 2,
                    })
                except Exception:
                    pass

            # Send initial scene start to both players
            await self._broadcast_scene_start(room)

            # Start turn timeout
            self._start_turn_timeout(room)

            # Enter the message loop
            await self._player_loop(websocket, room, player_number=2)

        else:
            await websocket.send_json({
                "type": "error",
                "message": "Unknown message type. Send 'create' or 'join'."
            })
            await websocket.close()

    async def _player_loop(self, websocket: WebSocket, room: CollabRoom, player_number: int):
        """
        Main message loop for a connected player.
        Handles incoming messages and disconnect events.
        """
        try:
            while True:
                data = await websocket.receive_json()
                await self._handle_message(data, room, player_number)
        except WebSocketDisconnect:
            await self._handle_player_disconnect(room, player_number)
        except Exception as e:
            logger.error(f"WebSocket error in room {room.room_code}: {e}")
            await self._handle_player_disconnect(room, player_number)

    async def _handle_message(self, data: dict, room: CollabRoom, player_number: int):
        """Process an incoming message from a player."""
        msg_type = data.get("type")

        if msg_type == "select_answer":
            await self._handle_answer(data, room, player_number)
        elif msg_type == "ping":
            # Heartbeat - update activity
            room.last_activity = time.time()
        else:
            logger.warning(f"Unknown message type '{msg_type}' in room {room.room_code}")

    async def _handle_answer(self, data: dict, room: CollabRoom, player_number: int):
        """Handle an answer selection from the active player."""
        # Only the active player can answer
        if room.active_player != player_number:
            ws = room.player1_ws if player_number == 1 else room.player2_ws
            if ws:
                try:
                    await ws.send_json({
                        "type": "error",
                        "message": "It's not your turn!"
                    })
                except Exception:
                    pass
            return

        # Validate scene number
        scene_number = data.get("scene_number")
        if scene_number != room.current_scene:
            return

        option_id = data.get("option_id")
        is_correct = data.get("is_correct", False)

        # Cancel turn timeout
        if room._turn_timeout_task and not room._turn_timeout_task.done():
            room._turn_timeout_task.cancel()

        # Award coin if correct
        coins = room.shared_coins
        if is_correct:
            coins = room.add_coin()

        # Broadcast answer selected to both players
        answer_msg = {
            "type": "answer_selected",
            "scene_number": scene_number,
            "option_id": option_id,
            "is_correct": is_correct,
            "coins": coins,
        }
        await self._broadcast(room, answer_msg)

        # Advance scene
        if is_correct:
            new_scene = room.advance_scene()

            if room.current_scene > TOTAL_SCENES:
                # Quest complete
                room.status = "completed"
                complete_msg = {
                    "type": "quest_complete",
                    "total_coins": room.shared_coins,
                }
                await self._broadcast(room, complete_msg)
                room.cancel_tasks()
            else:
                # Send turn change and new scene start
                turn_change_msg = {
                    "type": "turn_change",
                    "scene_number": room.current_scene,
                    "active_player": room.active_player,
                }
                await self._broadcast(room, turn_change_msg)
                await self._broadcast_scene_start(room)
                self._start_turn_timeout(room)

        room.last_activity = time.time()

    async def _broadcast_scene_start(self, room: CollabRoom):
        """Broadcast scene start to both players."""
        msg = {
            "type": "scene_start",
            "scene_number": room.current_scene,
            "active_player": room.active_player,
        }
        await self._broadcast(room, msg)

    async def _broadcast(self, room: CollabRoom, message: dict):
        """Send a message to all connected players in the room."""
        for ws in [room.player1_ws, room.player2_ws]:
            if ws:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    def _start_turn_timeout(self, room: CollabRoom):
        """Start a 60-second turn timeout. Sends reminder if no answer."""
        if room._turn_timeout_task and not room._turn_timeout_task.done():
            room._turn_timeout_task.cancel()

        async def _timeout_handler():
            try:
                await asyncio.sleep(TURN_TIMEOUT_SECONDS)
                # Send reminder to active player
                active_ws = (
                    room.player1_ws if room.active_player == 1
                    else room.player2_ws
                )
                if active_ws:
                    try:
                        await active_ws.send_json({
                            "type": "turn_reminder",
                            "message": "It's your turn! Pick an answer to continue the story.",
                            "scene_number": room.current_scene,
                        })
                    except Exception:
                        pass
            except asyncio.CancelledError:
                pass

        room._turn_timeout_task = asyncio.create_task(_timeout_handler())

    async def _handle_player_disconnect(self, room: CollabRoom, player_number: int):
        """Handle a player disconnection. Waits 30s then notifies and enables solo."""
        if player_number == 1:
            room.player1_connected = False
            room.player1_disconnect_time = time.time()
            room.player1_ws = None
        else:
            room.player2_connected = False
            room.player2_disconnect_time = time.time()
            room.player2_ws = None

        logger.info(f"Player {player_number} disconnected from room {room.room_code}")

        # If room is already completed or solo, no need for disconnect handling
        if room.status in ("completed", "solo"):
            return

        # Start disconnect monitoring
        async def _disconnect_monitor():
            try:
                await asyncio.sleep(DISCONNECT_TIMEOUT_SECONDS)

                # Check if player reconnected during the wait
                if player_number == 1 and room.player1_connected:
                    return
                if player_number == 2 and room.player2_connected:
                    return

                # Player still offline after 30s - notify other player and enable solo
                room.status = "solo"
                other_ws = (
                    room.player2_ws if player_number == 1
                    else room.player1_ws
                )
                if other_ws:
                    try:
                        await other_ws.send_json({
                            "type": "disconnect_notice",
                            "player_number": player_number,
                            "message": "Your friend had to go. You can finish the adventure on your own!",
                        })
                    except Exception:
                        pass

                logger.info(
                    f"Room {room.room_code} switched to solo mode "
                    f"after player {player_number} disconnected for >30s"
                )
            except asyncio.CancelledError:
                pass

        # Cancel any existing disconnect task
        if room._disconnect_task and not room._disconnect_task.done():
            room._disconnect_task.cancel()
        room._disconnect_task = asyncio.create_task(_disconnect_monitor())

    async def handle_reconnect(self, websocket: WebSocket, room: CollabRoom, player_number: int, player_name: str):
        """
        Handle a player reconnecting to an existing room.

        Args:
            websocket: The new WebSocket connection
            room: The existing room
            player_number: Which player is reconnecting (1 or 2)
            player_name: Player's name
        """
        if player_number == 1:
            room.player1_ws = websocket
            room.player1_connected = True
            room.player1_disconnect_time = None
        else:
            room.player2_ws = websocket
            room.player2_connected = True
            room.player2_disconnect_time = None

        # Cancel disconnect monitoring if active
        if room._disconnect_task and not room._disconnect_task.done():
            room._disconnect_task.cancel()

        # Send current state to the reconnecting player
        await websocket.send_json({
            "type": "reconnected",
            "room_code": room.room_code,
            "player_number": player_number,
            "current_scene": room.current_scene,
            "active_player": room.active_player,
            "shared_coins": room.shared_coins,
            "status": room.status,
        })

        # Notify other player of reconnection
        other_ws = room.player2_ws if player_number == 1 else room.player1_ws
        if other_ws:
            try:
                await other_ws.send_json({
                    "type": "player_reconnected",
                    "player_number": player_number,
                    "player_name": player_name,
                })
            except Exception:
                pass

        # If room was in solo mode, switch back to active
        if room.status == "solo":
            room.status = "active"

        logger.info(f"Player {player_number} reconnected to room {room.room_code}")


# Singleton instance for the application
collab_manager = CollabManager()
