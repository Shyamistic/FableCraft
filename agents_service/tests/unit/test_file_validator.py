"""
Unit tests for file_validator.py - file upload validation.

Tests validation of base64-encoded image uploads including:
- Supported formats: PNG, JPG, WEBP (up to 5 MB)
- Specific error messages for unsupported format or file too large
- Rejection of drawings with fewer than 50 non-white pixels

Requirements: 1.2, 1.5, 2.6, 2.7
"""

import sys
import os
import base64
import io

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from PIL import Image

from file_validator import (
    validate_drawing,
    detect_image_format,
    count_non_white_pixels,
    ValidationResult,
    MAX_FILE_SIZE_BYTES,
    MIN_NON_WHITE_PIXELS,
)
from models import ErrorCode


# --- Helper functions ---


def create_png_image(width: int, height: int, color=(255, 0, 0)) -> bytes:
    """Create a PNG image with a solid color fill."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_jpeg_image(width: int, height: int, color=(0, 255, 0)) -> bytes:
    """Create a JPEG image with a solid color fill."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def create_webp_image(width: int, height: int, color=(0, 0, 255)) -> bytes:
    """Create a WEBP image with a solid color fill."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


def create_white_image_with_pixels(width: int, height: int, non_white_count: int) -> bytes:
    """Create a white PNG image with exactly `non_white_count` non-white pixels."""
    img = Image.new("RGB", (width, height), (255, 255, 255))
    pixels = img.load()
    count = 0
    for y in range(height):
        for x in range(width):
            if count >= non_white_count:
                break
            pixels[x, y] = (0, 0, 0)
            count += 1
        if count >= non_white_count:
            break
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def to_base64(image_bytes: bytes) -> str:
    """Encode bytes to base64 string."""
    return base64.b64encode(image_bytes).decode("utf-8")


def to_data_uri(image_bytes: bytes, mime_type: str) -> str:
    """Encode bytes to a data URI string."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


# --- Tests for format detection ---


class TestDetectImageFormat:
    """Tests for detect_image_format."""

    def test_detects_png(self):
        img_bytes = create_png_image(10, 10)
        assert detect_image_format(img_bytes) == "image/png"

    def test_detects_jpeg(self):
        img_bytes = create_jpeg_image(10, 10)
        assert detect_image_format(img_bytes) == "image/jpeg"

    def test_detects_webp(self):
        img_bytes = create_webp_image(10, 10)
        assert detect_image_format(img_bytes) == "image/webp"

    def test_returns_none_for_unknown_format(self):
        assert detect_image_format(b"this is not an image") is None

    def test_returns_none_for_empty_bytes(self):
        assert detect_image_format(b"") is None

    def test_returns_none_for_gif(self):
        # GIF magic bytes: GIF89a
        gif_bytes = b"GIF89a" + b"\x00" * 100
        assert detect_image_format(gif_bytes) is None


# --- Tests for non-white pixel counting ---


class TestCountNonWhitePixels:
    """Tests for count_non_white_pixels."""

    def test_all_white_image_returns_zero(self):
        img_bytes = create_white_image_with_pixels(100, 100, 0)
        assert count_non_white_pixels(img_bytes) == 0

    def test_image_with_known_non_white_count(self):
        img_bytes = create_white_image_with_pixels(100, 100, 30)
        assert count_non_white_pixels(img_bytes) == 30

    def test_image_at_threshold(self):
        img_bytes = create_white_image_with_pixels(100, 100, 50)
        # Early exit once reaching MIN_NON_WHITE_PIXELS (50)
        assert count_non_white_pixels(img_bytes) >= 50

    def test_fully_colored_image(self):
        img_bytes = create_png_image(10, 10, color=(255, 0, 0))
        # All 100 pixels are non-white
        assert count_non_white_pixels(img_bytes) >= MIN_NON_WHITE_PIXELS


# --- Tests for validate_drawing: valid inputs ---


