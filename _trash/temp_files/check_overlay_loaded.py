
import asyncio
from playwright.async_api import async_playwright

async def check_overlay():
    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = context.pages[0]
            
            print(f"📄 Current URL: {page.url}")
            
            # Check if overlay globals are loaded
            result = await page.evaluate("""
                () => {
                    return {
                        hasWaOverlay: typeof window.__waOverlay !== 'undefined',
                        hasWaPanel: typeof window.__waPanel !== 'undefined',
                        waOverlayKeys: window.__waOverlay ? Object.keys(window.__waOverlay) : [],
                        panelVisible: document.querySelector('.wa-overlay-panel') !== null,
                        panelDisplay: document.querySelector('.wa-overlay-panel')?.style?.display || 'N/A'
                    };
                }
            """)
            
            print("\n🎛 Overlay Status:")
            print(f"   __waOverlay loaded: {result['hasWaOverlay']}")
            print(f"   __waPanel loaded: {result['hasWaPanel']}")
            if result['waOverlayKeys']:
                print(f"   Overlay keys: {result['waOverlayKeys']}")
            print(f"   Panel element exists: {result['panelVisible']}")
            print(f"   Panel display: {result['panelDisplay']}")
            
            await browser.close()
            
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_overlay())
