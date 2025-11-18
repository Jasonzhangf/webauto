"""
Minimal Playwright page wrapper for Camoufox.
"""

from __future__ import annotations

from typing import Any

from abstract_browser import AbstractPage


class CamoufoxPageWrapper(AbstractPage):
  """Camoufox 页面包装器 - 包含 JavaScript 执行功能"""

  def __init__(self, page):
    self._page = page

  def goto(self, url: str) -> None:
    self._page.goto(url)
    try:
      self._page.add_style_tag(content="""
          html, body, * {
              font-family: "PingFang SC", "Microsoft YaHei", "SimHei",
                          system-ui, -apple-system, BlinkMacSystemFont,
                          sans-serif !important;
              text-rendering: optimizeLegibility;
              -webkit-font-smoothing: antialiased;
          }
      """)
    except Exception:
      pass

  def title(self) -> str:
    return self._page.title()

  def url(self) -> str:
    return self._page.url

  def click(self, selector: str) -> None:
    self._page.click(selector)

  def fill(self, selector: str, value: str) -> None:
    self._page.fill(selector, value)

  def text_content(self, selector: str) -> str:
    return self._page.text_content(selector)

  def screenshot(self, filename: str = None, full_page: bool = False) -> bytes:
    data = self._page.screenshot(full_page=full_page)
    if filename:
      with open(filename, "wb") as f:
        f.write(data)
    return data

  def wait_for_selector(self, selector: str, timeout: int = 30000) -> None:
    self._page.wait_for_selector(selector, timeout=timeout)

  def evaluate(self, script: str) -> Any:
    return self._page.evaluate(script)

  def query_selector(self, selector: str):
    return self._page.query_selector(selector)

  def query_selector_all(self, selector: str):
    return self._page.query_selector_all(selector)

  def close(self) -> None:
    self._page.close()


__all__ = ["CamoufoxPageWrapper"]
