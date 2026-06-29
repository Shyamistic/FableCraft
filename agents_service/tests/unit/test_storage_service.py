"""
Unit tests for StorageService.
Tests upload, download, URL generation, retry logic, and UUID-based path generation.
"""

import base64
import uuid
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from botocore.exceptions import ClientError

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture
def mock_settings():
    """Create mock settings for testing."""
    settings = MagicMock()
    settings.aws_region = "us-east-1"
    settings.s3_bucket_name = "test-bucket"
    settings.cloudfront_domain = None
    settings.presigned_url_expiry_seconds = 3600
    settings.cache_control_max_age = 3600
    settings.max_retries = 3
    settings.retry_base_delay_ms = 100  # Short delay for tests
    return settings


@pytest.fixture
def mock_s3_client():
    """Create a mock S3 client."""
    return MagicMock()


@pytest.fixture
def storage_service(mock_settings, mock_s3_client):
    """Create a StorageService instance with mocked dependencies."""
    with patch("storage_service.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_s3_client
        with patch("config.settings", mock_settings):
            from storage_service import StorageService

            service = StorageService()
            service._s3_client = mock_s3_client
            service.settings = mock_settings
            return service


class TestGenerateS3Key:
    """Tests for S3 key generation."""

    def test_key_format_with_session_id(self, storage_service):
        """Key should follow {session_id}/{uuid}.{ext} format."""
        key = storage_service._generate_s3_key("photo.png", "session-123")
        parts = key.split("/")
        assert parts[0] == "session-123"
        # Second part should be uuid.ext
        name_part = parts[1]
        assert name_part.endswith(".png")
        # Validate UUID format
        uuid_str = name_part.replace(".png", "")
        uuid.UUID(uuid_str)  # Raises if invalid

    def test_key_format_without_session_id(self, storage_service):
        """Key should use 'shared' prefix when no session_id provided."""
        key = storage_service._generate_s3_key("audio.mp3", None)
        parts = key.split("/")
        assert parts[0] == "shared"
        assert parts[1].endswith(".mp3")

    def test_key_with_no_extension(self, storage_service):
        """Key should handle filenames without extensions."""
        key = storage_service._generate_s3_key("noext", "session-456")
        parts = key.split("/")
        assert parts[0] == "session-456"
        # Should just be the UUID with no extension
        uuid.UUID(parts[1])  # Validates it's a valid UUID

    def test_key_uniqueness(self, storage_service):
        """Each generated key should be unique."""
        keys = set()
        for _ in range(100):
            key = storage_service._generate_s3_key("file.png", "session-1")
            keys.add(key)
        assert len(keys) == 100


class TestUploadBase64:
    """Tests for base64 upload functionality."""

    @pytest.mark.asyncio
    async def test_upload_base64_success(self, storage_service, mock_s3_client):
        """Successfully uploads base64 data and returns URL."""
        test_data = b"fake image data"
        b64_data = base64.b64encode(test_data).decode()

        mock_s3_client.put_object.return_value = {}
        mock_s3_client.generate_presigned_url.return_value = (
            "https://test-bucket.s3.amazonaws.com/session-1/uuid.png"
        )

        url = await storage_service.upload_base64(
            b64_data, "character.png", "image/png", "session-1"
        )

        assert url.startswith("https://")
        mock_s3_client.put_object.assert_called_once()
        call_kwargs = mock_s3_client.put_object.call_args[1]
        assert call_kwargs["Bucket"] == "test-bucket"
        assert call_kwargs["Body"] == test_data
        assert call_kwargs["ContentType"] == "image/png"
        assert "max-age=3600" in call_kwargs["CacheControl"]

    @pytest.mark.asyncio
    async def test_upload_base64_sets_cache_control(
        self, storage_service, mock_s3_client
    ):
        """Upload should set Cache-Control header with max-age >= 3600."""
        test_data = b"test"
        b64_data = base64.b64encode(test_data).decode()

        mock_s3_client.put_object.return_value = {}
        mock_s3_client.generate_presigned_url.return_value = "https://url"

        await storage_service.upload_base64(b64_data, "test.png", "image/png", "s1")

        call_kwargs = mock_s3_client.put_object.call_args[1]
        assert "public, max-age=3600" == call_kwargs["CacheControl"]


class TestUploadBytes:
    """Tests for raw bytes upload functionality."""

    @pytest.mark.asyncio
    async def test_upload_bytes_success(self, storage_service, mock_s3_client):
        """Successfully uploads raw bytes and returns URL."""
        test_data = b"raw bytes content"

        mock_s3_client.put_object.return_value = {}
        mock_s3_client.generate_presigned_url.return_value = "https://presigned-url"

        url = await storage_service.upload_bytes(
            test_data, "audio.mp3", "audio/mpeg", "session-2"
        )

        assert url == "https://presigned-url"
        mock_s3_client.put_object.assert_called_once()

    @pytest.mark.asyncio
    async def test_upload_bytes_stores_with_uuid_key(
        self, storage_service, mock_s3_client
    ):
        """Upload should use UUID-based keys linked to session."""
        mock_s3_client.put_object.return_value = {}
        mock_s3_client.generate_presigned_url.return_value = "https://url"

        await storage_service.upload_bytes(
            b"data", "image.png", "image/png", "my-session"
        )

        call_kwargs = mock_s3_client.put_object.call_args[1]
        key = call_kwargs["Key"]
        assert key.startswith("my-session/")
        # Extract UUID part
        uuid_part = key.split("/")[1].replace(".png", "")
        uuid.UUID(uuid_part)  # Validates UUID format


class TestGetUrl:
    """Tests for URL generation."""

    @pytest.mark.asyncio
    async def test_get_url_cloudfront(self, storage_service, mock_settings):
        """Returns CloudFront URL when cloudfront_domain is set."""
        mock_settings.cloudfront_domain = "d1234.cloudfront.net"

        url = await storage_service.get_url("session-1/abc.png")

        assert url == "https://d1234.cloudfront.net/session-1/abc.png"

    @pytest.mark.asyncio
    async def test_get_url_presigned(self, storage_service, mock_s3_client):
        """Returns pre-signed URL when no CloudFront is configured."""
        mock_s3_client.generate_presigned_url.return_value = (
            "https://bucket.s3.amazonaws.com/key?signature=xxx"
        )

        url = await storage_service.get_url("session-1/abc.png")

        assert "https://bucket.s3.amazonaws.com" in url
        mock_s3_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "session-1/abc.png"},
            ExpiresIn=3600,
        )

    @pytest.mark.asyncio
    async def test_presigned_url_expiry_capped_at_3600(
        self, storage_service, mock_settings, mock_s3_client
    ):
        """Pre-signed URL expiry should never exceed 3600 seconds."""
        mock_settings.presigned_url_expiry_seconds = 7200  # Over the limit

        mock_s3_client.generate_presigned_url.return_value = "https://url"

        await storage_service.get_url("key")

        call_kwargs = mock_s3_client.generate_presigned_url.call_args
        assert call_kwargs[1]["ExpiresIn"] == 3600


