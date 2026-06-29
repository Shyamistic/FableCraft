"""
Storage Service.
Manages S3 uploads/downloads, generates pre-signed URLs or CloudFront paths.
Implements retry with exponential backoff for S3 failures.
"""

import asyncio
import base64
import logging
import uuid
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class StorageError(Exception):
    """Raised when S3 operations fail after all retries."""

    pass


class StorageService:
    """Manages asset storage in Amazon S3."""

    def __init__(self):
        from config import settings

        self.settings = settings
        self._s3_client = boto3.client("s3", region_name=settings.aws_region)

    def _generate_s3_key(
        self, filename: str, session_id: Optional[str] = None
    ) -> str:
        """
        Generate an S3 object key using UUID and session path format.

        Path format: {session_id}/{uuid}.{ext}
        If no session_id, uses 'shared' as prefix.
        """
        ext = ""
        if "." in filename:
            ext = filename.rsplit(".", 1)[-1]

        asset_id = str(uuid.uuid4())
        key_name = f"{asset_id}.{ext}" if ext else asset_id

        prefix = session_id if session_id else "shared"
        return f"{prefix}/{key_name}"

    async def _retry_with_backoff(self, operation, operation_name: str):
        """
        Execute an operation with retry logic (3x with exponential backoff).

        Args:
            operation: Callable that performs the S3 operation (synchronous).
            operation_name: Name for logging purposes.

        Returns:
            Result of the operation.

        Raises:
            StorageError: After all retries are exhausted.
        """
        max_retries = self.settings.max_retries
        base_delay_ms = self.settings.retry_base_delay_ms
        last_error = None

        for attempt in range(max_retries):
            try:
                result = await asyncio.to_thread(operation)
                if attempt > 0:
                    logger.info(
                        f"S3 {operation_name} succeeded on attempt {attempt + 1}"
                    )
                return result
            except (BotoCoreError, ClientError) as e:
                last_error = e
                if attempt < max_retries - 1:
                    delay_seconds = (base_delay_ms / 1000.0) * (2**attempt)
                    logger.warning(
                        f"S3 {operation_name} failed (attempt {attempt + 1}/{max_retries}), "
                        f"retrying in {delay_seconds:.1f}s: {e}"
                    )
                    await asyncio.sleep(delay_seconds)
                else:
                    logger.error(
                        f"S3 {operation_name} failed after {max_retries} attempts: {e}"
                    )

        raise StorageError(
            f"S3 {operation_name} failed after {max_retries} retries: {last_error}"
        )

    async def upload_base64(
        self,
        base64_data: str,
        filename: str,
        content_type: str = "image/png",
        session_id: Optional[str] = None,
    ) -> str:
        """
        Upload base64-encoded data to S3.

        Args:
            base64_data: Base64-encoded file content
            filename: Target filename (used for extension extraction)
            content_type: MIME type for the object
            session_id: Optional session identifier for path organization

        Returns:
            URL to the uploaded asset (pre-signed URL or CloudFront path)

        Raises:
            StorageError after 3 retries with exponential backoff
        """
        data = base64.b64decode(base64_data)
        return await self.upload_bytes(data, filename, content_type, session_id)

    async def upload_bytes(
        self,
        data: bytes,
        filename: str,
        content_type: str = "image/png",
        session_id: Optional[str] = None,
    ) -> str:
        """
        Upload raw bytes to S3.

        Args:
            data: Raw file bytes
            filename: Target filename (used for extension extraction)
            content_type: MIME type for the object
            session_id: Optional session identifier for path organization

        Returns:
            URL to the uploaded asset

        Raises:
            StorageError after 3 retries with exponential backoff
        """
        s3_key = self._generate_s3_key(filename, session_id)
        cache_control = f"public, max-age={self.settings.cache_control_max_age}"

        def _do_upload():
            self._s3_client.put_object(
                Bucket=self.settings.s3_bucket_name,
                Key=s3_key,
                Body=data,
                ContentType=content_type,
                CacheControl=cache_control,
            )

        await self._retry_with_backoff(_do_upload, f"upload ({s3_key})")
        logger.info(f"Uploaded asset to s3://{self.settings.s3_bucket_name}/{s3_key}")

        url = await self.get_url(s3_key)
        return url

    async def get_url(self, key: str) -> str:
        """
        Get a URL for an S3 object.

        If cloudfront_domain is configured, returns a CloudFront URL.
        Otherwise, generates a pre-signed S3 URL with max 3600s expiry.

        Args:
            key: S3 object key

        Returns:
            URL with appropriate cache headers and expiry
        """
        if self.settings.cloudfront_domain:
            return f"https://{self.settings.cloudfront_domain}/{key}"

        expiry = min(
            self.settings.presigned_url_expiry_seconds, 3600
        )

        def _generate_presigned_url():
            return self._s3_client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.settings.s3_bucket_name,
                    "Key": key,
                },
                ExpiresIn=expiry,
            )

        url = await asyncio.to_thread(_generate_presigned_url)
        return url

    async def download(self, key: str) -> bytes:
        """
        Download an object from S3.

        Args:
            key: S3 object key

        Returns:
            Object content as bytes

        Raises:
            StorageError after 3 retries with exponential backoff
        """

        def _do_download():
            response = self._s3_client.get_object(
                Bucket=self.settings.s3_bucket_name,
                Key=key,
            )
            return response["Body"].read()

        data = await self._retry_with_backoff(_do_download, f"download ({key})")
        logger.info(
            f"Downloaded asset from s3://{self.settings.s3_bucket_name}/{key} "
            f"({len(data)} bytes)"
        )
        return data
