#!/usr/bin/env python3
"""
Simple test to check if browser launches
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from playwright.sync_api import sync_playwright

def test_simple_launch():
    """Test simple browser launch"""
    print("🧪 Testing Simple Browser Launch...")
    
    with sync_playwright() as p:
        print("📦 Launching Chromium...")
        browser = p.chromium.launch(headless=False)
        
        print("📄 Creating page...")
        page = browser.new_page()
        
        print("🌐 Navigating to example.com...")
        page.goto("https://example.com", timeout=30000)
        
        print("✅ Navigation successful!")
        print(f"   Title: {page.title()}")
        print(f"   URL: {page.url}")
        
        print("\n⏸️  Pausing for 5 seconds...")
        import time
        time.sleep(5)
        
        print("🔒 Closing browser...")
        browser.close()
        
    print("✅ Test completed successfully!")

if __name__ == "__main__":
    test_simple_launch()
