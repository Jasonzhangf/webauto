import fs from 'node:fs/promises';
import { callAPI } from '../../modules/camo-runtime/src/utils/browser-service.mjs';

const profileId = 'xhs-qa-1';
const targetUrl = 'https://www.xiaohongshu.com/search_result/699e8712000000001a033e9f?xsec_token=ABelrvKUvTL-Ug8vv5DUhcWBoD4vpcuHZSLzc-HFNd-Bw=&xsec_source=';

async function main() {
  await callAPI('goto', { profileId, url: targetUrl });
  await callAPI('evaluate', { profileId, script: `(() => {
    window.__wheelProbe = { wheel: [], click: [], keydown: [], keyup: [] };
    document.addEventListener('wheel', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      window.__wheelProbe.wheel.push({
        x: e.clientX,
        y: e.clientY,
        target: t ? [String(t.tagName || '').toLowerCase(), String(t.className || ''), String(t.id || '')].join('|') : null,
        scrollerTop: document.querySelector('.note-scroller')?.scrollTop ?? null,
      });
    }, { passive: true, capture: true });
    document.addEventListener('click', (e) => {
      window.__wheelProbe.click.push({ x: e.clientX, y: e.clientY });
    }, { capture: true });
    document.addEventListener('keydown', (e) => {
      window.__wheelProbe.keydown.push({ key: e.key });
    }, { capture: true });
    document.addEventListener('keyup', (e) => {
      window.__wheelProbe.keyup.push({ key: e.key });
    }, { capture: true });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width || null,
      visualHeight: window.visualViewport?.height || null,
      dpr: window.devicePixelRatio || 1,
      hasScroller: !!document.querySelector('.note-scroller'),
    };
  })()` });
  await callAPI('mouse:click', { profileId, x: 2564, y: 228, clicks: 1, delay: 30 });
  await callAPI('mouse:wheel', { profileId, deltaY: 420, anchorX: 2564, anchorY: 228 });
  const after = await callAPI('evaluate', { profileId, script: `(() => ({
    probe: window.__wheelProbe,
    scrollerTop: document.querySelector('.note-scroller')?.scrollTop ?? null,
    activeTag: document.activeElement?.tagName || null,
    activeClass: String(document.activeElement?.className || ''),
    commentCount: document.querySelector('.chat-wrapper .count')?.textContent?.trim() || null,
  }))()` });
  await fs.writeFile('/tmp/camo-wheel-probe-result.json', JSON.stringify(after, null, 2));
  console.log(JSON.stringify(after, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
