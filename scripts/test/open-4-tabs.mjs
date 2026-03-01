import { callAPI } from '../../modules/camo-runtime/src/utils/browser-service.mjs';
import { executeTabPoolOperation } from '../../modules/camo-runtime/src/container/runtime-core/operations/tab-pool.mjs';

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

async function main() {
  const profileId = String(parseArg('profile', 'profile-8')).trim();
  const tabCount = Number.parseInt(parseArg('tab-count', '4'), 10) || 4;
  const openDelayMs = Number.parseInt(parseArg('open-delay-ms', '1000'), 10) || 0;
  const shortcutOnly = parseBool(parseArg('shortcut-only', null), false);
  const apiTimeoutMs = Number.parseInt(parseArg('api-timeout-ms', '15000'), 10) || 15000;
  const navigationTimeoutMs = Number.parseInt(parseArg('navigation-timeout-ms', '25000'), 10) || 25000;
  const tabAppearTimeoutMs = Number.parseInt(parseArg('tab-appear-timeout-ms', '20000'), 10) || 20000;
  const seedOnOpen = parseBool(parseArg('seed-on-open', null), false);

  console.log(JSON.stringify({ event: 'tab_pool.test.start', profileId, tabCount }));
  const before = await listPages(profileId);
  console.log(JSON.stringify({ event: 'tab_pool.pages.before', profileId, before }, null, 2));

  const result = await executeTabPoolOperation({
    profileId,
    action: 'ensure_tab_pool',
    params: {
      tabCount,
      openDelayMs,
      normalizeTabs: false,
      seedOnOpen,
      shortcutOnly,
      apiTimeoutMs,
      navigationTimeoutMs,
      tabAppearTimeoutMs,
    },
    context: {},
  });

  console.log(JSON.stringify({ event: 'tab_pool.ensure.result', result }, null, 2));

  const after = await listPages(profileId);
  console.log(JSON.stringify({ event: 'tab_pool.pages.after', profileId, after }, null, 2));

  if (!result?.ok) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'tab_pool.test.error', message: err?.message || String(err) }));
  process.exitCode = 1;
});
