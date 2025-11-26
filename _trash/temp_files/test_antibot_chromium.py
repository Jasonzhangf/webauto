#!/usr/bin/env python3
"""
Test script for anti-bot detection and human behavior simulation.
"""
import time
from browser_interface import ChromiumBrowserWrapper
from browser_interface.chromium_browser import AntiBotError


def on_risk_control_callback(message, page):
    """Custom callback when risk control is detected."""
    print(f"\n⚠️  RISK CONTROL DETECTED: {message}")
    print(f"   URL: {page.url}")
    print(f"   Please solve the captcha manually...")
    # Pause and wait for user to solve captcha
    input("   Press Enter after you've solved the captcha to continue...")


def test_basic_detection():
    """Test basic risk control detection."""
    print("\n=== Test 1: Basic Risk Control Detection ===")
    
    config = {
        "headless": False,
        "session_name": "antibot_test",
        "auto_session": True,
        "anti_bot_detection": True,
        "human_delay_range": (1.0, 3.0),
        "on_risk_control": on_risk_control_callback
    }
    
    try:
        with ChromiumBrowserWrapper(config) as browser:
            print("1. Navigating to 1688.com...")
            page = browser.goto("https://www.1688.com/")
            print("   ✓ Page loaded successfully")
            
            print("2. Performing safe wait...")
            browser.safe_wait(page, timeout=3.0)
            print("   ✓ Safe wait completed")
            
            print("3. Test completed without risk control detection")
            
    except AntiBotError as e:
        print(f"   ✗ Risk control detected: {e}")
    except Exception as e:
        print(f"   ✗ Error: {e}")


def test_safe_operations():
    """Test safe click and fill operations."""
    print("\n=== Test 2: Safe Operations (Click & Fill) ===")
    
    config = {
        "headless": False,
        "session_name": "antibot_test",
        "anti_bot_detection": True,
        "human_delay_range": (0.5, 1.5),
    }
    
    try:
        with ChromiumBrowserWrapper(config) as browser:
            print("1. Navigating to 1688.com...")
            page = browser.goto("https://www.1688.com/")
            
            print("2. Looking for search box...")
            time.sleep(2)
            
            # Try to find and fill the search box
            search_selectors = [
                "#alisearch-input",
                "input[name='keywords']",
                ".ali-search-keywords input"
            ]
            
            search_filled = False
            for selector in search_selectors:
                try:
                    if page._page.locator(selector).count() > 0:
                        print(f"   Found search box: {selector}")
                        print("3. Filling search box with human-like typing...")
                        browser.safe_fill(page, selector, "测试产品", typing_delay=0.1)
                        print("   ✓ Search box filled")
                        search_filled = True
                        break
                except Exception:
                    continue
            
            if not search_filled:
                print("   ⚠ Search box not found, skipping fill test")
            
            print("4. Waiting with human delay...")
            browser._human_delay(2.0, 3.0)
            print("   ✓ Test completed")
            
    except AntiBotError as e:
        print(f"   ✗ Risk control detected: {e}")
    except Exception as e:
        print(f"   ✗ Error: {e}")


def test_multiple_pages():
    """Test navigation across multiple pages."""
    print("\n=== Test 3: Multiple Page Navigation ===")
    
    config = {
        "headless": False,
        "session_name": "antibot_test",
        "anti_bot_detection": True,
        "human_delay_range": (1.0, 2.0),
    }
    
    urls = [
        "https://www.1688.com/",
        "https://s.1688.com/selloffer/offer_search.htm?keywords=test",
    ]
    
    try:
        with ChromiumBrowserWrapper(config) as browser:
            for i, url in enumerate(urls, 1):
                print(f"{i}. Navigating to: {url}")
                try:
                    page = browser.goto(url)
                    print(f"   ✓ Loaded: {page.title()[:50]}...")
                    browser._human_delay(2.0, 4.0)
                except AntiBotError as e:
                    print(f"   ✗ Risk control detected: {e}")
                    break
                except Exception as e:
                    print(f"   ⚠ Error: {e}")
            
            print("✓ Multi-page test completed")
            
    except Exception as e:
        print(f"✗ Test failed: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("Anti-Bot Detection & Human Behavior Simulation Test")
    print("=" * 60)
    
    test_basic_detection()
    test_safe_operations()
    test_multiple_pages()
    
    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)
