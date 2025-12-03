"""
Utilities for loading large JavaScript snippets used by the Camoufox wrapper.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

ASSETS_DIR = Path(__file__).parent / "assets"
OVERLAY_DIR = Path(__file__).parent / "overlay_assets"


def _read_text(path: Path) -> str:
  if not path.exists():
    raise FileNotFoundError(f"Script asset missing: {path}")
  return path.read_text(encoding="utf-8")


@lru_cache(maxsize=4)
def dom_select_script() -> str:
  """Return the DOM selection helper script injected into each page."""
  return _read_text(ASSETS_DIR / "dom_select.js")


@lru_cache(maxsize=4)
def overlay_script_template() -> str:
  """Return the Operation overlay panel script with SID/PID placeholders."""
  return _read_text(OVERLAY_DIR / "panel.js")
