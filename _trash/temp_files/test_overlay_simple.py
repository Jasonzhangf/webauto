#!/usr/bin/env python3
"""
Test overlay injection fix - simplified version
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
        'remote_debugging': False,  # Disable remote debugging for now
        'auto_overlay': True,
        'auto_session': False,  # Disable session for simpler test
        'profile_id': 'test',
        'timeout': 30.0  # 30 seconds timeout
    }
    
    browser = ChromiumBrowserWrapper(config)
    
    try:
        # Navigate to a simple page
        print("📄 Navigating to example.com...")
        page = browser.goto("https://example.com")
        
        # Wait a bit for overlay to inject
        print("⏱️  Waiting for overlay injection...")
        time.sleep(3)
        
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
            
            # Get session ID
            session_id = page.page.evaluate("""
                () => window.__webautoOverlaySessionId || 'unknown'
            """)
            print(f"🔑 Session ID: {session_id}")
            
            result = True
        else:
            print("❌ Overlay injection failed - element not found")
            result = False
        
        # Keep browser open for manual inspection
        print("\n🔍 Browser is open for inspection (10 seconds)...")
        time.sleep(10)
        
        return result
        
    finally:
        print("👋 Closing browser...")
        browser.close()

if __name__ == "__main__":
    success = test_overlay_injection()
    print(f"\n{'✅ Test PASSED' if success else '❌ Test FAILED'}")
    sys.exit(0 if success else 1)
