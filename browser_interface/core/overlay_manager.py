"""
Overlay Manager implementation - manages page overlays and development features.
"""

from __future__ import annotations
from typing import Dict, Any, Optional, List
import json
from pathlib import Path

from .interfaces import IOverlayManager


class OverlayManager(IOverlayManager):
    """Page overlay management with development mode support"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.overlay_dir = Path(config.get('overlay_dir', 'browser_interface/overlay_assets'))
        
        # Ensure we have the correct path
        if not self.overlay_dir.exists():
            # Try relative to project root
            alt_path = Path(__file__).parent.parent / 'overlay_assets'
            if alt_path.exists():
                self.overlay_dir = alt_path
            else:
                # Create if doesn't exist
                self.overlay_dir.mkdir(parents=True, exist_ok=True)

        print("🎛 Overlay管理器初始化完成")
        print(f"📁 资源目录: {self.overlay_dir}")

    def inject_overlay(self, page: Any, config: Dict[str, Any]) -> bool:
        """Inject overlay into page with configuration
        
        Args:
            page: Playwright page object to inject overlay into
            config: Configuration dict with session_id, profile_id, dev_mode
            
        Returns:
            True if injection successful, False otherwise
        """
        session_id = config.get('session_id', 'dev-mode')
        profile_id = config.get('profile_id', 'default')
        dev_mode = config.get('dev_mode', False)

        try:
            # Use build_overlay_script for consistency
            from ..overlay import build_overlay_script
            overlay_script = build_overlay_script(session_id, profile_id)

            # Add development mode detection to script if needed
            if dev_mode and 'const IS_DEV_MODE = false;' in overlay_script:
                overlay_script = overlay_script.replace(
                    'const IS_DEV_MODE = false;',
                    'const IS_DEV_MODE = true;'
                )

            # Inject into page
            page.evaluate(overlay_script)

            # Store page reference for later operations
            self._overlay_pages = getattr(self, '_overlay_pages', {})
            self._overlay_pages[session_id] = page

            print(f"✅ Overlay已注入到会话 {session_id} (Profile: {profile_id}, 开发模式: {dev_mode})")
            return True

        except FileNotFoundError as e:
            print(f"❌ Overlay注入失败 - 文件未找到: {str(e)}")
            print(f"   检查路径: {self.overlay_dir / 'panel.js'}")
            return False
        except Exception as e:
            print(f"⚠️ Overlay注入失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def inject_overlay_to_pages(self, pages: List[Any], config: Dict[str, Any]) -> int:
        """Inject overlay to multiple pages
        
        Args:
            pages: List of Playwright page objects
            config: Configuration dict
            
        Returns:
            Number of successful injections
        """
        success_count = 0
        for page in pages:
            if self.inject_overlay(page, config):
                success_count += 1
        return success_count

    def remove_overlay(self, page: Any) -> bool:
        """Remove overlay from page"""
        session_id = self.config.get('session_id', 'unknown')

        try:
            # Remove from page
            page.evaluate("""
                (() => {
                    const root = document.getElementById('__webauto_overlay_root_v2__');
                    if (root) root.remove();
                    // Also remove legacy overlay if exists
                    const legacy = document.getElementById('__webauto_overlay_root__');
                    if (legacy) legacy.remove();
                })();
            """)

            # Clean up page reference
            if hasattr(self, '_overlay_pages') and session_id in self._overlay_pages:
                del self._overlay_pages[session_id]

            print(f"🗑️ Overlay已从页面移除: {session_id}")
            return True
        except Exception as e:
            print(f"⚠️ Overlay移除失败: {str(e)}")
            return False

    def get_overlay_pages(self) -> Dict[str, Any]:
        """Get all pages with active overlays"""
        return getattr(self, '_overlay_pages', {}).copy()

    def get_overlay_page(self, session_id: str) -> Optional[Any]:
        """Get page with active overlay for session"""
        return getattr(self, '_overlay_pages', {}).get(session_id)

    def update_overlay_config(self, session_id: str, config: Dict[str, Any]) -> None:
        """Update overlay configuration for session"""
        overlay_page = self.get_overlay_page(session_id)
        if overlay_page:
            try:
                # Re-inject with new configuration
                overlay_config = {
                    'session_id': session_id,
                    'profile_id': config.get('profile_id', 'default'),
                    'dev_mode': config.get('dev_mode', False),
                    'auto_inject': config.get('auto_inject', False)
                }

                # Re-inject overlay
                if self.inject_overlay(overlay_page, overlay_config):
                    self._overlay_pages[session_id] = overlay_page

                print(f"🔄 Overlay配置已更新: {session_id}")
            except Exception as e:
                print(f"⚠️ 更新Overlay配置失败: {str(e)}")

    def cleanup(self) -> None:
        """Cleanup all overlay resources"""
        # Remove overlays from all pages
        for session_id in list(self.get_overlay_pages().keys()):
            page = self.get_overlay_page(session_id)
            if page:
                self.remove_overlay(page)

        # Clear page references
        if hasattr(self, '_overlay_pages'):
            delattr(self, '_overlay_pages')

        print("🧹 Overlay管理器清理完成")


__all__ = ["OverlayManager"]