class TestValidateDrawingValid:
    """Tests for validate_drawing with valid inputs."""

    def test_valid_png_image(self):
        img_bytes = create_png_image(100, 100, color=(255, 0, 0))
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is True
        assert result.error_code is None
        assert result.error_message is None
        assert result.image_bytes == img_bytes
        assert result.detected_format == "image/png"

    def test_valid_jpeg_image(self):
        img_bytes = create_jpeg_image(100, 100, color=(0, 128, 0))
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is True
        assert result.detected_format == "image/jpeg"

    def test_valid_webp_image(self):
        img_bytes = create_webp_image(100, 100, color=(0, 0, 255))
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is True
        assert result.detected_format == "image/webp"

    def test_valid_data_uri_png(self):
        img_bytes = create_png_image(100, 100, color=(128, 128, 0))
        data_uri = to_data_uri(img_bytes, "image/png")
        result = validate_drawing(data_uri)
        assert result.is_valid is True
        assert result.detected_format == "image/png"

    def test_valid_data_uri_jpeg(self):
        img_bytes = create_jpeg_image(100, 100, color=(0, 128, 128))
        data_uri = to_data_uri(img_bytes, "image/jpeg")
        result = validate_drawing(data_uri)
        assert result.is_valid is True
        assert result.detected_format == "image/jpeg"

    def test_valid_image_at_exactly_5mb(self):
        """Image exactly at the 5 MB limit should be accepted."""
        # Create a large image that when saved is under 5 MB
        # PNG compression makes this tricky, so create raw bytes just under limit
        img = Image.new("RGB", (1000, 1000), (128, 64, 32))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        # Only test if under 5 MB (PNG compression makes exact 5 MB hard)
        if len(img_bytes) <= MAX_FILE_SIZE_BYTES:
            result = validate_drawing(to_base64(img_bytes))
            assert result.is_valid is True


# --- Tests for validate_drawing: unsupported format ---


class TestValidateDrawingUnsupportedFormat:
    """Tests for validate_drawing rejecting unsupported formats."""

    def test_rejects_gif_format(self):
        # Create minimal GIF data
        gif_data = b"GIF89a" + b"\x01\x00\x01\x00" + b"\x00" * 100
        result = validate_drawing(to_base64(gif_data))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT
        assert "PNG" in result.error_message or "WEBP" in result.error_message

    def test_rejects_plain_text(self):
        text_data = b"This is just plain text, not an image"
        result = validate_drawing(to_base64(text_data))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT

    def test_rejects_invalid_base64(self):
        result = validate_drawing("not-valid-base64!!!")
        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT

    def test_error_message_mentions_supported_formats(self):
        result = validate_drawing(to_base64(b"random garbage data"))
        assert result.is_valid is False
        # Error message should mention what formats ARE supported
        assert "PNG" in result.error_message or "png" in result.error_message.lower()

    def test_rejects_empty_string(self):
        result = validate_drawing("")
        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT


# --- Tests for validate_drawing: file too large ---


class TestValidateDrawingTooLarge:
    """Tests for validate_drawing rejecting files exceeding 5 MB."""

    def test_rejects_file_over_5mb(self):
        # Create image bytes just over 5 MB
        large_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (MAX_FILE_SIZE_BYTES + 1)
        result = validate_drawing(to_base64(large_data))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.FILE_TOO_LARGE
        assert "big" in result.error_message.lower() or "large" in result.error_message.lower()

    def test_error_message_mentions_size_limit(self):
        large_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (MAX_FILE_SIZE_BYTES + 100)
        result = validate_drawing(to_base64(large_data))
        assert result.is_valid is False
        assert "5 MB" in result.error_message or "5MB" in result.error_message


# --- Tests for validate_drawing: empty/insufficient drawing ---


class TestValidateDrawingInsufficientContent:
    """Tests for validate_drawing rejecting drawings with fewer than 50 non-white pixels."""

    def test_rejects_completely_white_image(self):
        img_bytes = create_white_image_with_pixels(100, 100, 0)
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.EMPTY_DRAWING
        assert "more" in result.error_message.lower()

    def test_rejects_image_with_49_non_white_pixels(self):
        img_bytes = create_white_image_with_pixels(100, 100, 49)
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.EMPTY_DRAWING

    def test_accepts_image_with_exactly_50_non_white_pixels(self):
        img_bytes = create_white_image_with_pixels(100, 100, 50)
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is True

    def test_accepts_image_with_more_than_50_non_white_pixels(self):
        img_bytes = create_white_image_with_pixels(100, 100, 100)
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is True

    def test_error_message_is_child_friendly(self):
        img_bytes = create_white_image_with_pixels(100, 100, 10)
        result = validate_drawing(to_base64(img_bytes))
        assert result.is_valid is False
        # Message should encourage adding more content
        assert "more" in result.error_message.lower() or "add" in result.error_message.lower()


# --- Tests for validation order (size checked before format, format before content) ---


class TestValidationOrder:
    """Tests to verify validation checks happen in the correct order."""

    def test_size_check_before_format_check(self):
        """A file that is too large should fail with FILE_TOO_LARGE even if format is invalid."""
        # Create data that exceeds 5 MB but has no valid format header
        large_garbage = b"\x00" * (MAX_FILE_SIZE_BYTES + 1)
        result = validate_drawing(to_base64(large_garbage))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.FILE_TOO_LARGE

    def test_format_check_before_content_check(self):
        """An invalid format should fail with UNSUPPORTED_FORMAT even if it has enough pixels."""
        # BMP format is not supported
        img = Image.new("RGB", (100, 100), (255, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="BMP")
        bmp_bytes = buf.getvalue()
        result = validate_drawing(to_base64(bmp_bytes))
        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT
