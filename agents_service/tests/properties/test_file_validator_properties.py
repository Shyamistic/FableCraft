"""
Property-based tests for file_validator.py - file upload validation.
Tests file upload validation and minimum drawing content threshold using Hypothesis.

**Validates: Requirements 1.2, 1.5, 2.6, 2.7**
"""

import base64
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st
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


# --- Strategies ---

# Strategy for valid image dimensions (reasonable sizes for testing)
st_image_width = st.integers(min_value=10, max_value=200)
st_image_height = st.integers(min_value=10, max_value=200)

# Strategy for RGB color tuples (non-white colors for drawing content)
st_non_white_color = st.tuples(
    st.integers(min_value=0, max_value=254),
    st.integers(min_value=0, max_value=255),
    st.integers(min_value=0, max_value=255),
).filter(lambda c: c != (255, 255, 255))

# Strategy for supported image formats
st_supported_format = st.sampled_from(["PNG", "JPEG", "WEBP"])

# Strategy for unsupported file content (random bytes that don't match valid image magic bytes)
st_unsupported_bytes = st.binary(min_size=20, max_size=1000).filter(
    lambda b: (
        b[:8] != b"\x89PNG\r\n\x1a\n"
        and b[:3] != b"\xff\xd8\xff"
        and not (b[:4] == b"RIFF" and len(b) >= 12 and b[8:12] == b"WEBP")
    )
)

# Strategy for file sizes (in bytes) that are within the 5MB limit
st_valid_file_size = st.integers(min_value=100, max_value=MAX_FILE_SIZE_BYTES)

# Strategy for file sizes that exceed the 5MB limit
st_oversized_file_size = st.integers(
    min_value=MAX_FILE_SIZE_BYTES + 1, max_value=MAX_FILE_SIZE_BYTES + 50000
)

# Strategy for non-white pixel count below threshold
st_below_threshold_pixels = st.integers(min_value=0, max_value=MIN_NON_WHITE_PIXELS - 1)

# Strategy for non-white pixel count at or above threshold
st_above_threshold_pixels = st.integers(
    min_value=MIN_NON_WHITE_PIXELS, max_value=500
)


# --- Helpers ---


