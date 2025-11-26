
import asyncio
import json
from playwright.async_api import async_playwright

async def debug_selector():
    async with async_playwright() as p:
        try:
            # Connect to the running browser via CDP
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = context.pages[0]
            
            print(f"📄 Current URL: {page.url}")
            print(f"📄 Current Title: {await page.title()}")
            
            # Test Selectors
            selectors = [
                "body:not(:has(.LoginCard_wrap_18dK4))",
                "body:not(:has(.LoginCard_wrap_18dK4)) [class*='Nav_wrap']",
                "body:not(:has(.LoginCard_wrap_18dK4)) .woo-panel-main",
                ".LoginCard_wrap_18dK4",
                "[class*='Nav_wrap']"
            ]
            
            print("\n🔍 Selector Check:")
            for sel in selectors:
                try:
                    count = await page.locator(sel).count()
                    print(f"   '{sel}': {count} matches")
                except Exception as e:
                    print(f"   '{sel}': ❌ Error - {e}")
            
            await browser.close()
            
        except Exception as e:
            print(f"❌ Failed to connect or debug: {e}")

if __name__ == "__main__":
    asyncio.run(debug_selector())
