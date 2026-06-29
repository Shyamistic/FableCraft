"""
Environment variable configuration for the backend service.
Configures model IDs, AWS region, OpenRouter API key, and timeouts.
"""

import os
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    # AWS Configuration
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    s3_bucket_name: str = os.getenv("S3_BUCKET_NAME", "fablecraft-assets")
    cloudfront_domain: Optional[str] = os.getenv("CLOUDFRONT_DOMAIN", None)
    dynamodb_table_name: str = os.getenv("DYNAMODB_TABLE_NAME", "fablecraft-data")

    # Amazon Bedrock Model IDs (per task type)
    bedrock_vision_model: str = os.getenv(
        "BEDROCK_VISION_MODEL", "anthropic.claude-3-5-sonnet-20241022-v2:0"
    )
    bedrock_quest_model: str = os.getenv(
        "BEDROCK_QUEST_MODEL", "anthropic.claude-3-5-sonnet-20241022-v2:0"
    )
    bedrock_moderation_model: str = os.getenv(
        "BEDROCK_MODERATION_MODEL", "anthropic.claude-3-5-sonnet-20241022-v2:0"
    )
    bedrock_image_model: str = os.getenv(
        "BEDROCK_IMAGE_MODEL", "stability.stable-diffusion-xl-v1"
    )

    # Amazon Nova Model IDs (us-east-1)
    # Request access at: Bedrock console → Model access → Amazon Nova
    nova_vision_model: str = os.getenv(
        "NOVA_VISION_MODEL", "amazon.nova-pro-v1:0"
    )
    nova_canvas_model: str = os.getenv(
        "NOVA_CANVAS_MODEL", "amazon.nova-canvas-v1:0"
    )
    nova_reel_model: str = os.getenv(
        "NOVA_REEL_MODEL", "amazon.nova-reel-v1:0"
    )
    # Enable Nova features (requires model access granted in Bedrock console)
    nova_canvas_enabled: bool = os.getenv("NOVA_CANVAS_ENABLED", "false").lower() == "true"
    nova_reel_enabled: bool = os.getenv("NOVA_REEL_ENABLED", "false").lower() == "true"
    # Nova Reel: output S3 bucket for async video jobs (must be in us-east-1)
    nova_reel_output_bucket: str = os.getenv("NOVA_REEL_OUTPUT_BUCKET", "")

    # Image generation provider selection and fallback.
    # Order is controlled by image_provider: "auto" tries clipdrop then gemini then bedrock then pollinations.
    # Valid values: "auto", "clipdrop", "gemini", "bedrock", "pollinations", "placeholder"
    image_provider: str = os.getenv("IMAGE_PROVIDER", "auto")
    clipdrop_api_key: str = os.getenv("CLIPDROP_API_KEY", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_image_model: str = os.getenv(
        "GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"
    )
    pollinations_token: str = os.getenv("POLLINATIONS_TOKEN", "")
    pollinations_base_url: str = os.getenv(
        "POLLINATIONS_BASE_URL", "https://image.pollinations.ai/prompt/"
    )
    pollinations_model: str = os.getenv("POLLINATIONS_MODEL", "flux")

    # OpenRouter Fallback Model IDs (per task type)
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    )
    openrouter_vision_model: str = os.getenv(
        "OPENROUTER_VISION_MODEL", "anthropic/claude-3.5-sonnet"
    )
    openrouter_quest_model: str = os.getenv(
        "OPENROUTER_QUEST_MODEL", "anthropic/claude-3.5-sonnet"
    )
    openrouter_moderation_model: str = os.getenv(
        "OPENROUTER_MODERATION_MODEL", "anthropic/claude-3.5-sonnet"
    )

    # Timeouts (milliseconds)
    bedrock_timeout_ms: int = int(os.getenv("BEDROCK_TIMEOUT_MS", "15000"))
    openrouter_timeout_ms: int = int(os.getenv("OPENROUTER_TIMEOUT_MS", "15000"))
    image_generation_timeout_ms: int = int(
        os.getenv("IMAGE_GENERATION_TIMEOUT_MS", "30000")
    )
    tts_timeout_ms: int = int(os.getenv("TTS_TIMEOUT_MS", "10000"))

    # Retry Configuration
    max_retries: int = int(os.getenv("MAX_RETRIES", "3"))
    retry_base_delay_ms: int = int(os.getenv("RETRY_BASE_DELAY_MS", "1000"))

    # Amazon Polly Configuration
    polly_voice_id: str = os.getenv("POLLY_VOICE_ID", "Ruth")
    polly_engine: str = os.getenv("POLLY_ENGINE", "neural")
    polly_speaking_rate: str = os.getenv("POLLY_SPEAKING_RATE", "90%")

    # S3 URL Configuration
    presigned_url_expiry_seconds: int = int(
        os.getenv("PRESIGNED_URL_EXPIRY_SECONDS", "3600")
    )
    cache_control_max_age: int = int(os.getenv("CACHE_CONTROL_MAX_AGE", "3600"))

    # Parent Dashboard
    parent_pin: str = os.getenv("PARENT_PIN", "1234")

    # Application
    app_name: str = os.getenv("APP_NAME", "fablecraft")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    port: int = int(os.getenv("PORT", "8080"))


# Singleton instance
settings = Settings()
