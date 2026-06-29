"""Text-to-Speech Tool
Converts text to speech using Amazon Polly Neural voices.
"""

import os
from typing import Optional
from .storage_tool import upload_to_storage


def text_to_speech(text: str, voice_id: str = "Ruth") -> dict:
    """
    Convert text to speech using Amazon Polly Neural and return storage URI with duration.

    Args:
        text: Text to convert to speech
        voice_id: Polly voice ID to use (default: Ruth - child-friendly Neural voice)

    Returns:
        Dictionary with audio_uri and estimated_duration_seconds
    """
    try:
        import boto3

        polly = boto3.client("polly", region_name=os.getenv("AWS_REGION", "us-east-1"))

        # Synthesize speech with Polly Neural engine
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice_id,
            Engine="neural",
        )

        # Read audio stream
        audio_content = response["AudioStream"].read()

        # Upload audio to storage
        audio_uri = upload_to_storage(
            file_data=audio_content,
            filename="audio.mp3",
            content_type="audio/mpeg",
        )

        # Estimate duration: average speaking rate is ~150 words per minute for children's content
        word_count = len(text.split())
        estimated_duration = (word_count / 150) * 60  # Convert to seconds

        return {
            "audio_uri": audio_uri,
            "duration_seconds": estimated_duration,
            "word_count": word_count,
        }

    except Exception as e:
        raise Exception(f"Failed to generate speech: {str(e)}")


def generate_scene_audio(scene_text: str, option1_text: str, option2_text: str) -> dict:
    """
    Generate audio for a scene's story text and both options using Amazon Polly.

    Args:
        scene_text: Main story text for the scene
        option1_text: Text for first option
        option2_text: Text for second option

    Returns:
        Dictionary with audio URIs for each text element
    """
    try:
        # Use different Polly Neural voices for variety
        voices = ["Ruth", "Stephen", "Danielle"]

        result = {
            "scene_audio": text_to_speech(scene_text, voice_id=voices[0]),
            "option1_audio": text_to_speech(option1_text, voice_id=voices[1]),
            "option2_audio": text_to_speech(option2_text, voice_id=voices[2]),
        }

        return result

    except Exception as e:
        raise Exception(f"Failed to generate scene audio: {str(e)}")
