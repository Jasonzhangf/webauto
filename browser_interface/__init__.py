"""
Modular Camoufox browser interface.
"""

from .api import (
  create_browser,
  headless_mode,
  load_cookies,
  open_profile_browser,
  quick_test,
  restore_session,
  save_cookies,
  save_session,
  stealth_mode,
)
from .camoufox_browser import CamoufoxBrowserWrapper
from .chromium_browser import ChromiumBrowserWrapper
from .errors import SecurityError
from .page_wrapper import CamoufoxPageWrapper

__all__ = [
  "create_browser",
  "headless_mode",
  "load_cookies",
  "open_profile_browser",
  "quick_test",
  "restore_session",
  "save_cookies",
  "save_session",
  "stealth_mode",
  "SecurityError",
  "CamoufoxBrowserWrapper",
  "ChromiumBrowserWrapper",
  "CamoufoxPageWrapper",
]
