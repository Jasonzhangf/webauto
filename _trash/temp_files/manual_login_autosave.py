
import sys
import time
import os
from pathlib import Path
sys.path.insert(0, '.')
from browser_interface.chromium_browser import ChromiumBrowserWrapper

def manual_login_autosave():
    session_name = 'weibo-fresh'
    cookie_file = Path(f'cookies/session_{session_name}.json')
    
    print(f"🚀 Launching Browser for Login (Session: {session_name})...")
    print("ℹ️  Auto-save is ENABLED. Cookies will be saved automatically after you log in.")

    config = {
        'headless': False,
        'auto_overlay': False,
        'auto_session': True, # ENABLE AUTO-SAVE
        'session_name': session_name,
        'profile_id': 'weibo-fresh',
        'timeout': 30.0,
        'viewport': {'width': 1280, 'height': 800}
    }
    
    try:
        browser = ChromiumBrowserWrapper(config)
        page = browser.goto('https://weibo.com')
        
        print("\n👀 Browser is open. Please log in now.")
        print(f"📂 Monitoring cookie file: {cookie_file}")
        
        last_mtime = 0
        if cookie_file.exists():
            last_mtime = cookie_file.stat().st_mtime
            
        # Wait loop
        for i in range(120): # Wait up to 2 minutes
            time.sleep(1)
            if cookie_file.exists():
                current_mtime = cookie_file.stat().st_mtime
                if current_mtime > last_mtime:
                    print(f"✅ [Time {i}s] Cookies SAVED! File updated.")
                    last_mtime = current_mtime
                    # We could exit here, but let's keep it open a bit longer to ensure full load
                    # But user might want to keep browsing.
            
            if i % 10 == 0:
                print(f"⏳ Waiting for login/save... ({i}s)")
                
        print("\n🛑 Time limit reached. Closing browser.")
        browser.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    manual_login_autosave()
