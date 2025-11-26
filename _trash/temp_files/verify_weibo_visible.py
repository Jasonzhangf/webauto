
import sys
import json
import time
from pathlib import Path
sys.path.insert(0, '.')
from browser_interface.chromium_browser import ChromiumBrowserWrapper

def verify_visible():
    print("🚀 Starting Visible Cookie Verification...")
    
    # 1. Load Cookies
    cookie_file = Path('cookies/session_weibo-login.json')
    if not cookie_file.exists():
        print(f"❌ Cookie file not found: {cookie_file}")
        return
        
    try:
        with open(cookie_file, 'r') as f:
            data = json.load(f)
            cookies = data.get('cookies', [])
            origins = data.get('origins', [])
            print(f"✅ Loaded {len(cookies)} cookies and {len(origins)} origins from {cookie_file}")
    except Exception as e:
        print(f"❌ Failed to load cookies: {e}")
        return

    # 2. Launch Browser (Headed, Unique Profile)
    config = {
        'headless': False, # VISIBLE
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': 'weibo-verify-visible', # UNIQUE
        'session_name': 'weibo-verify-visible',
        'timeout': 30.0,
        'viewport': {'width': 1280, 'height': 800}
    }
    
    try:
        print("🔧 Launching browser...")
        browser = ChromiumBrowserWrapper(config)
        context = browser._get_context()
        
        # 3. Inject Cookies & Storage
        if cookies:
            context.add_cookies(cookies)
            print("✅ Cookies injected")
            
        # Note: Playwright python API doesn't easily support injecting 'origins' (localStorage) 
        # into an already created context via simple method unless we use storage_state at creation.
        # But ChromiumBrowserWrapper creates context internally.
        # However, we can try to inject localStorage via script if needed, 
        # but let's see if cookies are enough first. 
        # Actually, ChromiumBrowserWrapper might load storage_state if we passed 'session_name' 
        # matching a file, but we are manually loading here to be safe/explicit.
        # Let's try to rely on cookies first.
            
        # 4. Navigate
        print("🌐 Navigating to https://weibo.com ...")
        page = browser.goto('https://weibo.com')
        
        print("\n👀 Browser is open. Please check the login state.")
        print("   If you see the feed/user info, you are LOGGED IN.")
        print("   If you see the login card/QR code, you are LOGGED OUT.")
        print("\n⏱️ Waiting 60 seconds for inspection...")
        
        time.sleep(60)
        
        browser.close()
        print("✅ Verification finished.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_visible()