class TestDownload:
    """Tests for download functionality."""

    @pytest.mark.asyncio
    async def test_download_success(self, storage_service, mock_s3_client):
        """Successfully downloads file content."""
        mock_body = MagicMock()
        mock_body.read.return_value = b"file content"
        mock_s3_client.get_object.return_value = {"Body": mock_body}

        data = await storage_service.download("session-1/file.png")

        assert data == b"file content"
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket", Key="session-1/file.png"
        )


class TestRetryLogic:
    """Tests for retry with exponential backoff."""

    @pytest.mark.asyncio
    async def test_retry_on_client_error(self, storage_service, mock_s3_client):
        """Should retry on ClientError and succeed on subsequent attempt."""
        error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
        mock_s3_client.put_object.side_effect = [
            ClientError(error_response, "PutObject"),
            ClientError(error_response, "PutObject"),
            {},  # Third attempt succeeds
        ]
        mock_s3_client.generate_presigned_url.return_value = "https://url"

        url = await storage_service.upload_bytes(
            b"data", "file.png", "image/png", "session-1"
        )

        assert url == "https://url"
        assert mock_s3_client.put_object.call_count == 3

    @pytest.mark.asyncio
    async def test_raises_storage_error_after_max_retries(
        self, storage_service, mock_s3_client
    ):
        """Should raise StorageError after all retries are exhausted."""
        from storage_service import StorageError

        error_response = {"Error": {"Code": "503", "Message": "Service Unavailable"}}
        mock_s3_client.put_object.side_effect = ClientError(
            error_response, "PutObject"
        )

        with pytest.raises(StorageError) as exc_info:
            await storage_service.upload_bytes(
                b"data", "file.png", "image/png", "session-1"
            )

        assert "failed after 3 retries" in str(exc_info.value)
        assert mock_s3_client.put_object.call_count == 3

    @pytest.mark.asyncio
    async def test_download_retry_on_failure(self, storage_service, mock_s3_client):
        """Download should retry on S3 failures."""
        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_body = MagicMock()
        mock_body.read.return_value = b"content"

        mock_s3_client.get_object.side_effect = [
            ClientError(error_response, "GetObject"),
            {"Body": mock_body},
        ]

        data = await storage_service.download("key.png")

        assert data == b"content"
        assert mock_s3_client.get_object.call_count == 2

    @pytest.mark.asyncio
    async def test_download_raises_after_exhausted_retries(
        self, storage_service, mock_s3_client
    ):
        """Download should raise StorageError after all retries fail."""
        from storage_service import StorageError

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_s3_client.get_object.side_effect = ClientError(
            error_response, "GetObject"
        )

        with pytest.raises(StorageError):
            await storage_service.download("key.png")

        assert mock_s3_client.get_object.call_count == 3
