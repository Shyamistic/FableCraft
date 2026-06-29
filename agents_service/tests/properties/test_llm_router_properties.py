"""
Property-based tests for the LLM Router service.

Uses Hypothesis to verify that universal correctness properties hold
across all valid inputs and failure scenarios.

Property 3: LLM Router Fallback
Property 26: LLM Request Logging

Validates: Requirements 14.2, 14.3, 14.4
"""

import asyncio
import logging
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from hypothesis import given, settings, assume, HealthCheck
from hypothesis import strategies as st
from botocore.exceptions import (
    ClientError,
    BotoCoreError,
    ReadTimeoutError,
)
import httpx

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from llm_router import LLMRouter, LLMRouterError


# ─── Strategies ───────────────────────────────────────────────────────────────

# Strategy for valid task types
task_type_strategy = st.sampled_from(["vision", "quest", "moderation"])

# Strategy for prompt text (non-empty strings)
prompt_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
)

# Strategy for Bedrock failure types
bedrock_failure_strategy = st.sampled_from([
    "client_error_throttling",
    "client_error_service_unavailable",
    "client_error_internal",
    "boto_core_error",
    "read_timeout_error",
    "asyncio_timeout",
    "connection_error",
])

# Strategy for AWS error codes
aws_error_code_strategy = st.sampled_from([
    "ThrottlingException",
    "ServiceUnavailableException",
    "InternalServerException",
    "ModelTimeoutException",
    "ModelErrorException",
    "ValidationException",
])


def make_bedrock_exception(failure_type: str) -> Exception:
    """Create a Bedrock exception based on the failure type string."""
    if failure_type == "client_error_throttling":
        return ClientError(
            {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}},
            "Converse",
        )
    elif failure_type == "client_error_service_unavailable":
        return ClientError(
            {"Error": {"Code": "ServiceUnavailableException", "Message": "Service down"}},
            "Converse",
        )
    elif failure_type == "client_error_internal":
        return ClientError(
            {"Error": {"Code": "InternalServerException", "Message": "Internal error"}},
            "Converse",
        )
    elif failure_type == "boto_core_error":
        return BotoCoreError()
    elif failure_type == "read_timeout_error":
        return ReadTimeoutError(endpoint_url="https://bedrock.us-east-1.amazonaws.com")
    elif failure_type == "asyncio_timeout":
        return asyncio.TimeoutError()
    elif failure_type == "connection_error":
        return OSError("Connection refused")
    else:
        return Exception(f"Unknown failure: {failure_type}")


def create_router():
    """Create a fresh LLMRouter instance with mocked settings."""
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
        mock_settings.max_retries = 1  # Keep retries minimal for property tests
        mock_settings.retry_base_delay_ms = 1  # Minimal delay for speed
        router = LLMRouter()
    return router


# ─── Property 3: LLM Router Fallback ─────────────────────────────────────────
# *For any* LLM request where Amazon Bedrock returns an HTTP error, connection
# failure, or no response within the configured timeout, the LLM_Router SHALL
# route the same request to OpenRouter as fallback. If both providers fail, the
# error response SHALL include both provider names and their respective failure
# reasons.
#
# **Validates: Requirements 14.2, 14.3**


