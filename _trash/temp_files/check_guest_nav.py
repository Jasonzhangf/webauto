
import sys
import time
from pathlib import Path
sys.path.insert(0, '.')
from browser_interface.chromium_browser import ChromiumBrowserWrapper

def check_guest_nav():
    print("🚀 Checking Guest Page for Nav_wrap...")
    
    # Use a clean profile (Guest)
    config = {
        'headless': True,
        'auto_overlay': False,
        'auto_session': False,
        'profile_id': 'weibo-guest-check',
        'session_name': 'weibo-guest-check',
        'timeout': 30.0
    }
    
    try:
        browser = ChromiumBrowserWrapper(config)
        page = browser.goto('https://weibo.com')
        
        print("⏳ Waiting for page load...")
        time.sleep(10)
        
        # Check for Nav_wrap and Nav_right
        nav = page.page.query_selector("[class*='Nav_wrap']")
        nav_right = page.page.query_selector("[class*='Nav_right']")
        login_card = page.page.query_selector(".LoginCard_wrap_18dK4")
        
        print(f"\n📊 Results:")
        print(f"   Nav_wrap: {'✅ FOUND' if nav else '❌ NOT FOUND'}")
        print(f"   Nav_right: {'✅ FOUND' if nav_right else '❌ NOT FOUND'}")
        print(f"   LoginCard: {'✅ FOUND' if login_card else '❌ NOT FOUND'}")
        
        # Dump HTML
        with open('debug_guest.html', 'w') as f:
            f.write(page.page.content())
        print("📄 Guest HTML saved to debug_guest.html")
        
        if nav and login_card:
            print("\n⚠️ WARNING: Nav_wrap found on Guest page! Selector is NOT exclusive.")
        elif not nav and login_card:
            print("\n✅ Nav_wrap NOT found on Guest page. Selector IS exclusive.")
        
        browser.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    check_guest_nav()
