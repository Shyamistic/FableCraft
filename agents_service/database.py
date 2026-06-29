"""
DynamoDB Database Layer for Fablecraft.
Uses single-table design for all entities: Users, Characters, Quests, Progress.

Table: fablecraft-data
PK/SK patterns:
  - USER#<user_id>        / PROFILE          → User profile
  - USER#<user_id>        / CHAR#<char_id>   → Character record
  - USER#<user_id>        / QUEST#<quest_id> → Quest record
  - USER#<user_id>        / PROGRESS         → Progress/gamification data
  - USER#<user_id>        / SESSION#<sess_id>→ Session data
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Table name from env or default
TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "fablecraft-data")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def _get_table():
    """Get DynamoDB table resource."""
    dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
    return dynamodb.Table(TABLE_NAME)


def _now_iso() -> str:
    """Return current UTC time as ISO string."""
    return datetime.now(timezone.utc).isoformat()


# ─── Table Creation (for setup) ───


def create_table_if_not_exists():
    """Create the DynamoDB table if it doesn't exist. Idempotent."""
    client = boto3.client("dynamodb", region_name=AWS_REGION)
    try:
        client.describe_table(TableName=TABLE_NAME)
        logger.info(f"DynamoDB table '{TABLE_NAME}' already exists")
    except client.exceptions.ResourceNotFoundException:
        logger.info(f"Creating DynamoDB table '{TABLE_NAME}'...")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        waiter = client.get_waiter("table_exists")
        waiter.wait(TableName=TABLE_NAME)
        logger.info(f"DynamoDB table '{TABLE_NAME}' created successfully")


# ─── User Operations ───


def create_user(display_name: str = "Explorer") -> Dict[str, Any]:
    """Create a new anonymous user and return user data."""
    table = _get_table()
    user_id = str(uuid.uuid4())
    now = _now_iso()

    item = {
        "PK": f"USER#{user_id}",
        "SK": "PROFILE",
        "user_id": user_id,
        "display_name": display_name,
        "created_at": now,
        "updated_at": now,
        "entity_type": "USER",
    }
    table.put_item(Item=item)
    logger.info(f"Created user: {user_id}")
    return item


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user profile by ID."""
    table = _get_table()
    try:
        response = table.get_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROFILE"}
        )
        return response.get("Item")
    except ClientError as e:
        logger.error(f"Error getting user {user_id}: {e}")
        return None


# ─── Progress Operations ───


def get_or_create_progress(user_id: str) -> Dict[str, Any]:
    """Get user progress, creating default if not found."""
    table = _get_table()
    try:
        response = table.get_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROGRESS"}
        )
        item = response.get("Item")
        if item:
            return item
    except ClientError as e:
        logger.error(f"Error getting progress for {user_id}: {e}")

    # Create default progress
    now = _now_iso()
    item = {
        "PK": f"USER#{user_id}",
        "SK": "PROGRESS",
        "user_id": user_id,
        "xp": 0,
        "level": 1,
        "coins": 0,
        "quests_completed": 0,
        "characters_created": 0,
        "lessons_covered": [],
        "achievements": [],
        "streak_days": 0,
        "last_active": now,
        "created_at": now,
        "updated_at": now,
        "entity_type": "PROGRESS",
    }
    table.put_item(Item=item)
    return item


def update_progress_after_character(user_id: str) -> Dict[str, Any]:
    """Increment characters_created count and add XP."""
    table = _get_table()
    now = _now_iso()
    try:
        response = table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROGRESS"},
            UpdateExpression=(
                "SET characters_created = if_not_exists(characters_created, :zero) + :one, "
                "xp = if_not_exists(xp, :zero) + :xp_gain, "
                "last_active = :now, updated_at = :now"
            ),
            ExpressionAttributeValues={
                ":zero": 0,
                ":one": 1,
                ":xp_gain": 10,
                ":now": now,
            },
            ReturnValues="ALL_NEW",
        )
        return response.get("Attributes", {})
    except ClientError as e:
        logger.error(f"Error updating progress after character: {e}")
        return {}


def update_progress_after_quest(user_id: str, lesson: str, coins_earned: int) -> Dict[str, Any]:
    """Update progress after completing a quest."""
    table = _get_table()
    now = _now_iso()
    try:
        # First get current lessons to avoid duplicates
        progress = get_or_create_progress(user_id)
        current_lessons = progress.get("lessons_covered", [])
        
        update_expr = (
            "SET quests_completed = if_not_exists(quests_completed, :zero) + :one, "
            "coins = if_not_exists(coins, :zero) + :coins, "
            "xp = if_not_exists(xp, :zero) + :xp_gain, "
            "last_active = :now, updated_at = :now"
        )
        expr_values = {
            ":zero": 0,
            ":one": 1,
            ":coins": coins_earned,
            ":xp_gain": 25,
            ":now": now,
        }

        # Add lesson if not already covered
        if lesson not in current_lessons:
            update_expr += ", lessons_covered = list_append(if_not_exists(lessons_covered, :empty_list), :new_lesson)"
            expr_values[":empty_list"] = []
            expr_values[":new_lesson"] = [lesson]

        response = table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROGRESS"},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        return response.get("Attributes", {})
    except ClientError as e:
        logger.error(f"Error updating progress after quest: {e}")
        return {}


# ─── Character Operations ───


def save_character(user_id: str, character_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save a generated character to the database."""
    table = _get_table()
    char_id = character_data.get("id", str(uuid.uuid4()))
    now = _now_iso()

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"CHAR#{char_id}",
        "user_id": user_id,
        "character_id": char_id,
        "name": character_data.get("name", ""),
        "character_type": character_data.get("character_type", ""),
        "character_description": character_data.get("character_description", ""),
        "colors_used": character_data.get("colors_used", []),
        "artistic_style": character_data.get("artistic_style", ""),
        "mood": character_data.get("mood", ""),
        "generated_image_url": character_data.get("generated_image_url", ""),
        "original_drawing_url": character_data.get("original_drawing_url", ""),
        "created_at": character_data.get("created_at", now),
        "entity_type": "CHARACTER",
    }
    table.put_item(Item=item)
    logger.info(f"Saved character {char_id} for user {user_id}")
    return item


