import { callAPI } from './modules/camo-runtime/src/autoscript/shared/api-client.mjs';

const PROFILE = 'xhs-qa-1';

async function main() {
  console.log('=== Step 4: Navigate to Follow Page ===');
  await callAPI('goto', { profileId: PROFILE, url: 'https://weibo.com/u/page/follow/1699432410' });
  await new Promise(r => setTimeout(r, 5000));
  
  const urlRes = await callAPI('evaluate', { profileId: PROFILE, script: 'location.href' });
  console.log('Current URL:', urlRes.result);
  
  const titleRes = await callAPI('evaluate', { profileId: PROFILE, script: 'document.title' });
  console.log('Title:', titleRes.result);
  
  console.log('=== Step 5: Find "Special Follow" (特别关注) Tab/Button ===');
  const specialFollow = await callAPI('evaluate', {
    profileId: PROFILE,
    script: `(() => {
      // Find elements containing "特别关注" or "分组"
      const allEls = Array.from(document.querySelectorAll('a, div, span, li'));
      const specialEls = allEls.filter(el => {
        const text = (el.innerText || '').trim();
        return text.includes('特别关注') || text.includes('分组') || text.includes('好友');
      });
      
      return specialEls.slice(0, 15).map(el => ({
        tag: el.tagName,
        text: el.innerText.trim().substring(0, 30),
        href: el.href || null,
        className: el.className?.substring(0, 80),
        onClick: el.onclick ? 'has_onclick' : null
      }));
    })()`
  });
  console.log('Special Follow Elements:', JSON.stringify(specialFollow.result, null, 2));
  
  console.log('=== Step 6: Scan User Cards Structure ===');
  const userCards = await callAPI('evaluate', {
    profileId: PROFILE,
    script: `(() => {
      // Look for user card patterns
      const cards = Array.from(document.querySelectorAll('[class*="user"], [class*="card"], .follow_item, [node-type*="user"]'));
      return cards.slice(0, 10).map(el => ({
        tag: el.tagName,
        className: el.className?.substring(0, 80),
        text: (el.innerText || '').substring(0, 80).replace(/\\n/g, ' '),
        link: el.querySelector('a[href*="/u/"]')?.href || null
      }));
    })()`
  });
  console.log('User Cards:', JSON.stringify(userCards.result, null, 2));
}

main().catch(e => console.error(e));
