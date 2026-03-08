import { callAPI } from '../../modules/camo-runtime/src/utils/browser-service.mjs';

const profileId = 'xhs-qa-1';

async function main() {
  await callAPI('evaluate', { profileId, script: `(() => {
    window.__inputProbe = { move: [], click: [], wheel: [] };
    document.addEventListener('mousemove', (e) => {
      window.__inputProbe.move.push({ x: e.clientX, y: e.clientY });
    }, { capture: true });
    document.addEventListener('click', (e) => {
      window.__inputProbe.click.push({ x: e.clientX, y: e.clientY });
    }, { capture: true });
    document.addEventListener('wheel', (e) => {
      window.__inputProbe.wheel.push({ x: e.clientX, y: e.clientY });
    }, { capture: true, passive: true });
    return { ok: true };
  })()` });
  await callAPI('mouse:click', { profileId, x: 2564, y: 228, clicks: 1, delay: 30 });
  await callAPI('mouse:wheel', { profileId, deltaY: 120, anchorX: 2564, anchorY: 228 });
  const result = await callAPI('evaluate', { profileId, script: 'window.__inputProbe' });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
