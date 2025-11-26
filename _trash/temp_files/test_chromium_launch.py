import time
from browser_interface import ChromiumBrowserWrapper

def test_chromium():
    print("Starting Chromium Browser...")
    with ChromiumBrowserWrapper({"headless": False, "session_name": "test_chromium"}) as browser:
        print("Browser started.")
        page = browser.new_page()
        print("Page created.")
        page.goto("https://example.com")
        print(f"Navigated to {page.title()}")
        
        # Test cookie saving
        print("Saving session...")
        browser.save_session("test_chromium")
        
        # Test Overlay Injection
        print("Installing overlay...")
        browser.install_overlay("test_session", "test_profile")
        time.sleep(1)
        
        # Check if overlay exists
        overlay_exists = page.evaluate("() => !!document.getElementById('__webauto_overlay_root_v2__')")
        print(f"Overlay injected: {overlay_exists}")
        
        if overlay_exists:
            print("Verification SUCCESS")
        else:
            print("Verification FAILED: Overlay not found")

        time.sleep(2)
        print("Closing...")

if __name__ == "__main__":
    test_chromium()
