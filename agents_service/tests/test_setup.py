"""Verify that the testing framework is properly configured."""

import pytest
from hypothesis import given, strategies as st


class TestSetup:
    """Basic tests to verify pytest + Hypothesis are working."""

    def test_basic_assertion(self):
        """Verify pytest runs."""
        assert 1 + 1 == 2

    @given(a=st.integers(), b=st.integers())
    def test_hypothesis_property(self, a: int, b: int):
        """Verify Hypothesis property-based tests run."""
        assert a + b == b + a
