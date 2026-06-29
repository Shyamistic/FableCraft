"""
Property-based tests for StorageService.
Tests cache headers and retry logic using Hypothesis.

**Validates: Requirements 13.6, 13.7, 3.5**
"""

import asyncio
import base64
import re
import time
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from botocore.exceptions import ClientError, BotoCoreError

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# --- Strategies ---

# Strategy for valid cache_control_max_age values (at least 3600 per requirement)
st_cache_max_age = st.integers(min_value=3600, max_value=86400)

# Strategy for presigned URL expiry values (any positive int, system should cap at 3600)
st_presigned_expiry = st.integers(min_value=1, max_value=86400)

# Strategy for filenames with valid extensions
st_filename = st.from_regex(r"[a-z0-9_]{1,20}\.(png|jpg|webp|mp3|mp4)", fullmatch=True)

# Strategy for session IDs
st_session_id = st.from_regex(r"[a-z0-9\-]{1,36}", fullmatch=True)

# Strategy for content types
st_content_type = st.sampled_from([
    "image/png", "image/jpeg", "image/webp", "audio/mpeg", "video/mp4"
])

# Strategy for raw binary data (small, just for testing upload flow)
st_file_data = st.binary(min_size=1, max_size=100)

# Strategy for the number of failures before success (0 = immediate success)
st_failure_count = st.integers(min_value=0, max_value=5)

# Strategy for retry base delay (in ms)
st_base_delay_ms = st.integers(min_value=10, max_value=500)


# --- Fixtures ---

