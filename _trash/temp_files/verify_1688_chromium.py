import time
import json
import os
from browser_interface import ChromiumBrowserWrapper

SESSION_NAME = "verify_1688"
COOKIE_DIR = "./cookies"

def verify_cookies():
    print("\n--- Verifying Cookie Persistence ---")
    
    # Step 1: Initial Visit
    print("1. Opening 1688.com (First Run)...")
    with ChromiumBrowserWrapper({"headless": False, "session_name": SESSION_NAME, "auto_session": True}) as browser:
        page = browser.goto("https://www.1688.com/")
        print("   Page loaded.")
        time.sleep(5) # Wait for some cookies to be set
        
        # Check cookies
        cookies = browser.get_storage_state().get("cookies", [])
        print(f"   Cookies count: {len(cookies)}")
        
        # Save explicitly (though auto-save should work)
        browser.save_session(SESSION_NAME)
        print("   Session saved.")

    # Step 2: Re-open
    print("2. Re-opening 1688.com (Second Run)...")
    with ChromiumBrowserWrapper({"headless": False, "session_name": SESSION_NAME, "auto_session": True}) as browser:
        # Check if cookies loaded BEFORE navigation
        state = browser.get_storage_state()
        cookies_before = state.get("cookies", [])
        print(f"   Cookies loaded from session: {len(cookies_before)}")
        
        if len(cookies_before) > 0:
            print("   SUCCESS: Cookies persisted.")
        else:
            print("   WARNING: No cookies found. (Might be normal if 1688 didn't set persistent cookies or incognito mode issues, but expected to fail if persistence is broken)")

        page = browser.goto("https://www.1688.com/")
        time.sleep(3)

def verify_containers():
    print("\n--- Verifying Containers (Mocking Backend) ---")
    # Note: Since we don't have the backend running, we will simulate the container structure 
    # by injecting it into the page or checking if the Overlay can handle it.
    # Actually, the Overlay fetches from API. We can mock the API response using page.route if we want to test the UI rendering.
    
    with ChromiumBrowserWrapper({"headless": False, "session_name": SESSION_NAME}) as browser:
        # Define mock containers for 1688
        mock_containers = {
            "success": True,
            "data": {
                "containers": {
                    "1688.home.root": {
                        "description": "1688 Home Root",
                        "selector": "body",
                        "children": ["1688.home.searchbar"]
                    },
                    "1688.home.searchbar": {
                        "description": "Search Bar Area",
                        "selector": ".search-container", # Hypothetical selector
                        "children": []
                    }
                }
            }
        }
        
        context = browser._get_context()
        
        # Mock the API endpoint
        def handle_route(route):
            print(f"   Intercepted request to: {route.request.url}")
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(mock_containers)
            )

        # Intercept the container API call
        context.route("**/api/v1/containers?url=*", handle_route)
        
        print("1. Navigating to 1688 Home...")
        page = browser.goto("https://www.1688.com/")
        
        print("2. Installing Overlay...")
        browser.install_overlay(SESSION_NAME, "default")
        time.sleep(2)
        
        # Check if Overlay rendered the containers
        print("3. Checking Overlay Content...")
        # We look for the root container in the Shadow DOM
        # Note: Accessing Shadow DOM via Playwright requires specific selectors or evaluation
        
        # Check for Root Container
        root_text = page.evaluate("""() => {
            const root = document.getElementById('__webauto_overlay_root_v2__');
            if (!root) return null;
            const shadow = root.shadowRoot || root.querySelector('div').shadowRoot; // Depending on implementation
            // My implementation attaches shadow to a host div inside root
            const host = root.querySelector('div');
            if (!host || !host.shadowRoot) return null;
            
            const treeRoots = host.shadowRoot.querySelectorAll('.wa-tree-root-title');
            return Array.from(treeRoots).map(el => el.textContent);
        }""")
        
        print(f"   Found Containers in UI: {root_text}")
        
        if root_text and "1688 Home Root" in root_text:
            print("   SUCCESS: Overlay rendered mock containers.")
        else:
            print("   FAILED: Overlay did not render containers (or Shadow DOM access failed).")

        # Verify Search Page
        print("4. Navigating to Search Page...")
        page.goto("https://s.1688.com/selloffer/offer_search.htm?keywords=test")
        time.sleep(2)
        # (Overlay needs re-install or auto-inject on nav? My implementation has 'framenavigated' and 'page' listeners, but let's ensure)
        # The wrapper's install_overlay handles new pages/navs via listeners.
        
        # Verify Chat Page (Login usually required, but we check URL match)
        print("5. Navigating to Chat Page (Simulated URL)...")
        # Just checking if it doesn't crash
        page.goto("https://chat.1688.com/athena/chat_window") 
        time.sleep(2)

if __name__ == "__main__":
    verify_cookies()
    verify_containers()
