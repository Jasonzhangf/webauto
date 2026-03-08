import { callAPI } from '../../modules/camo-runtime/src/utils/browser-service.mjs';

const profileId = 'xhs-qa-1';
const targetUrl = 'https://www.xiaohongshu.com/search_result/699e8712000000001a033e9f?xsec_token=ABelrvKUvTL-Ug8vv5DUhcWBoD4vpcuHZSLzc-HFNd-Bw=&xsec_source=';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await callAPI('goto', { profileId, url: targetUrl });
  await sleep(5000);
  const prep = await callAPI('evaluate', { profileId, script: `(() => {
    const chat = document.querySelector('.chat-wrapper');
    const total = document.querySelector('.total');
    const scroller = document.querySelector('.note-scroller');
    const rect = (el) => el?.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return {
      chatRect: rect(chat),
      totalRect: rect(total),
      scrollerRect: rect(scroller),
      before: scroller?.scrollTop ?? null,
      commentCount: document.querySelector('.chat-wrapper .count')?.textContent?.trim() || null,
    };
  })()` });
  const chatRect = prep?.result?.chatRect;
  const totalRect = prep?.result?.totalRect;
  if (chatRect) {
    await callAPI('mouse:click', {
      profileId,
      x: Math.round(chatRect.left + chatRect.width / 2),
      y: Math.round(chatRect.top + chatRect.height / 2),
      clicks: 1,
      delay: 30,
    });
    await sleep(1000);
  }
  if (totalRect) {
    await callAPI('mouse:click', {
      profileId,
      x: Math.round(totalRect.left + totalRect.width / 2),
      y: Math.round(totalRect.top + totalRect.height / 2),
      clicks: 1,
      delay: 30,
    });
    await sleep(1000);
  }
  const anchor = await callAPI('evaluate', { profileId, script: `(() => {
    const total = document.querySelector('.total');
    const item = document.querySelector('.comment-item');
    const scroller = document.querySelector('.note-scroller');
    const target = item || total || scroller;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return {
      x: Math.round(rect.left + Math.max(8, rect.width * 0.5)),
      y: Math.round(rect.top + Math.max(8, Math.min(rect.height - 8, rect.height * 0.5))),
      before: scroller?.scrollTop ?? null,
      targetClass: target.className || null,
      scrollerClass: scroller?.className || null,
    };
  })()` });
  if (!anchor?.result) throw new Error('no comment anchor');
  await callAPI('mouse:click', { profileId, x: anchor.result.x, y: anchor.result.y, clicks: 1, delay: 30 });
  await sleep(500);
  await callAPI('mouse:wheel', { profileId, deltaY: 420, anchorX: anchor.result.x, anchorY: anchor.result.y });
  await sleep(1200);
  const after = await callAPI('evaluate', { profileId, script: `(() => ({
    after: document.querySelector('.note-scroller')?.scrollTop ?? null,
    totalText: document.querySelector('.total')?.textContent?.trim() || null,
    commentCount: document.querySelector('.chat-wrapper .count')?.textContent?.trim() || null,
    activeTag: document.activeElement?.tagName || null,
    activeClass: String(document.activeElement?.className || ''),
    anchorTarget: document.elementFromPoint(${anchor.result.x}, ${anchor.result.y})?.className || null,
  }))()` });
  console.log(JSON.stringify({ prep, anchor: anchor.result, after }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
