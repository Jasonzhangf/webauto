#!/usr/bin/env node
/**
 * Dump DOM structure for debugging
 */
const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const PROFILE = 'xiaohongshu_fresh';

async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  console.log('🔍 Dumping DOM...');
  const res = await post(`${BROWSER_SERVICE}/command`, {
    action: 'evaluate',
    args: {
      profileId: PROFILE,
      script: `(() => {
        const body = document.body;
        return {
          title: document.title,
          url: location.href,
          bodyClass: body.className,
          hasSearchContainer: !!document.querySelector('.search-result-container'),
          hasFeedList: !!document.querySelector('.feeds-container, .feed-container'),
          hasNoteItem: !!document.querySelector('.note-item'),
          textSample: body.innerText.substring(0, 200)
        };
      })()`
    }
  });
  
  console.log(JSON.stringify(res, null, 2));
}

main();
