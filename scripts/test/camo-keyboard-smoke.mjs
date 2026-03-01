import { callAPI } from '../../modules/camo-runtime/src/utils/browser-service.mjs';

function parseArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

function parseBool(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

async function listPages(profileId) {
  return callAPI('page:list', { profileId });
}

async function pressKey(profileId, key) {
  return callAPI('keyboard:press', { profileId, key });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const profileId = String(parseArg('profile', 'profile-8')).trim();
  const testCtrlT = parseBool(parseArg('test-ctrl-t', null), true);
  const testEsc = parseBool(parseArg('test-esc', null), true);
  const settleMs = Number.parseInt(parseArg('settle-ms', '800'), 10) || 800;

  console.log(JSON.stringify({ event: 'keyboard.smoke.start', profileId, testCtrlT, testEsc, settleMs }));

  const before = await listPages(profileId);
  console.log(JSON.stringify({ event: 'keyboard.smoke.pages.before', before }, null, 2));

  if (testCtrlT) {
    await pressKey(profileId, 'Control+t');
    await sleep(settleMs);
    const afterCtrlT = await listPages(profileId);
    console.log(JSON.stringify({ event: 'keyboard.smoke.ctrl_t.after', after: afterCtrlT }, null, 2));
  }

  if (testEsc) {
    const escResult = await pressKey(profileId, 'Escape');
    console.log(JSON.stringify({ event: 'keyboard.smoke.esc.result', result: escResult }, null, 2));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'keyboard.smoke.error', message: err?.message || String(err) }));
  process.exitCode = 1;
});
