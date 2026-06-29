"""
Cloud Storage Tool
Handles uploads and downloads from object storage (Amazon S3).
"""

import os
import uuid
from typing import Optional
import base64

BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "fablecraft-assets")


def upload_to_storage(file_data: bytes, filename: str, content_type: str = "image/png") -> str:
    """
    Uploads file to cloud storage.
    Returns public URI.
    """
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}_{filename}"

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=unique_filename,
            Body=file_data,
            ContentType=content_type,
        )

        # Return a presigned URL (valid 1 hour)
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": unique_filename},
            ExpiresIn=3600,
        )
        return url
    except Exception as e:
        raise Exception(f"Failed to upload to storage: {str(e)}")


def upload_base64_to_storage(base64_data: str, filename: str, content_type: str = "image/png") -> str:
    """
    Uploads base64-encoded data to cloud storage.
    Returns public URI.
    """
    try:
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]

        # Decode base64
        file_data = base64.b64decode(base64_data)

        return upload_to_storage(file_data, filename, content_type)
    except Exception as e:
        raise Exception(f"Failed to upload base64 to storage: {str(e)}")


def download_from_storage(uri: str) -> bytes:
    """
    Downloads file from cloud storage.
    Returns file data.
    """
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))

        # Extract bucket and key from S3 URL
        if "amazonaws.com" in uri:
            # Handle presigned URL format
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(uri)
            path_parts = parsed.path.lstrip("/").split("/", 1)
            if len(path_parts) == 2:
                bucket_name = path_parts[0]
                key = path_parts[1]
            else:
                raise ValueError("Invalid S3 URI format")
        else:
            raise ValueError("Invalid storage URI format")

        response = s3.get_object(Bucket=bucket_name, Key=key)
        return response["Body"].read()
    except Exception as e:
        raise Exception(f"Failed to download from storage: {str(e)}")
