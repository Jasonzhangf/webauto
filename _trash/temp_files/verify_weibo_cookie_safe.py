
import sys
import json
import time
from pathlib import Path
sys.path.insert(0, '.')
from browser_interface.chromium_browser import ChromiumBrowserWrapper

def verify_cookies():
    print("🚀 Starting Safe Cookie Verification...")
    
    # 1. Load Cookies
    cookie_file = Path('cookies/session_weibo-fresh.json')
    if not cookie_file.exists():
        print(f"❌ Cookie file not found: {cookie_file}")
        return
        
    try:
        with open(cookie_file, 'r') as f:
            data = json.load(f)
            cookies = data.get('cookies', [])
            print(f"✅ Loaded {len(cookies)} cookies from {cookie_file}")
    except Exception as e:
        print(f"❌ Failed to load cookies: {e}")
        return

    # 2. Launch Browser (Unique Profile to avoid conflict)
    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': False, # Manually handle cookies
        'profile_id': 'weibo-fresh', # MATCHING PROFILE ID
        'session_name': 'weibo-fresh',
        'timeout': 30.0
    }
    
    try:
        browser = ChromiumBrowserWrapper(config)
        context = browser._get_context()
        
        # 3. Inject Cookies
        if cookies:
            context.add_cookies(cookies)
            print("✅ Cookies injected into context")
            
        # 4. Navigate
        print("🌐 Navigating to https://weibo.com ...")
        page = browser.goto('https://weibo.com')
        
        # 5. Wait and Check
        print("⏳ Waiting 15s for page load...")
        time.sleep(15) # Wait for redirect/load
        
        # Screenshot
        page.page.screenshot(path='debug_weibo.png')
        with open('debug_weibo.html', 'w') as f:
            f.write(page.page.content())
        print("📸 Screenshot saved to debug_weibo.png")
        print("📄 HTML saved to debug_weibo.html")
        print(f"   Page Title: {page.page.title()}")
        
        # Check Selectors
        # root.user: .woo-mod-main
        # root.guest: .LoginCard_wrap_18dK4
        
        is_user = page.page.query_selector('.woo-mod-main') is not None
        is_guest = page.page.query_selector('.LoginCard_wrap_18dK4') is not None
        
        print(f"\n📊 Verification Results:")
        print(f"   URL: {page.page.url}")
        print(f"   User Content (.woo-mod-main): {'✅ FOUND' if is_user else '❌ NOT FOUND'}")
        print(f"   Guest Content (.LoginCard_wrap_18dK4): {'✅ FOUND' if is_guest else '❌ NOT FOUND'}")
        
        if is_user and not is_guest:
            print("\n✅ STATUS: LOGGED_IN (Cookies Valid)")
        elif is_guest and not is_user:
            print("\n⚠️ STATUS: LOGGED_OUT (Cookies Invalid or Expired)")
        else:
            print("\n❓ STATUS: UNKNOWN (Mixed or Missing Elements)")
            
        browser.close()
        
    except Exception as e:
        print(f"❌ Error during verification: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_cookies()
