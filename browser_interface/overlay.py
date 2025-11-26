"""
Overlay helpers for injecting the in-browser Operation editor.
"""

from __future__ import annotations

from typing import Optional
import json

from .scripts import overlay_script_template


def build_overlay_script(session_id: str, profile_id: Optional[str]) -> str:
  """
  Prepare the overlay script by injecting the current session/profile ids.
  """
  template = overlay_script_template()
  sid = json.dumps(session_id or "unknown")
  pid = json.dumps(profile_id or "default")
  return template.replace("__SID__", sid).replace("__PID__", pid)


__all__ = ["build_overlay_script"]
