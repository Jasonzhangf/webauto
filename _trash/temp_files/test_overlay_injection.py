#!/usr/bin/env python3
"""
Test overlay injection fix
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_interface.chromium_browser import ChromiumBrowserWrapper

def test_overlay_injection():
    """Test that overlay injects correctly"""
    print("🧪 Testing Overlay Injection...")
    
    config = {
        'headless': False,
        'remote_debugging': True,
        'debug_port': 9222,
        'auto_overlay': True,
        'auto_session': True,
        'session_name': 'test_overlay',
        'profile_id': 'test',
        'cookie_dir': './cookies'
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        # Navigate to a simple page
        print("📄 Navigating to example.com...")
        page = browser.goto("https://example.com")
        
        # Wait a bit for overlay to inject
        time.sleep(2)
        
        # Check if overlay exists
        print("🔍 Checking for overlay...")
        overlay_exists = page.page.evaluate("""
            () => {
                const root = document.getElementById('__webauto_overlay_root_v2__');
                return root !== null;
            }
        """)
        
        if overlay_exists:
            print("✅ Overlay injection successful!")
            
            # Get overlay version
            version = page.page.evaluate("""
                () => window.__webautoOverlayVersion || 'unknown'
            """)
            print(f"📦 Overlay version: {version}")
            
        else:
            print("❌ Overlay injection failed - element not found")
            return False
        
        # Keep browser open for manual inspection
        print("\n🔍 Browser is open for inspection...")
        print("   Press Ctrl+C to close")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n👋 Closing browser...")
        
        return True
        
    finally:
        browser.close()

if __name__ == "__main__":
    success = test_overlay_injection()
    sys.exit(0 if success else 1)
