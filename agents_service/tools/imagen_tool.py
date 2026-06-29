"""
Image Generation Tool
Generates images for characters and story scenes using Amazon Bedrock (Titan/Stability).
"""

import os
import base64
import json
from typing import Optional
from .storage_tool import upload_to_storage


def generate_character_image(prompt: str, negative_prompt: Optional[str] = None) -> str:
    """
    Generates a character image using Amazon Bedrock image generation.
    Returns storage URI of generated image.
    """
    try:
        import boto3

        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )

        model_id = os.getenv("BEDROCK_IMAGE_MODEL", "stability.stable-diffusion-xl-v1")

        # Set default negative prompt for child-safe content
        if negative_prompt is None:
            negative_prompt = (
                "violence, weapons, fighting, blood, gore, death, killing, "
                "scary monsters, horror, adult content, sexual content, drugs, alcohol"
            )

        # Generate image with retry logic
        max_retries = 3
        retry_delay = 2

        for attempt in range(max_retries):
            try:
                body = json.dumps({
                    "text_prompts": [
                        {"text": prompt, "weight": 1.0},
                        {"text": negative_prompt, "weight": -1.0},
                    ],
                    "cfg_scale": 7,
                    "steps": 50,
                    "width": 512,
                    "height": 512,
                })

                response = bedrock.invoke_model(
                    modelId=model_id,
                    body=body,
                    contentType="application/json",
                    accept="application/json",
                )
                break  # Success
            except Exception as api_error:
                error_str = str(api_error)
                if "Throttling" in error_str or "TooManyRequests" in error_str:
                    if attempt < max_retries - 1:
                        import time
                        wait_time = retry_delay * (2 ** attempt)
                        print(f"[Image Tool] Rate limit hit, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise Exception(f"Rate limit exceeded after {max_retries} attempts. Please wait and try again.")
                else:
                    raise

        response_body = json.loads(response["body"].read())
        artifacts = response_body.get("artifacts", [])

        if not artifacts:
            raise Exception("Oops, try drawing a different type of character!")

        # Decode image from base64
        image_bytes = base64.b64decode(artifacts[0]["base64"])

        # Upload to storage
        image_uri = upload_to_storage(
            file_data=image_bytes,
            filename="character.png",
            content_type="image/png",
        )

        return image_uri

    except Exception as e:
        error_msg = str(e)
        if "Oops, try drawing a different type of character!" in error_msg:
            raise
        raise Exception("Oops, try drawing a different type of character!")


def generate_scene_image(
    prompt: str,
    character_description: Optional[str] = None,
    enforce_consistency: bool = False,
) -> str:
    """
    Generates a scene/setting image using Amazon Bedrock image generation.

    Args:
        prompt: Scene description
        character_description: Detailed character description for visual consistency
        enforce_consistency: If True, adds strict consistency requirements to prompt

    Returns:
        Storage URI of generated image
    """
    try:
        import boto3

        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )

        model_id = os.getenv("BEDROCK_IMAGE_MODEL", "stability.stable-diffusion-xl-v1")

        # Enhance prompt with character if provided
        if character_description:
            full_prompt = f"{prompt}\n\nInclude this character: {character_description}"
        else:
            full_prompt = prompt

        if enforce_consistency and character_description:
            full_prompt = f"""{full_prompt}

CRITICAL CHARACTER CONSISTENCY REQUIREMENTS:
- The character MUST maintain EXACT visual consistency with the description
- Keep the SAME colors, proportions, features, and style as described
- The character should be instantly recognizable as the same character
- Maintain consistent: body shape, facial features, color palette, clothing/markings
"""

        negative_prompt = (
            "violence, weapons, fighting, blood, gore, death, killing, "
            "scary monsters, horror, adult content, character inconsistency, "
            "different character, morphing"
        )

        # Generate image with retry logic
        max_retries = 3
        retry_delay = 2

        for attempt in range(max_retries):
            try:
                body = json.dumps({
                    "text_prompts": [
                        {"text": full_prompt, "weight": 1.0},
                        {"text": negative_prompt, "weight": -1.0},
                    ],
                    "cfg_scale": 7,
                    "steps": 50,
                    "width": 1344,
                    "height": 768,
                })

                response = bedrock.invoke_model(
                    modelId=model_id,
                    body=body,
                    contentType="application/json",
                    accept="application/json",
                )

                response_body = json.loads(response["body"].read())
                artifacts = response_body.get("artifacts", [])

                if not artifacts:
                    raise Exception("Image generation returned no results. Safety filters may have blocked the content.")

                break  # Success
            except Exception as api_error:
                error_str = str(api_error)
                if "Throttling" in error_str or "TooManyRequests" in error_str:
                    if attempt < max_retries - 1:
                        import time
                        wait_time = retry_delay * (2 ** attempt)
                        print(f"[Image Tool] Rate limit hit, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise Exception(f"Rate limit exceeded after {max_retries} attempts. Please wait and try again.")
                else:
                    raise

        image_bytes = base64.b64decode(artifacts[0]["base64"])

        # Upload to storage
        image_uri = upload_to_storage(
            file_data=image_bytes,
            filename="scene.png",
            content_type="image/png",
        )

        return image_uri

    except Exception as e:
        raise Exception(f"Failed to generate scene image: {str(e)}")
