"""
Unit tests for the LLM Router service.
Tests fallback logic, retry behavior, logging, and error handling.
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest
import httpx
from botocore.exceptions import ClientError, BotoCoreError, ReadTimeoutError

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from llm_router import LLMRouter, LLMRouterError, get_router


@pytest.fixture
def router():
    """Create a fresh LLMRouter instance for each test."""
    with patch("llm_router.settings") as mock_settings:
        mock_settings.aws_region = "us-east-1"
        mock_settings.bedrock_vision_model = "anthropic.claude-3-5-sonnet-20241022-v2:0"
        mock_settings.bedrock_quest_model = "anthropic.claude-3-5-sonnet-20241022-v2:0"
        mock_settings.bedrock_moderation_model = "anthropic.claude-3-5-sonnet-20241022-v2:0"
        mock_settings.openrouter_vision_model = "anthropic/claude-3.5-sonnet"
        mock_settings.openrouter_quest_model = "anthropic/claude-3.5-sonnet"
        mock_settings.openrouter_moderation_model = "anthropic/claude-3.5-sonnet"
        mock_settings.openrouter_api_key = "test-api-key"
        mock_settings.openrouter_base_url = "https://openrouter.ai/api/v1"
        mock_settings.bedrock_timeout_ms = 15000
        mock_settings.openrouter_timeout_ms = 15000
        mock_settings.max_retries = 3
        mock_settings.retry_base_delay_ms = 100  # Short for tests
        r = LLMRouter()
        yield r


class TestBedrockPrimary:
    """Tests for Bedrock as the primary provider."""

    @pytest.mark.asyncio
    async def test_bedrock_success_returns_content(self, router):
        """When Bedrock succeeds, return content with provider='bedrock'."""
        mock_response = {
            "output": {
                "message": {
                    "content": [{"text": "Analysis result"}]
                }
            }
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.vision_analysis("Analyze this drawing")

        assert result["content"] == "Analysis result"
        assert result["provider"] == "bedrock"
        assert "latency_ms" in result
        assert isinstance(result["latency_ms"], int)

    @pytest.mark.asyncio
    async def test_bedrock_success_for_quest_generation(self, router):
        """Quest generation routes through Bedrock correctly."""
        mock_response = {
            "output": {
                "message": {
                    "content": [{"text": '{"scenes": []}'}]
                }
            }
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.quest_generation("Generate a quest about sharing")

        assert result["content"] == '{"scenes": []}'
        assert result["provider"] == "bedrock"

    @pytest.mark.asyncio
    async def test_bedrock_success_for_content_moderation(self, router):
        """Content moderation routes through Bedrock correctly."""
        mock_response = {
            "output": {
                "message": {
                    "content": [{"text": '{"is_appropriate": true}'}]
                }
            }
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.content_moderation("Check this text for safety")

        assert result["content"] == '{"is_appropriate": true}'
        assert result["provider"] == "bedrock"

    @pytest.mark.asyncio
    async def test_bedrock_with_image_data(self, router):
        """Bedrock handles vision requests with image data."""
        import base64

        test_image = base64.b64encode(b"fake-image-data").decode()
        mock_response = {
            "output": {
                "message": {
                    "content": [{"text": "I see a bunny"}]
                }
            }
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.vision_analysis(
            "What do you see?", image_data=test_image
        )

        assert result["content"] == "I see a bunny"
        # Verify image was included in the call
        call_kwargs = mock_client.converse.call_args[1]
        messages = call_kwargs["messages"]
        assert len(messages[0]["content"]) == 2  # image + text

    @pytest.mark.asyncio
    async def test_bedrock_with_system_prompt(self, router):
        """Bedrock includes system prompt when provided."""
        mock_response = {
            "output": {
                "message": {
                    "content": [{"text": "Moderated content"}]
                }
            }
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.content_moderation(
            "Check this", system_prompt="You are a content moderator"
        )

        call_kwargs = mock_client.converse.call_args[1]
        assert "system" in call_kwargs
        assert call_kwargs["system"] == [{"text": "You are a content moderator"}]


class TestOpenRouterFallback:
    """Tests for OpenRouter fallback when Bedrock fails."""

    @pytest.mark.asyncio
    async def test_fallback_on_bedrock_client_error(self, router):
        """When Bedrock raises ClientError, falls back to OpenRouter."""
        mock_client = MagicMock()
        mock_client.converse.side_effect = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "Converse",
        )
        router._bedrock_client = mock_client

        # Mock OpenRouter response
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "OpenRouter result"}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        result = await router.vision_analysis("Analyze this")

        assert result["content"] == "OpenRouter result"
        assert result["provider"] == "openrouter"

    @pytest.mark.asyncio
    async def test_fallback_on_bedrock_timeout(self, router):
        """When Bedrock times out, falls back to OpenRouter."""
        # Override timeout to be very short for test
        router.settings.bedrock_timeout_ms = 10  # 10ms timeout
        router.settings.max_retries = 1  # Don't retry on timeout

        mock_client = MagicMock()
        # Simulate a slow response that will exceed timeout
        def slow_converse(**kwargs):
            time.sleep(0.1)  # 100ms - will exceed 10ms timeout
            return {"output": {"message": {"content": [{"text": "late"}]}}}

        mock_client.converse.side_effect = slow_converse
        router._bedrock_client = mock_client

        # Mock OpenRouter response
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "OpenRouter fallback"}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        result = await router.quest_generation("Generate quest")

        assert result["provider"] == "openrouter"
        assert result["content"] == "OpenRouter fallback"

    @pytest.mark.asyncio
    async def test_fallback_on_bedrock_connection_error(self, router):
        """When Bedrock has connection failure, falls back to OpenRouter."""
        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = BotoCoreError()
        router._bedrock_client = mock_client

        # Mock OpenRouter response
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback works"}}]
        }

        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        result = await router.content_moderation("Moderate this")

        assert result["provider"] == "openrouter"
        assert result["content"] == "Fallback works"


class TestBothProvidersFail:
    """Tests for when both Bedrock and OpenRouter fail."""

    @pytest.mark.asyncio
    async def test_raises_error_with_both_failures(self, router):
        """When both providers fail, raises LLMRouterError with both reasons."""
        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = ClientError(
            {"Error": {"Code": "ServiceUnavailable", "Message": "Service down"}},
            "Converse",
        )
        router._bedrock_client = mock_client

        # Mock OpenRouter failure
        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = httpx.ConnectError("Connection refused")
        router._http_client = mock_http_client

        with pytest.raises(LLMRouterError) as exc_info:
            await router.vision_analysis("Analyze this")

        error = exc_info.value
        assert "bedrock" in str(error).lower() or error.bedrock_error is not None
        assert "openrouter" in str(error).lower() or error.openrouter_error is not None
        assert error.bedrock_error is not None
        assert error.openrouter_error is not None

    @pytest.mark.asyncio
    async def test_error_includes_provider_names(self, router):
        """Error message includes both provider names."""
        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = Exception("Bedrock exploded")
        router._bedrock_client = mock_client

        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = Exception("OpenRouter exploded")
        router._http_client = mock_http_client

        with pytest.raises(LLMRouterError) as exc_info:
            await router.quest_generation("Generate quest")

        error_msg = str(exc_info.value)
        assert "Bedrock" in error_msg
        assert "OpenRouter" in error_msg

    @pytest.mark.asyncio
    async def test_error_includes_failure_reasons(self, router):
        """Error includes specific failure reasons from each provider."""
        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = Exception("Model not found")
        router._bedrock_client = mock_client

        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = Exception("API key invalid")
        router._http_client = mock_http_client

        with pytest.raises(LLMRouterError) as exc_info:
            await router.content_moderation("Check safety")

        error = exc_info.value
        assert "Model not found" in error.bedrock_error
        assert "API key invalid" in error.openrouter_error


class TestExponentialBackoffRetry:
    """Tests for exponential backoff retry on AWS service errors."""

    @pytest.mark.asyncio
    async def test_retries_on_throttling_error(self, router):
        """Retries up to max_retries on throttling errors."""
        call_count = 0

        def converse_with_throttle(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ClientError(
                    {"Error": {"Code": "ThrottlingException", "Message": "Slow down"}},
                    "Converse",
                )
            return {"output": {"message": {"content": [{"text": "Success after retry"}]}}}

        mock_client = MagicMock()
        mock_client.converse.side_effect = converse_with_throttle
        router._bedrock_client = mock_client

        result = await router.vision_analysis("Analyze")

        assert result["content"] == "Success after retry"
        assert result["provider"] == "bedrock"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retries_with_exponential_delay(self, router):
        """Verifies delays increase exponentially between retries."""
        delays = []
        original_sleep = asyncio.sleep

        async def mock_sleep(seconds):
            delays.append(seconds)

        mock_client = MagicMock()
        mock_client.converse.side_effect = ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate limit"}},
            "Converse",
        )
        router._bedrock_client = mock_client

        # Mock OpenRouter to succeed (so test doesn't fail on both providers)
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        with patch("llm_router.asyncio.sleep", side_effect=mock_sleep):
            await router.quest_generation("Generate quest")

        # With base_delay=100ms and 3 retries, expect 2 delays:
        # attempt 0 fails -> delay 0.1 * 2^0 = 0.1s
        # attempt 1 fails -> delay 0.1 * 2^1 = 0.2s
        # attempt 2 fails -> no more delay, falls through
        assert len(delays) == 2
        assert delays[0] == pytest.approx(0.1, abs=0.01)
        assert delays[1] == pytest.approx(0.2, abs=0.01)

    @pytest.mark.asyncio
    async def test_max_retries_exhausted_falls_to_openrouter(self, router):
        """After max retries exhausted, falls back to OpenRouter."""
        call_count = 0

        def converse_always_fail(**kwargs):
            nonlocal call_count
            call_count += 1
            raise ClientError(
                {"Error": {"Code": "ServiceUnavailableException", "Message": "Down"}},
                "Converse",
            )

        mock_client = MagicMock()
        mock_client.converse.side_effect = converse_always_fail
        router._bedrock_client = mock_client

        # Mock OpenRouter success
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Recovered via OpenRouter"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        # Patch sleep to avoid actual delays
        async def no_sleep(seconds):
            pass

        with patch("llm_router.asyncio.sleep", side_effect=no_sleep):
            result = await router.vision_analysis("Analyze")

        assert result["provider"] == "openrouter"
        assert result["content"] == "Recovered via OpenRouter"
        # Should have tried 3 times (max_retries=3)
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_non_retryable_error_breaks_immediately(self, router):
        """Non-AWS errors (e.g. ValueError) don't trigger retries."""
        mock_client = MagicMock()
        mock_client.converse.side_effect = ValueError("Invalid model format")
        router._bedrock_client = mock_client

        # Mock OpenRouter success
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        result = await router.quest_generation("Quest")

        # Should only try Bedrock once since ValueError is not retryable
        assert mock_client.converse.call_count == 1
        assert result["provider"] == "openrouter"


