"""
Shared exceptions for the browser interface package.
"""


class SecurityError(Exception):
  """Raised when the browser wrapper detects a security violation."""


__all__ = ["SecurityError"]