def make_storage_service(
    cache_control_max_age=3600,
    presigned_url_expiry_seconds=3600,
    cloudfront_domain=None,
    max_retries=3,
    retry_base_delay_ms=10,
):
    """Factory to create a StorageService with given settings."""
    mock_settings = MagicMock()
    mock_settings.aws_region = "us-east-1"
    mock_settings.s3_bucket_name = "test-bucket"
    mock_settings.cloudfront_domain = cloudfront_domain
    mock_settings.presigned_url_expiry_seconds = presigned_url_expiry_seconds
    mock_settings.cache_control_max_age = cache_control_max_age
    mock_settings.max_retries = max_retries
    mock_settings.retry_base_delay_ms = retry_base_delay_ms

    mock_s3_client = MagicMock()

    with patch("storage_service.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_s3_client
        with patch("config.settings", mock_settings):
            from storage_service import StorageService

            service = StorageService()
            service._s3_client = mock_s3_client
            service.settings = mock_settings
            return service, mock_s3_client


# --- Property 25: Asset URL Cache Headers ---


class TestProperty25AssetURLCacheHeaders:
    """
    Property 25: Asset URL Cache Headers

    For any generated media asset served via S3 pre-signed URL or CloudFront,
    the response SHALL include a Cache-Control header with max-age of at least
    3600 seconds. Pre-signed URLs SHALL have an expiration time of no more than
    3600 seconds.

    **Validates: Requirements 13.6**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        cache_max_age=st_cache_max_age,
        filename=st_filename,
        session_id=st_session_id,
        content_type=st_content_type,
        file_data=st_file_data,
    )
    def test_cache_control_header_has_max_age_at_least_3600(
        self, cache_max_age, filename, session_id, content_type, file_data
    ):
        """
        For any upload, the Cache-Control header set on the S3 object must
        contain max-age >= 3600.

        **Validates: Requirements 13.6**
        """
        service, mock_s3_client = make_storage_service(
            cache_control_max_age=cache_max_age
        )
        mock_s3_client.put_object.return_value = {}
        mock_s3_client.generate_presigned_url.return_value = "https://presigned-url"

        asyncio.run(
            service.upload_bytes(file_data, filename, content_type, session_id)
        )

        call_kwargs = mock_s3_client.put_object.call_args[1]
        cache_control = call_kwargs["CacheControl"]

        # Extract max-age value from the Cache-Control header
        match = re.search(r"max-age=(\d+)", cache_control)
        assert match is not None, f"Cache-Control header missing max-age: {cache_control}"
        max_age_value = int(match.group(1))
        assert max_age_value >= 3600, (
            f"Cache-Control max-age must be >= 3600, got {max_age_value}"
        )

    @settings(max_examples=50, deadline=None)
    @given(presigned_expiry=st_presigned_expiry)
    def test_presigned_url_expiry_capped_at_3600(self, presigned_expiry):
        """
        For any configured presigned URL expiry, the actual ExpiresIn parameter
        used when generating pre-signed URLs must be <= 3600 seconds.

        **Validates: Requirements 13.6**
        """
        service, mock_s3_client = make_storage_service(
            presigned_url_expiry_seconds=presigned_expiry,
            cloudfront_domain=None,  # Force pre-signed URL path
        )
        mock_s3_client.generate_presigned_url.return_value = "https://presigned-url"

        asyncio.run(service.get_url("test-key/file.png"))

        call_args = mock_s3_client.generate_presigned_url.call_args
        expires_in = call_args[1]["ExpiresIn"] if "ExpiresIn" in (call_args[1] if call_args[1] else {}) else call_args[0][2] if len(call_args[0]) > 2 else None

        # Check keyword argument
        if call_args[1] and "ExpiresIn" in call_args[1]:
            expires_in = call_args[1]["ExpiresIn"]
        else:
            # Check positional or Params
            call_kwargs = call_args.kwargs if hasattr(call_args, 'kwargs') else call_args[1]
            expires_in = call_kwargs.get("ExpiresIn", None)

        assert expires_in is not None, "ExpiresIn parameter not found in presigned URL call"
        assert expires_in <= 3600, (
            f"Pre-signed URL expiry must be <= 3600, got {expires_in}"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        filename=st_filename,
        session_id=st_session_id,
    )
    def test_cloudfront_url_format(self, filename, session_id):
        """
        When CloudFront is configured, generated URLs must use the CloudFront
        domain and HTTPS protocol.

        **Validates: Requirements 13.6**
        """
        service, mock_s3_client = make_storage_service(
            cloudfront_domain="d1234.cloudfront.net"
        )

        # Generate a key to test URL generation
        key = service._generate_s3_key(filename, session_id)
        url = asyncio.run(service.get_url(key))

        assert url.startswith("https://d1234.cloudfront.net/"), (
            f"CloudFront URL should start with https://d1234.cloudfront.net/, got {url}"
        )
        assert key in url, f"URL should contain the S3 key '{key}', got {url}"


# --- Property 8: AWS Service Retry with Exponential Backoff ---


class TestProperty8AWSServiceRetryWithExponentialBackoff:
    """
    Property 8: AWS Service Retry with Exponential Backoff

    For any AWS service call (S3, Bedrock, Polly) that fails, the system SHALL
    retry up to 3 times with exponential backoff delays. If all retries are
    exhausted, an error message SHALL be returned to the client.

    **Validates: Requirements 13.7, 3.5**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        failure_count=st.integers(min_value=0, max_value=2),
        filename=st_filename,
        session_id=st_session_id,
        file_data=st_file_data,
    )
    def test_retry_succeeds_within_max_attempts(
        self, failure_count, filename, session_id, file_data
    ):
        """
        For any number of failures less than max_retries, the operation should
        eventually succeed after retrying.

        **Validates: Requirements 13.7**
        """
        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=10
        )

        # Create side effects: failure_count ClientErrors followed by success
        error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
        side_effects = [
            ClientError(error_response, "PutObject")
            for _ in range(failure_count)
        ] + [{}]  # Success on the last attempt

        mock_s3_client.put_object.side_effect = side_effects
        mock_s3_client.generate_presigned_url.return_value = "https://url"

        # Should succeed without raising
        url = asyncio.run(
            service.upload_bytes(file_data, filename, "image/png", session_id)
        )

        assert url == "https://url"
        assert mock_s3_client.put_object.call_count == failure_count + 1

    @settings(max_examples=30, deadline=None)
    @given(
        filename=st_filename,
        session_id=st_session_id,
        file_data=st_file_data,
    )
    def test_raises_error_after_max_retries_exhausted(
        self, filename, session_id, file_data
    ):
        """
        When all 3 retry attempts fail, the system must raise a StorageError.

        **Validates: Requirements 13.7, 3.5**
        """
        from storage_service import StorageError

        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=10
        )

        error_response = {"Error": {"Code": "503", "Message": "Service Unavailable"}}
        mock_s3_client.put_object.side_effect = ClientError(
            error_response, "PutObject"
        )

        with pytest.raises(StorageError) as exc_info:
            asyncio.run(
                service.upload_bytes(file_data, filename, "image/png", session_id)
            )

        # Verify error message mentions retry exhaustion
        assert "failed after 3 retries" in str(exc_info.value)
        # Verify exactly 3 attempts were made
        assert mock_s3_client.put_object.call_count == 3

    @settings(max_examples=30, deadline=None)
    @given(base_delay_ms=st_base_delay_ms)
    def test_exponential_backoff_delays_increase(self, base_delay_ms):
        """
        For any base delay, retry delays must follow exponential backoff pattern:
        delay_n = base_delay * 2^n for attempt n.

        **Validates: Requirements 13.7**
        """
        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=base_delay_ms
        )

        # Track sleep calls to verify exponential backoff
        sleep_calls = []
        original_sleep = asyncio.sleep

        async def mock_sleep(duration):
            sleep_calls.append(duration)

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_s3_client.put_object.side_effect = ClientError(
            error_response, "PutObject"
        )

        with patch("asyncio.sleep", side_effect=mock_sleep):
            from storage_service import StorageError

            try:
                asyncio.run(
                    service.upload_bytes(b"data", "f.png", "image/png", "s1")
                )
            except StorageError:
                pass

        # Should have (max_retries - 1) = 2 sleep calls (no sleep after last failure)
        assert len(sleep_calls) == 2, f"Expected 2 sleep calls, got {len(sleep_calls)}"

        # Verify exponential pattern: delays should be base * 2^0, base * 2^1
        expected_delay_0 = (base_delay_ms / 1000.0) * (2 ** 0)
        expected_delay_1 = (base_delay_ms / 1000.0) * (2 ** 1)

        assert abs(sleep_calls[0] - expected_delay_0) < 0.001, (
            f"First delay should be {expected_delay_0}, got {sleep_calls[0]}"
        )
        assert abs(sleep_calls[1] - expected_delay_1) < 0.001, (
            f"Second delay should be {expected_delay_1}, got {sleep_calls[1]}"
        )

    @settings(max_examples=30, deadline=None)
    @given(
        failure_count=st.integers(min_value=0, max_value=2),
    )
    def test_download_retries_on_failure(self, failure_count):
        """
        Download operations should also retry up to max_retries times on failure.

        **Validates: Requirements 13.7**
        """
        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=10
        )

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_body = MagicMock()
        mock_body.read.return_value = b"content"

        side_effects = [
            ClientError(error_response, "GetObject")
            for _ in range(failure_count)
        ] + [{"Body": mock_body}]

        mock_s3_client.get_object.side_effect = side_effects

        data = asyncio.run(service.download("test-key.png"))

        assert data == b"content"
        assert mock_s3_client.get_object.call_count == failure_count + 1

    @settings(max_examples=30, deadline=None)
    @given(
        filename=st_filename,
    )
    def test_download_raises_after_exhausted_retries(self, filename):
        """
        Download must raise StorageError when all retries are exhausted.

        **Validates: Requirements 13.7, 3.5**
        """
        from storage_service import StorageError

        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=10
        )

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_s3_client.get_object.side_effect = ClientError(
            error_response, "GetObject"
        )

        with pytest.raises(StorageError):
            asyncio.run(service.download(f"key/{filename}"))

        assert mock_s3_client.get_object.call_count == 3

    @settings(max_examples=30, deadline=None)
    @given(
        failure_count=st.integers(min_value=1, max_value=2),
        file_data=st_file_data,
    )
    def test_retry_handles_botocore_errors(self, failure_count, file_data):
        """
        The retry mechanism must handle both ClientError and BotoCoreError types.

        **Validates: Requirements 13.7**
        """
        service, mock_s3_client = make_storage_service(
            max_retries=3, retry_base_delay_ms=10
        )

        # Mix of BotoCoreError and ClientError
        side_effects = [
            BotoCoreError()
            for _ in range(failure_count)
        ] + [{}]

        mock_s3_client.put_object.side_effect = side_effects
        mock_s3_client.generate_presigned_url.return_value = "https://url"

        url = asyncio.run(
            service.upload_bytes(file_data, "file.png", "image/png", "session-1")
        )

        assert url == "https://url"
        assert mock_s3_client.put_object.call_count == failure_count + 1