class TestRequestLogging:
    """Tests for request logging with provider, task type, status, and latency."""

    @pytest.mark.asyncio
    async def test_logs_successful_bedrock_request(self, router, caplog):
        """Logs provider=bedrock, task type, status=success, and latency_ms."""
        import logging

        mock_response = {
            "output": {"message": {"content": [{"text": "Result"}]}}
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        with caplog.at_level(logging.INFO, logger="llm_router"):
            await router.vision_analysis("Test")

        assert any(
            "provider=bedrock" in record.message
            and "task=vision" in record.message
            and "status=success" in record.message
            and "latency_ms=" in record.message
            for record in caplog.records
        )

    @pytest.mark.asyncio
    async def test_logs_failed_bedrock_and_successful_openrouter(self, router, caplog):
        """Logs both the failed Bedrock and successful OpenRouter."""
        import logging

        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = Exception("Bedrock down")
        router._bedrock_client = mock_client

        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        with caplog.at_level(logging.INFO, logger="llm_router"):
            await router.quest_generation("Quest")

        log_messages = [r.message for r in caplog.records]
        # Should have bedrock error log and openrouter success log
        assert any("provider=bedrock" in m and "status=error" in m for m in log_messages)
        assert any(
            "provider=openrouter" in m and "status=success" in m for m in log_messages
        )

    @pytest.mark.asyncio
    async def test_logs_both_failures(self, router, caplog):
        """Logs both providers with status=error when both fail."""
        import logging

        router.settings.max_retries = 1

        mock_client = MagicMock()
        mock_client.converse.side_effect = Exception("Bedrock error")
        router._bedrock_client = mock_client

        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = Exception("OpenRouter error")
        router._http_client = mock_http_client

        with caplog.at_level(logging.INFO, logger="llm_router"):
            with pytest.raises(LLMRouterError):
                await router.content_moderation("Moderate")

        log_messages = [r.message for r in caplog.records]
        assert any("provider=bedrock" in m and "status=error" in m for m in log_messages)
        assert any(
            "provider=openrouter" in m and "status=error" in m for m in log_messages
        )

    @pytest.mark.asyncio
    async def test_latency_is_positive_integer(self, router):
        """Latency in response is a positive integer in milliseconds."""
        mock_response = {
            "output": {"message": {"content": [{"text": "Result"}]}}
        }
        mock_client = MagicMock()
        mock_client.converse.return_value = mock_response
        router._bedrock_client = mock_client

        result = await router.vision_analysis("Test")

        assert result["latency_ms"] >= 0
        assert isinstance(result["latency_ms"], int)


class TestModelSelection:
    """Tests for model ID selection per task type."""

    def test_bedrock_model_selection_vision(self, router):
        """Returns correct Bedrock model for vision task."""
        model = router._get_bedrock_model("vision")
        assert model == "anthropic.claude-3-5-sonnet-20241022-v2:0"

    def test_bedrock_model_selection_quest(self, router):
        """Returns correct Bedrock model for quest task."""
        model = router._get_bedrock_model("quest")
        assert model == "anthropic.claude-3-5-sonnet-20241022-v2:0"

    def test_bedrock_model_selection_moderation(self, router):
        """Returns correct Bedrock model for moderation task."""
        model = router._get_bedrock_model("moderation")
        assert model == "anthropic.claude-3-5-sonnet-20241022-v2:0"

    def test_openrouter_model_selection_vision(self, router):
        """Returns correct OpenRouter model for vision task."""
        model = router._get_openrouter_model("vision")
        assert model == "anthropic/claude-3.5-sonnet"

    def test_openrouter_model_selection_quest(self, router):
        """Returns correct OpenRouter model for quest task."""
        model = router._get_openrouter_model("quest")
        assert model == "anthropic/claude-3.5-sonnet"

    def test_openrouter_model_selection_moderation(self, router):
        """Returns correct OpenRouter model for moderation task."""
        model = router._get_openrouter_model("moderation")
        assert model == "anthropic/claude-3.5-sonnet"

    def test_unknown_task_type_defaults(self, router):
        """Unknown task type falls back to quest model."""
        bedrock_model = router._get_bedrock_model("unknown")
        openrouter_model = router._get_openrouter_model("unknown")
        assert bedrock_model == router.settings.bedrock_quest_model
        assert openrouter_model == router.settings.openrouter_quest_model


class TestOpenRouterClient:
    """Tests for the OpenRouter HTTP client integration."""

    @pytest.mark.asyncio
    async def test_openrouter_http_error_status(self, router):
        """OpenRouter returns non-200 status raises error."""
        router.settings.max_retries = 1

        mock_client_bedrock = MagicMock()
        mock_client_bedrock.converse.side_effect = Exception("Bedrock down")
        router._bedrock_client = mock_client_bedrock

        mock_request = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Rate limited"
        mock_response.request = mock_request

        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_response

        router._http_client = mock_http_client

        with pytest.raises(LLMRouterError) as exc_info:
            await router.vision_analysis("Test")

        assert "429" in exc_info.value.openrouter_error

    @pytest.mark.asyncio
    async def test_openrouter_empty_choices(self, router):
        """OpenRouter returns empty choices raises error."""
        router.settings.max_retries = 1

        mock_client_bedrock = MagicMock()
        mock_client_bedrock.converse.side_effect = Exception("Bedrock down")
        router._bedrock_client = mock_client_bedrock

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"choices": []}

        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_response
        router._http_client = mock_http_client

        with pytest.raises(LLMRouterError):
            await router.quest_generation("Quest")


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    @pytest.mark.asyncio
    async def test_module_level_vision_analysis(self):
        """Module-level vision_analysis function works."""
        from llm_router import vision_analysis, _router
        import llm_router

        # Reset singleton
        llm_router._router = None

        with patch("llm_router.settings") as mock_settings:
            mock_settings.aws_region = "us-east-1"
            mock_settings.bedrock_vision_model = "test-model"
            mock_settings.bedrock_quest_model = "test-model"
            mock_settings.bedrock_moderation_model = "test-model"
            mock_settings.openrouter_vision_model = "test/model"
            mock_settings.openrouter_quest_model = "test/model"
            mock_settings.openrouter_moderation_model = "test/model"
            mock_settings.openrouter_api_key = "key"
            mock_settings.openrouter_base_url = "https://test.ai"
            mock_settings.bedrock_timeout_ms = 15000
            mock_settings.openrouter_timeout_ms = 15000
            mock_settings.max_retries = 1
            mock_settings.retry_base_delay_ms = 100

            router_instance = get_router()
            mock_response = {
                "output": {"message": {"content": [{"text": "Vision result"}]}}
            }
            mock_bedrock = MagicMock()
            mock_bedrock.converse.return_value = mock_response
            router_instance._bedrock_client = mock_bedrock

            result = await vision_analysis("Test prompt")
            assert result["content"] == "Vision result"

        # Clean up
        llm_router._router = None
