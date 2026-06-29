"""
File upload validation for drawing submissions.

Validates base64-encoded image data for:
- Supported formats: PNG (image/png), JPG (image/jpeg), WEBP (image/webp)
- Maximum file size: 5 MB
- Minimum drawing content: at least 50 non-white pixels

Returns specific error codes from models.ErrorCode for each validation failure.
"""

import base64
import io
from dataclasses import dataclass
from typing import Optional

from PIL import Image

from models import ErrorCode


# Constants
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MIN_NON_WHITE_PIXELS = 50

# Supported MIME types mapped to their file signatures (magic bytes)
SUPPORTED_FORMATS = {"image/png", "image/jpeg", "image/webp"}

# Magic byte signatures for format detection
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"
WEBP_SIGNATURE = b"RIFF"
WEBP_SUBTYPE = b"WEBP"


@dataclass
class ValidationResult:
    """Result of file validation."""

    is_valid: bool
    error_code: Optional[ErrorCode] = None
    error_message: Optional[str] = None
    image_bytes: Optional[bytes] = None
    detected_format: Optional[str] = None


def detect_image_format(data: bytes) -> Optional[str]:
    """Detect image format from magic bytes.

    Returns the MIME type if recognized, or None if unsupported.
    """
    if data[:8] == PNG_SIGNATURE:
        return "image/png"
    if data[:3] == JPEG_SIGNATURE:
        return "image/jpeg"
    if data[:4] == WEBP_SIGNATURE and data[8:12] == WEBP_SUBTYPE:
        return "image/webp"
    return None


def count_non_white_pixels(image_bytes: bytes) -> int:
    """Count pixels that are not white (255, 255, 255) in the image.

    Converts image to RGB mode before checking pixel values.
    A pixel is considered non-white if any of its RGB channels
    differs from 255.
    """
    image = Image.open(io.BytesIO(image_bytes))
    image = image.convert("RGB")

    pixels = image.load()
    width, height = image.size
    count = 0

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if r != 255 or g != 255 or b != 255:
                count += 1
                # Early exit optimization: once we've found enough non-white
                # pixels, no need to keep counting
                if count >= MIN_NON_WHITE_PIXELS:
                    return count

    return count


def validate_drawing(drawing_data: str) -> ValidationResult:
    """Validate a base64-encoded drawing submission.

    Checks in order:
    1. Decodes base64 data
    2. Checks file size (max 5 MB)
    3. Checks file format (PNG, JPG, WEBP)
    4. Checks drawing content (at least 50 non-white pixels)

    Args:
        drawing_data: Base64-encoded image data. May include a data URI prefix
            (e.g., "data:image/png;base64,...")

    Returns:
        ValidationResult with is_valid=True if all checks pass, or
        is_valid=False with specific error_code and error_message.
    """
    # Strip data URI prefix if present
    if "," in drawing_data and drawing_data.startswith("data:"):
        drawing_data = drawing_data.split(",", 1)[1]

    # Decode base64
    try:
        image_bytes = base64.b64decode(drawing_data)
    except Exception:
        return ValidationResult(
            is_valid=False,
            error_code=ErrorCode.UNSUPPORTED_FORMAT,
            error_message="We need a PNG, JPG, or WEBP picture.",
        )

    # Check file size
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        return ValidationResult(
            is_valid=False,
            error_code=ErrorCode.FILE_TOO_LARGE,
            error_message="That picture is too big! Try a smaller one (up to 5 MB).",
        )

    # Check format via magic bytes
    detected_format = detect_image_format(image_bytes)
    if detected_format is None:
        return ValidationResult(
            is_valid=False,
            error_code=ErrorCode.UNSUPPORTED_FORMAT,
            error_message="We need a PNG, JPG, or WEBP picture.",
        )

    # Verify image can be opened by Pillow (additional format validation)
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.verify()  # Verify the image is not corrupted
    except Exception:
        return ValidationResult(
            is_valid=False,
            error_code=ErrorCode.UNSUPPORTED_FORMAT,
            error_message="We need a PNG, JPG, or WEBP picture.",
        )

    # Check minimum non-white pixel count
    non_white_count = count_non_white_pixels(image_bytes)
    if non_white_count < MIN_NON_WHITE_PIXELS:
        return ValidationResult(
            is_valid=False,
            error_code=ErrorCode.EMPTY_DRAWING,
            error_message="Your drawing needs a bit more! Add some more colors and shapes.",
        )

    return ValidationResult(
        is_valid=True,
        image_bytes=image_bytes,
        detected_format=detected_format,
    )
