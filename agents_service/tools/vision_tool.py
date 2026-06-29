"""
Vision Tool
Wrapper for Amazon Bedrock Claude Vision API to analyze images.
"""

import os
import json
from typing import Dict, Any


def analyze_drawing(image_uri: str) -> Dict[str, Any]:
    """
    Analyzes a child's drawing using Amazon Bedrock Claude Vision.
    Returns structured data about characters, setting, and style.
    """
    try:
        import boto3

        # Download image from storage
        from .storage_tool import download_from_storage
        image_data = download_from_storage(image_uri)

        # Initialize Bedrock client
        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )

        model_id = os.getenv(
            "BEDROCK_VISION_MODEL",
            "anthropic.claude-3-5-sonnet-20241022-v2:0",
        )

        # Create prompt for analysis
        prompt = """
        Analyze this child's drawing and extract the following information in JSON format:

        {
            "character_type": "what type of character is drawn (e.g., person, animal, creature)",
            "character_description": "detailed description of the character's appearance (max 500 chars)",
            "colors_used": ["list of main colors (max 10)"],
            "artistic_style": "description of drawing style (e.g., crayon, pencil, marker)",
            "mood": "overall mood/feeling of the drawing",
            "age_appropriate": true/false,
            "details": "any other notable details"
        }

        Be creative and encouraging in your descriptions. This is for generating a cute animated character.
        Return ONLY the JSON object, no other text.
        """

        import base64
        b64_image = base64.b64encode(image_data).decode("utf-8")

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": b64_image,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        })

        # Generate response with retry logic for rate limits
        max_retries = 3
        retry_delay = 2  # seconds

        for attempt in range(max_retries):
            try:
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
                        print(f"[Vision Tool] Rate limit hit, waiting {wait_time}s before retry {attempt + 1}/{max_retries}...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise Exception(f"Rate limit exceeded after {max_retries} attempts. Please wait and try again.")
                else:
                    raise

        # Parse response
        response_body = json.loads(response["body"].read())
        result_text = response_body["content"][0]["text"].strip()

        # Extract JSON from markdown code blocks if present
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()

        result = json.loads(result_text)
        return result

    except Exception as e:
        raise Exception(f"Failed to analyze drawing: {str(e)}")


def create_character_prompt(analysis: Dict[str, Any]) -> str:
    """
    Creates an image generation prompt based on vision analysis.
    Returns optimized prompt for character generation.
    """
    character_type = analysis.get("character_type", "character")
    description = analysis.get("character_description", "")
    colors = ", ".join(analysis.get("colors_used", []))
    style = analysis.get("artistic_style", "cartoon")

    prompt = f"""
    Create a cute, friendly, animated {character_type} character for a children's story.

    Character details: {description}

    Style: Pixar-style 3D animation, colorful, child-friendly, expressive, appealing
    Colors: Incorporate {colors}
    Mood: Warm, inviting, magical

    The character should be:
    - Appropriate for children ages 4-8
    - Expressive and friendly
    - High quality, professional animation style
    - Standing in a neutral pose
    - On a simple, clean background

    Art style: Similar to Disney/Pixar animated films, vibrant colors, soft lighting
    """

    return prompt.strip()
