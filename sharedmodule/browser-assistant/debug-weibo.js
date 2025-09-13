const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');

async function debug() {
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: true,
    targetDomain: 'weibo.com'
  });
  
  await browserManager.initializeWithAutoLogin('https://weibo.com');
  const page = await browserManager.getCurrentPage();
  
  // Wait for content to load and scroll
  console.log('Waiting for content to load...');
  await page.waitForTimeout(5000);
  
  console.log('Scrolling to load more content...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(3000);
  
  // Get detailed post structure
  const postStructure = await page.evaluate(() => {
    const scrollContainer = document.querySelector('.Scroll_container_280Ky');
    if (!scrollContainer) {
      return { error: 'Scroll_container_280Ky not found' };
    }
    
    const allElements = Array.from(scrollContainer.querySelectorAll('*'));
    const potentialPosts = allElements.filter(el => {
      const textContent = el.textContent.trim();
      return textContent.length > 20 && !el.closest('script') && !el.closest('style');
    });
    
    return {
      scrollContainerChildren: scrollContainer.children.length,
      totalElements: allElements.length,
      potentialPosts: potentialPosts.slice(0, 10).map(el => {
        const textContent = el.textContent.trim();
        return {
          tagName: el.tagName,
          className: el.className,
          textContent: textContent.substring(0, 150),
          hasLinks: el.querySelectorAll('a').length > 0,
          linkCount: el.querySelectorAll('a').length
        };
      })
    };
  });
  
  console.log('Post structure:', JSON.stringify(postStructure, null, 2));
  await browserManager.cleanup();
}

debug().catch(console.error);