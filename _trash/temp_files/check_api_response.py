
import asyncio
import json
from playwright.async_api import async_playwright

async def check_api():
    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = context.pages[0]
            
            print(f"📄 Current URL: {page.url}")
            
            # Evaluate JavaScript to call the API
            result = await page.evaluate("""
                async () => {
                    const url = '/api/v1/containers?url=' + encodeURIComponent(window.location.href);
                    const resp = await fetch(url);
                    const data = await resp.json();
                    return data;
                }
            """)
            
            print("\n📦 API Response:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            
            if result.get('success') and result.get('data', {}).get('containers'):
                containers = result['data']['containers']
                print(f"\n✅ Found {len(containers)} containers")
                print("\n📋 Container IDs:")
                for cid in containers.keys():
                    selector = containers[cid].get('selector', 'N/A')
                    print(f"   - {cid}: {selector}")
            
            await browser.close()
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_api())