def create_image_bytes(
    width: int, height: int, format: str, color=(255, 0, 0)
) -> bytes:
    """Create an image in the specified format with a solid color fill."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


def create_white_image_with_n_colored_pixels(
    width: int, height: int, n: int, color=(0, 0, 0)
) -> bytes:
    """Create a white PNG image with exactly n colored (non-white) pixels."""
    img = Image.new("RGB", (width, height), (255, 255, 255))
    pixels = img.load()
    count = 0
    for y in range(height):
        for x in range(width):
            if count >= n:
                break
            pixels[x, y] = color
            count += 1
        if count >= n:
            break
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def to_base64(data: bytes) -> str:
    """Encode bytes to base64 string."""
    return base64.b64encode(data).decode("utf-8")


# --- Property 1: File Upload Validation ---


@pytest.mark.property
class TestProperty1FileUploadValidation:
    """
    Property 1: File Upload Validation

    For any uploaded file, the system SHALL accept it if and only if the format
    is PNG, JPG, or WEBP and the file size is at most 5 MB. If the file is
    rejected, the error message SHALL identify the specific problem (unsupported
    format or file too large).

    **Validates: Requirements 1.2, 1.5, 2.7**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        width=st_image_width,
        height=st_image_height,
        format=st_supported_format,
        color=st_non_white_color,
    )
    def test_accepts_valid_format_within_size_limit(
        self, width, height, format, color
    ):
        """
        For any image in PNG/JPG/WEBP format that is ≤5MB and has sufficient
        content (≥50 non-white pixels), validation must succeed.

        **Validates: Requirements 1.2**
        """
        img_bytes = create_image_bytes(width, height, format, color)

        # Ensure file is within size limit
        assume(len(img_bytes) <= MAX_FILE_SIZE_BYTES)

        # Ensure enough non-white pixels (solid color fill on 10x10+ image guarantees this)
        assume(width * height >= MIN_NON_WHITE_PIXELS)

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is True
        assert result.error_code is None
        assert result.error_message is None
        assert result.image_bytes == img_bytes

        # Verify detected format matches what we created
        expected_mime = {
            "PNG": "image/png",
            "JPEG": "image/jpeg",
            "WEBP": "image/webp",
        }
        assert result.detected_format == expected_mime[format]

    @settings(max_examples=50, deadline=None)
    @given(unsupported_data=st_unsupported_bytes)
    def test_rejects_unsupported_format_with_specific_error(
        self, unsupported_data
    ):
        """
        For any file data that is not PNG/JPG/WEBP, validation must reject
        with UNSUPPORTED_FORMAT error code and a message mentioning supported formats.

        **Validates: Requirements 1.5, 2.7**
        """
        # Ensure it's within size limit so we don't get FILE_TOO_LARGE first
        assume(len(unsupported_data) <= MAX_FILE_SIZE_BYTES)

        result = validate_drawing(to_base64(unsupported_data))

        assert result.is_valid is False
        assert result.error_code == ErrorCode.UNSUPPORTED_FORMAT
        assert result.error_message is not None
        # Error message should mention supported formats
        msg_lower = result.error_message.lower()
        assert "png" in msg_lower or "jpg" in msg_lower or "webp" in msg_lower

    @settings(max_examples=30, deadline=None)
    @given(
        extra_size=st.integers(min_value=1, max_value=50000),
        format=st_supported_format,
    )
    def test_rejects_oversized_files_with_specific_error(
        self, extra_size, format
    ):
        """
        For any file exceeding 5MB, regardless of format, validation must reject
        with FILE_TOO_LARGE error code and a message about size.

        **Validates: Requirements 1.2, 1.5**
        """
        # Create raw bytes that exceed the limit with valid magic bytes
        # Use the real magic bytes for the format to ensure size check happens first
        if format == "PNG":
            header = b"\x89PNG\r\n\x1a\n"
        elif format == "JPEG":
            header = b"\xff\xd8\xff\xe0"
        else:  # WEBP
            header = b"RIFF\x00\x00\x00\x00WEBP"

        # Create data that is just over the limit
        padding_size = MAX_FILE_SIZE_BYTES + extra_size - len(header)
        oversized_data = header + b"\x00" * padding_size

        assert len(oversized_data) > MAX_FILE_SIZE_BYTES

        result = validate_drawing(to_base64(oversized_data))

        assert result.is_valid is False
        assert result.error_code == ErrorCode.FILE_TOO_LARGE
        assert result.error_message is not None
        # Error message should mention size
        msg_lower = result.error_message.lower()
        assert "big" in msg_lower or "large" in msg_lower or "5 mb" in msg_lower

    @settings(max_examples=50, deadline=None)
    @given(
        format=st_supported_format,
        width=st_image_width,
        height=st_image_height,
        color=st_non_white_color,
    )
    def test_valid_format_with_data_uri_prefix_accepted(
        self, format, width, height, color
    ):
        """
        For any valid image submitted with a data URI prefix, validation
        must still accept it correctly.

        **Validates: Requirements 1.2**
        """
        img_bytes = create_image_bytes(width, height, format, color)
        assume(len(img_bytes) <= MAX_FILE_SIZE_BYTES)
        assume(width * height >= MIN_NON_WHITE_PIXELS)

        mime_map = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
        data_uri = f"data:{mime_map[format]};base64,{to_base64(img_bytes)}"

        result = validate_drawing(data_uri)

        assert result.is_valid is True
        assert result.detected_format == mime_map[format]

    @settings(max_examples=30, deadline=None)
    @given(
        format=st_supported_format,
        width=st_image_width,
        height=st_image_height,
        color=st_non_white_color,
    )
    def test_rejection_always_returns_specific_error_code(
        self, format, width, height, color
    ):
        """
        For any rejected file, the error_code must be one of the specific
        error codes (UNSUPPORTED_FORMAT, FILE_TOO_LARGE, or EMPTY_DRAWING)
        and the error_message must not be empty.

        **Validates: Requirements 1.5**
        """
        img_bytes = create_image_bytes(width, height, format, color)
        assume(len(img_bytes) <= MAX_FILE_SIZE_BYTES)

        result = validate_drawing(to_base64(img_bytes))

        if not result.is_valid:
            assert result.error_code in (
                ErrorCode.UNSUPPORTED_FORMAT,
                ErrorCode.FILE_TOO_LARGE,
                ErrorCode.EMPTY_DRAWING,
            )
            assert result.error_message is not None
            assert len(result.error_message) > 0


