"""
Public helpers/context managers for the browser interface package.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Any, Dict, Optional

from .camoufox_browser import CamoufoxBrowserWrapper


def create_browser(config: Optional[Dict[str, Any]] = None) -> CamoufoxBrowserWrapper:
  return CamoufoxBrowserWrapper(config)


def quick_test(url: str = "https://www.baidu.com", wait_time: int = 3, headless: bool = False) -> bool:
  try:
    config = {"headless": headless}
    with create_browser(config) as browser:
      page = browser.goto(url)
      title = page.title()
      print(f"访问成功: {title}")
      time.sleep(wait_time)
      return True
  except Exception as e:
    print(f"访问失败: {e}")
    return False


def save_cookies(browser: CamoufoxBrowserWrapper, domain: str) -> Dict[str, Any]:
  return browser.save_cookies(domain)


def load_cookies(browser: CamoufoxBrowserWrapper, domain: str, url: str = None) -> Dict[str, Any]:
  return browser.load_cookies(domain, url)


def save_session(browser: CamoufoxBrowserWrapper, session_name: str) -> Dict[str, Any]:
  return browser.save_session(session_name)


def restore_session(browser: CamoufoxBrowserWrapper, session_name: str) -> Dict[str, Any]:
  return browser.restore_session(session_name)


@contextmanager
def open_profile_browser(
  profile_id: str = "1688-main-v1", session_name: Optional[str] = None, headless: bool = False
):
  sid = session_name or profile_id
  config = {
    "headless": headless,
    "auto_session": True,
    "session_name": sid,
    "fingerprint_profile": "fixed",
    "profile_id": profile_id,
    "kill_previous": True,
  }
  with create_browser(config) as browser:
    try:
      browser.install_overlay(session_id=sid, profile_id=profile_id)
    except Exception:
      pass
    page = browser.new_page()
    try:
      ctx = browser._get_context()
      for p in list(ctx.pages or []):
        if p is not page:
          try:
            p.close()
          except Exception:
            continue
    except Exception:
      pass
    yield browser


@contextmanager
def stealth_mode(headless: bool = False):
  config = {
    "headless": headless,
    "args": [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      "--ignore-certifcate-errors",
      "--ignore-certifcate-errors-spki-list",
    ],
    "locale": "zh-CN",
  }
  with create_browser(config) as browser:
    yield browser


@contextmanager
def headless_mode():
  config = {"headless": True}
  with create_browser(config) as browser:
    yield browser


__all__ = [
  "create_browser",
  "quick_test",
  "save_cookies",
  "load_cookies",
  "save_session",
  "restore_session",
  "open_profile_browser",
  "stealth_mode",
  "headless_mode",
]
