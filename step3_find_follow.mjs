import { callAPI } from './modules/camo-runtime/src/autoscript/shared/api-client.mjs';

const PROFILE = 'xhs-qa-1';

async function main() {
  // Ensure we are on the profile page
  await callAPI('goto', { profileId: PROFILE, url: 'https://weibo.com/u/1699432410' });
  await new Promise(r => setTimeout(r, 2000));

  // Find Follow Link
  const res = await callAPI('evaluate', {
    profileId: PROFILE,
    script: `(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/u/1699432410/follow"], a[href*="/follow"]'));
      // Filter for the one that contains the text "关注" or a number
      const followLink = links.find(l => l.textContent.includes('关注'));
      
      // If not found, look for the general pattern in the profile stats
      let statsLink = null;
      if (!followLink) {
         const allLinks = Array.from(document.querySelectorAll('a'));
         statsLink = allLinks.find(l => l.textContent.match(/\\d+\\s*关注/) && l.getAttribute('href')?.includes('follow'));
      }

      const target = followLink || statsLink;
      return target ? {
        found: true,
        href: target.getAttribute('href'),
        text: target.textContent.trim(),
        className: target.className.substring(0, 50)
      } : { found: false };
    })()`
  });

  console.log('=== Step 3: Find Follow Link ===');
  console.log(JSON.stringify(res, null, 2));
}

main().catch(e => console.error(e));