def get_user_characters(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get all characters created by a user."""
    table = _get_table()
    try:
        response = table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":sk_prefix": "CHAR#",
            },
            ScanIndexForward=False,
            Limit=limit,
        )
        return response.get("Items", [])
    except ClientError as e:
        logger.error(f"Error getting characters for {user_id}: {e}")
        return []


# ─── Quest Operations ───


def save_quest(user_id: str, quest_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save a generated quest to the database."""
    table = _get_table()
    quest_id = quest_data.get("id", str(uuid.uuid4()))
    now = _now_iso()

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"QUEST#{quest_id}",
        "user_id": user_id,
        "quest_id": quest_id,
        "title": quest_data.get("title", ""),
        "lesson": quest_data.get("lesson", ""),
        "genre": quest_data.get("genre", ""),
        "character_name": quest_data.get("character_name", ""),
        "total_scenes": quest_data.get("total_scenes", 8),
        "completed": False,
        "coins_earned": 0,
        "created_at": now,
        "entity_type": "QUEST",
    }
    table.put_item(Item=item)
    logger.info(f"Saved quest {quest_id} for user {user_id}")
    return item


def complete_quest(user_id: str, quest_id: str, coins_earned: int) -> Dict[str, Any]:
    """Mark a quest as completed."""
    table = _get_table()
    now = _now_iso()
    try:
        response = table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": f"QUEST#{quest_id}"},
            UpdateExpression="SET completed = :true, coins_earned = :coins, completed_at = :now",
            ExpressionAttributeValues={
                ":true": True,
                ":coins": coins_earned,
                ":now": now,
            },
            ReturnValues="ALL_NEW",
        )
        return response.get("Attributes", {})
    except ClientError as e:
        logger.error(f"Error completing quest {quest_id}: {e}")
        return {}


def get_user_quests(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get all quests for a user."""
    table = _get_table()
    try:
        response = table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":sk_prefix": "QUEST#",
            },
            ScanIndexForward=False,
            Limit=limit,
        )
        return response.get("Items", [])
    except ClientError as e:
        logger.error(f"Error getting quests for {user_id}: {e}")
        return []


# ─── Session Operations ───


def save_session(user_id: str, session_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save or update session data."""
    table = _get_table()
    now = _now_iso()

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"SESSION#{session_id}",
        "user_id": user_id,
        "session_id": session_id,
        "current_character_id": session_data.get("current_character_id"),
        "current_quest_id": session_data.get("current_quest_id"),
        "started_at": session_data.get("started_at", now),
        "updated_at": now,
        "entity_type": "SESSION",
    }
    table.put_item(Item=item)
    return item
