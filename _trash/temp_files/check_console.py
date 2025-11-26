
import asyncio
from playwright.async_api import async_playwright

async def check_console_errors():
    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = context.pages[0]
            
            print(f"📄 Current URL: {page.url}\n")
            
            # Get console messages
            messages = []
            
            def on_console(msg):
                messages.append({
                    'type': msg.type,
                    'text': msg.text
                })
            
            page.on('console', on_console)
            
            # Reload to capture console messages
            print("🔄 Reloading page to capture console...")
            await page.reload()
            await asyncio.sleep(3)
            
            print("\n📝 Console Messages:")
            if not messages:
                print("   No messages captured")
            else:
                for msg in messages[:20]:  # Show first 20
                    icon = "❌" if msg['type'] == 'error' else "⚠️" if msg['type'] == 'warning' else "ℹ️"
                    print(f"   {icon} [{msg['type']}] {msg['text'][:100]}")
            
            await browser.close()
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_console_errors())