# --- Property 5: Minimum Drawing Content Threshold ---


@pytest.mark.property
class TestProperty5MinimumDrawingContentThreshold:
    """
    Property 5: Minimum Drawing Content Threshold

    For any submitted drawing with fewer than 50 non-white pixels, the
    Vision_Analyzer SHALL reject the submission with a message prompting
    the child to add more to their drawing.

    **Validates: Requirements 2.6**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        width=st.integers(min_value=50, max_value=200),
        height=st.integers(min_value=50, max_value=200),
        non_white_count=st_below_threshold_pixels,
        color=st_non_white_color,
    )
    def test_rejects_images_below_threshold(
        self, width, height, non_white_count, color
    ):
        """
        For any image with fewer than 50 non-white pixels, validation must
        return EMPTY_DRAWING error.

        **Validates: Requirements 2.6**
        """
        # Ensure image is large enough to hold the requested non-white pixels
        assume(width * height > non_white_count)

        img_bytes = create_white_image_with_n_colored_pixels(
            width, height, non_white_count, color
        )

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is False
        assert result.error_code == ErrorCode.EMPTY_DRAWING
        assert result.error_message is not None
        # Message should encourage adding more content
        msg_lower = result.error_message.lower()
        assert "more" in msg_lower or "add" in msg_lower

    @settings(max_examples=50, deadline=None)
    @given(
        width=st.integers(min_value=50, max_value=200),
        height=st.integers(min_value=50, max_value=200),
        non_white_count=st_above_threshold_pixels,
        color=st_non_white_color,
    )
    def test_accepts_images_at_or_above_threshold(
        self, width, height, non_white_count, color
    ):
        """
        For any image with 50 or more non-white pixels, validation must
        accept the image (assuming format and size are valid).

        **Validates: Requirements 2.6**
        """
        # Ensure image is large enough to hold the requested non-white pixels
        assume(width * height >= non_white_count)

        img_bytes = create_white_image_with_n_colored_pixels(
            width, height, non_white_count, color
        )
        assume(len(img_bytes) <= MAX_FILE_SIZE_BYTES)

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is True
        assert result.error_code is None
        assert result.image_bytes is not None

    @settings(max_examples=30, deadline=None)
    @given(
        width=st.integers(min_value=50, max_value=200),
        height=st.integers(min_value=50, max_value=200),
    )
    def test_completely_white_image_rejected(self, width, height):
        """
        For any completely white image (0 non-white pixels), validation must
        return EMPTY_DRAWING error regardless of image dimensions.

        **Validates: Requirements 2.6**
        """
        img_bytes = create_white_image_with_n_colored_pixels(width, height, 0)

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is False
        assert result.error_code == ErrorCode.EMPTY_DRAWING

    @settings(max_examples=30, deadline=None)
    @given(
        width=st.integers(min_value=50, max_value=200),
        height=st.integers(min_value=50, max_value=200),
        color=st_non_white_color,
    )
    def test_exactly_at_threshold_boundary(self, width, height, color):
        """
        For any image with exactly 50 non-white pixels (the threshold), 
        validation must accept the image.

        **Validates: Requirements 2.6**
        """
        assume(width * height >= MIN_NON_WHITE_PIXELS)

        img_bytes = create_white_image_with_n_colored_pixels(
            width, height, MIN_NON_WHITE_PIXELS, color
        )

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is True
        assert result.error_code is None

    @settings(max_examples=30, deadline=None)
    @given(
        width=st.integers(min_value=50, max_value=200),
        height=st.integers(min_value=50, max_value=200),
        color=st_non_white_color,
    )
    def test_one_below_threshold_rejected(self, width, height, color):
        """
        For any image with exactly 49 non-white pixels (one below threshold),
        validation must reject with EMPTY_DRAWING.

        **Validates: Requirements 2.6**
        """
        assume(width * height >= MIN_NON_WHITE_PIXELS)

        img_bytes = create_white_image_with_n_colored_pixels(
            width, height, MIN_NON_WHITE_PIXELS - 1, color
        )

        result = validate_drawing(to_base64(img_bytes))

        assert result.is_valid is False
        assert result.error_code == ErrorCode.EMPTY_DRAWING
        assert result.error_message is not None
