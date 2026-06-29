"""Shared test fixtures and configuration for the agents_service test suite."""

import pytest
from hypothesis import settings, Phase

# Configure Hypothesis for reasonable CI-friendly defaults
settings.register_profile(
    "ci",
    max_examples=100,
    phases=[Phase.explicit, Phase.generate, Phase.shrink],
)
settings.register_profile(
    "dev",
    max_examples=50,
    phases=[Phase.explicit, Phase.generate, Phase.shrink],
)
settings.load_profile("dev")