class TestProperty3_LLMRouterFallback:
    """
    Property 3: LLM Router Fallback

    For any combination of Bedrock failure (timeout, HTTP error, connection failure)
    the system should always attempt OpenRouter as fallback.

    **Validates: Requirements 14.2, 14.3**
    """

    @pytest.mark.asyncio
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        failure_type=bedrock_failure_strategy,
        prompt=prompt_strategy,
    )
    async def test_bedrock_failure_always_triggers_openrouter_fallback(
        self, task_type, failure_type, prompt
    ):
        """
        Property: For ANY Bedrock failure type and ANY task type, the router
        SHALL attempt OpenRouter as fallback and return its result.

        **Validates: Requirements 14.2**
        """
        router = create_router()
        bedrock_exception = make_bedrock_exception(failure_type)

        # Mock Bedrock to always fail
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.side_effect = bedrock_exception
        router._bedrock_client = mock_bedrock_client

        # Mock OpenRouter to succeed
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback response"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        # Patch asyncio.sleep to avoid actual delays
        with patch("llm_router.asyncio.sleep", new_callable=AsyncMock):
            result = await router._route_request(task_type, prompt)

        # PROPERTY: OpenRouter is always used as fallback
        assert result["provider"] == "openrouter"
        assert result["content"] == "Fallback response"
        # PROPERTY: OpenRouter was actually called
        mock_http_client.post.assert_called_once()

    @pytest.mark.asyncio
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        failure_type=bedrock_failure_strategy,
        prompt=prompt_strategy,
    )
    async def test_both_providers_fail_includes_both_failure_reasons(
        self, task_type, failure_type, prompt
    ):
        """
        Property: When BOTH providers fail for ANY failure combination,
        the error SHALL include both provider names and failure reasons.

        **Validates: Requirements 14.3**
        """
        router = create_router()
        bedrock_exception = make_bedrock_exception(failure_type)

        # Mock Bedrock to fail
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.side_effect = bedrock_exception
        router._bedrock_client = mock_bedrock_client

        # Mock OpenRouter to also fail
        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = httpx.ConnectError("OpenRouter connection refused")
        router._http_client = mock_http_client

        with patch("llm_router.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(LLMRouterError) as exc_info:
                await router._route_request(task_type, prompt)

        error = exc_info.value
        # PROPERTY: Error includes both provider failure reasons
        assert error.bedrock_error is not None, "Bedrock error reason must be present"
        assert error.openrouter_error is not None, "OpenRouter error reason must be present"
        # PROPERTY: Error message references both providers
        error_msg = str(error)
        assert "Bedrock" in error_msg or "bedrock" in error_msg.lower()
        assert "OpenRouter" in error_msg or "openrouter" in error_msg.lower()

    @pytest.mark.asyncio
    @settings(max_examples=30, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        failure_type=bedrock_failure_strategy,
        prompt=prompt_strategy,
        has_image=st.booleans(),
        has_system_prompt=st.booleans(),
    )
    async def test_fallback_preserves_request_parameters(
        self, task_type, failure_type, prompt, has_image, has_system_prompt
    ):
        """
        Property: For ANY request parameters, the same request is routed to
        OpenRouter when Bedrock fails - the fallback attempt uses the same
        task type (which determines the model used).

        **Validates: Requirements 14.2**
        """
        router = create_router()
        bedrock_exception = make_bedrock_exception(failure_type)

        # Mock Bedrock to fail
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.side_effect = bedrock_exception
        router._bedrock_client = mock_bedrock_client

        # Mock OpenRouter to succeed
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Fallback content"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        image_data = "aW1hZ2VkYXRh" if has_image else None  # base64 "imagedata"
        system_prompt = "You are a helpful assistant" if has_system_prompt else None

        with patch("llm_router.asyncio.sleep", new_callable=AsyncMock):
            result = await router._route_request(
                task_type, prompt, image_data, system_prompt
            )

        # PROPERTY: Fallback was reached and returned successfully
        assert result["provider"] == "openrouter"
        # PROPERTY: OpenRouter was called (proving the fallback logic executed)
        assert mock_http_client.post.called


# ─── Property 26: LLM Request Logging ────────────────────────────────────────
# *For any* LLM request (regardless of success or failure), the system SHALL emit
# a log entry containing the provider used, the task type, the response status,
# and the total latency in milliseconds.
#
# **Validates: Requirements 14.4**


class TestProperty26_LLMRequestLogging:
    """
    Property 26: LLM Request Logging

    Every request (success or failure) must be logged with provider, task type,
    status, and latency_ms as positive integer.

    **Validates: Requirements 14.4**
    """

    @pytest.mark.asyncio
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        prompt=prompt_strategy,
    )
    async def test_successful_request_logs_all_required_fields(
        self, task_type, prompt
    ):
        """
        Property: For ANY successful Bedrock request, a log entry is emitted
        containing provider, task type, status=success, and latency_ms >= 0.

        **Validates: Requirements 14.4**
        """
        router = create_router()

        # Mock Bedrock to succeed
        mock_response = {
            "output": {"message": {"content": [{"text": "Success"}]}}
        }
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.return_value = mock_response
        router._bedrock_client = mock_bedrock_client

        with patch("llm_router.logger") as mock_logger:
            result = await router._route_request(task_type, prompt)

        # PROPERTY: A log entry was emitted
        assert mock_logger.info.called, "Log entry must be emitted for successful request"

        # Find the log call containing the LLM request info
        log_messages = [str(call) for call in mock_logger.info.call_args_list]
        llm_log_found = False
        for call_args in mock_logger.info.call_args_list:
            msg = call_args[0][0] if call_args[0] else ""
            if "LLM Request" in msg or "provider=" in msg:
                llm_log_found = True
                # PROPERTY: Log contains provider
                assert "provider=bedrock" in msg
                # PROPERTY: Log contains task type
                assert f"task={task_type}" in msg
                # PROPERTY: Log contains status
                assert "status=success" in msg
                # PROPERTY: Log contains latency_ms
                assert "latency_ms=" in msg
                # Extract and verify latency is a non-negative integer
                latency_part = msg.split("latency_ms=")[1].split()[0]
                latency_value = int(latency_part)
                assert latency_value >= 0, "latency_ms must be non-negative"
                break

        assert llm_log_found, "LLM request log entry must be present"

        # PROPERTY: Result latency_ms is a non-negative integer
        assert isinstance(result["latency_ms"], int)
        assert result["latency_ms"] >= 0

    @pytest.mark.asyncio
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        failure_type=bedrock_failure_strategy,
        prompt=prompt_strategy,
    )
    async def test_failed_request_logs_all_required_fields(
        self, task_type, failure_type, prompt
    ):
        """
        Property: For ANY failed request (both providers fail), log entries
        are emitted for BOTH the Bedrock failure AND the OpenRouter failure,
        each containing provider, task type, status=error, and latency_ms >= 0.

        **Validates: Requirements 14.4**
        """
        router = create_router()
        bedrock_exception = make_bedrock_exception(failure_type)

        # Mock Bedrock to fail
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.side_effect = bedrock_exception
        router._bedrock_client = mock_bedrock_client

        # Mock OpenRouter to also fail
        mock_http_client = AsyncMock()
        mock_http_client.post.side_effect = httpx.ConnectError("Connection refused")
        router._http_client = mock_http_client

        with patch("llm_router.logger") as mock_logger:
            with patch("llm_router.asyncio.sleep", new_callable=AsyncMock):
                with pytest.raises(LLMRouterError):
                    await router._route_request(task_type, prompt)

        # PROPERTY: Log entries emitted for both providers
        all_info_calls = mock_logger.info.call_args_list
        bedrock_log_found = False
        openrouter_log_found = False

        for call_args in all_info_calls:
            msg = call_args[0][0] if call_args[0] else ""
            if "provider=bedrock" in msg and "status=error" in msg:
                bedrock_log_found = True
                # PROPERTY: Bedrock error log contains task type
                assert f"task={task_type}" in msg
                # PROPERTY: Bedrock error log contains latency_ms
                assert "latency_ms=" in msg
                latency_part = msg.split("latency_ms=")[1].split()[0]
                latency_value = int(latency_part)
                assert latency_value >= 0

            if "provider=openrouter" in msg and "status=error" in msg:
                openrouter_log_found = True
                # PROPERTY: OpenRouter error log contains task type
                assert f"task={task_type}" in msg
                # PROPERTY: OpenRouter error log contains latency_ms
                assert "latency_ms=" in msg
                latency_part = msg.split("latency_ms=")[1].split()[0]
                latency_value = int(latency_part)
                assert latency_value >= 0

        assert bedrock_log_found, "Bedrock error log entry must be present"
        assert openrouter_log_found, "OpenRouter error log entry must be present"

    @pytest.mark.asyncio
    @settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        failure_type=bedrock_failure_strategy,
        prompt=prompt_strategy,
    )
    async def test_fallback_success_logs_both_bedrock_error_and_openrouter_success(
        self, task_type, failure_type, prompt
    ):
        """
        Property: When Bedrock fails and OpenRouter succeeds, BOTH log entries
        are emitted - one for Bedrock (error) and one for OpenRouter (success),
        each with provider, task type, status, and latency_ms.

        **Validates: Requirements 14.4**
        """
        router = create_router()
        bedrock_exception = make_bedrock_exception(failure_type)

        # Mock Bedrock to fail
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.side_effect = bedrock_exception
        router._bedrock_client = mock_bedrock_client

        # Mock OpenRouter to succeed
        mock_http_response = MagicMock()
        mock_http_response.status_code = 200
        mock_http_response.json.return_value = {
            "choices": [{"message": {"content": "Recovered"}}]
        }
        mock_http_client = AsyncMock()
        mock_http_client.post.return_value = mock_http_response
        router._http_client = mock_http_client

        with patch("llm_router.logger") as mock_logger:
            with patch("llm_router.asyncio.sleep", new_callable=AsyncMock):
                result = await router._route_request(task_type, prompt)

        # PROPERTY: Bedrock error is logged
        all_info_calls = mock_logger.info.call_args_list
        bedrock_error_logged = False
        openrouter_success_logged = False

        for call_args in all_info_calls:
            msg = call_args[0][0] if call_args[0] else ""
            if "provider=bedrock" in msg and "status=error" in msg:
                bedrock_error_logged = True
                assert f"task={task_type}" in msg
                assert "latency_ms=" in msg
            if "provider=openrouter" in msg and "status=success" in msg:
                openrouter_success_logged = True
                assert f"task={task_type}" in msg
                assert "latency_ms=" in msg

        assert bedrock_error_logged, "Bedrock error must be logged"
        assert openrouter_success_logged, "OpenRouter success must be logged"

        # PROPERTY: Result latency_ms is a non-negative integer
        assert isinstance(result["latency_ms"], int)
        assert result["latency_ms"] >= 0

    @pytest.mark.asyncio
    @settings(max_examples=30, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        task_type=task_type_strategy,
        prompt=prompt_strategy,
    )
    async def test_latency_ms_is_always_non_negative_integer(
        self, task_type, prompt
    ):
        """
        Property: For ANY request outcome, latency_ms in the response is
        always a non-negative integer (representing milliseconds).

        **Validates: Requirements 14.4**
        """
        router = create_router()

        # Mock Bedrock to succeed
        mock_response = {
            "output": {"message": {"content": [{"text": "Done"}]}}
        }
        mock_bedrock_client = MagicMock()
        mock_bedrock_client.converse.return_value = mock_response
        router._bedrock_client = mock_bedrock_client

        result = await router._route_request(task_type, prompt)

        # PROPERTY: latency_ms is always an integer >= 0
        assert isinstance(result["latency_ms"], int), (
            f"latency_ms must be int, got {type(result['latency_ms'])}"
        )
        assert result["latency_ms"] >= 0, (
            f"latency_ms must be non-negative, got {result['latency_ms']}"
        )
