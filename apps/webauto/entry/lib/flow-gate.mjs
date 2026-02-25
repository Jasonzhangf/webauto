import { existsSync } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function toInt(value, fallback, min = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

function normalizePathForPlatform(raw, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

function normalizeLegacyWebautoRoot(raw, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(raw, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  if (base === '.webauto' || base === 'webauto') return resolved;
  return pathApi.join(resolved, '.webauto');
}

export function resolveWebautoHome(options = {}) {
  const env = options.env || process.env;
  const platform = String(options.platform || process.platform);
  const homeDir = String(options.homeDir || os.homedir());
  const pathApi = platform === 'win32' ? path.win32 : path;
  const explicitHome = String(env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome, platform);
  const legacyRoot = String(env.WEBAUTO_ROOT || env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot, platform);
  const hasDDrive = typeof options.hasDDrive === 'boolean'
    ? options.hasDDrive
    : (platform === 'win32' && existsSync('D:\\'));
  if (platform === 'win32') return hasDDrive ? 'D:\\webauto' : pathApi.join(homeDir, '.webauto');
  return pathApi.join(homeDir, '.webauto');
}

const DEFAULT_PLATFORM_GATES = Object.freeze({
  xiaohongshu: {
    throttle: { minMs: 900, maxMs: 1800 },
    noteInterval: { minMs: 2200, maxMs: 4200 },
    tabPool: { tabCount: 1, openDelayMinMs: 1400, openDelayMaxMs: 2800 },
    submitSearch: {
      method: 'click',
      actionDelayMinMs: 180,
      actionDelayMaxMs: 620,
      settleMinMs: 1200,
      settleMaxMs: 2600,
    },
    openDetail: {
      preClickMinMs: 700,
      preClickMaxMs: 2200,
      pollDelayMinMs: 260,
      pollDelayMaxMs: 700,
      postOpenMinMs: 5000,
      postOpenMaxMs: 10000,
    },
    commentsHarvest: {
      scrollStepMin: 280,
      scrollStepMax: 420,
      settleMinMs: 280,
      settleMaxMs: 820,
    },
    pacing: {
      defaultOperationMinIntervalMs: 1200,
      defaultEventCooldownMs: 700,
      defaultJitterMs: 900,
      navigationMinIntervalMs: 2200,
    },
  },
  weibo: {
    throttle: { minMs: 800, maxMs: 1600 },
    noteInterval: { minMs: 1800, maxMs: 3600 },
    tabPool: { tabCount: 1, openDelayMinMs: 1200, openDelayMaxMs: 2400 },
    submitSearch: {
      method: 'click',
      actionDelayMinMs: 160,
      actionDelayMaxMs: 560,
      settleMinMs: 900,
      settleMaxMs: 2200,
    },
    openDetail: {
      preClickMinMs: 180,
      preClickMaxMs: 640,
      pollDelayMinMs: 120,
      pollDelayMaxMs: 300,
      postOpenMinMs: 380,
      postOpenMaxMs: 980,
    },
    commentsHarvest: {
      scrollStepMin: 260,
      scrollStepMax: 380,
      settleMinMs: 260,
      settleMaxMs: 760,
    },
    pacing: {
      defaultOperationMinIntervalMs: 1000,
      defaultEventCooldownMs: 600,
      defaultJitterMs: 800,
      navigationMinIntervalMs: 2000,
    },
  },
  '1688': {
    throttle: { minMs: 800, maxMs: 1500 },
    noteInterval: { minMs: 1800, maxMs: 3200 },
    tabPool: { tabCount: 1, openDelayMinMs: 1200, openDelayMaxMs: 2200 },
    submitSearch: {
      method: 'click',
      actionDelayMinMs: 140,
      actionDelayMaxMs: 520,
      settleMinMs: 900,
      settleMaxMs: 2000,
    },
    openDetail: {
      preClickMinMs: 180,
      preClickMaxMs: 620,
      pollDelayMinMs: 120,
      pollDelayMaxMs: 280,
      postOpenMinMs: 320,
      postOpenMaxMs: 920,
    },
    commentsHarvest: {
      scrollStepMin: 260,
      scrollStepMax: 360,
      settleMinMs: 240,
      settleMaxMs: 700,
    },
    pacing: {
      defaultOperationMinIntervalMs: 900,
      defaultEventCooldownMs: 500,
      defaultJitterMs: 700,
      navigationMinIntervalMs: 1800,
    },
  },
});

function cloneDefaultPlatformGate(platform) {
  const key = String(platform || '').trim().toLowerCase() || 'xiaohongshu';
  const fallback = DEFAULT_PLATFORM_GATES[key] || DEFAULT_PLATFORM_GATES.xiaohongshu;
  return JSON.parse(JSON.stringify(fallback));
}

function normalizeMethod(value, fallback = 'click') {
  const method = String(value || '').trim().toLowerCase();
  if (['click', 'enter', 'form'].includes(method)) return method;
  return fallback;
}

function normalizeMinMax(input, defaults, minFloor = 0) {
  const fallbackMin = toInt(defaults?.minMs, minFloor, minFloor);
  const fallbackMax = Math.max(fallbackMin, toInt(defaults?.maxMs, fallbackMin, fallbackMin));
  const minMs = toInt(input?.minMs, fallbackMin, minFloor);
  const maxMs = Math.max(minMs, toInt(input?.maxMs, fallbackMax, minMs));
  return { minMs, maxMs };
}

function normalizePlatformGate(rawGate = {}, defaults = cloneDefaultPlatformGate('xiaohongshu')) {
  const gate = rawGate && typeof rawGate === 'object' ? rawGate : {};
  const out = {
    throttle: normalizeMinMax(gate.throttle, defaults.throttle, 100),
    noteInterval: normalizeMinMax(gate.noteInterval, defaults.noteInterval, 200),
    tabPool: {
      tabCount: toInt(gate?.tabPool?.tabCount, toInt(defaults?.tabPool?.tabCount, 1, 1), 1),
      openDelayMinMs: 0,
      openDelayMaxMs: 0,
    },
    submitSearch: {
      method: normalizeMethod(gate?.submitSearch?.method, normalizeMethod(defaults?.submitSearch?.method, 'click')),
      actionDelayMinMs: 0,
      actionDelayMaxMs: 0,
      settleMinMs: 0,
      settleMaxMs: 0,
    },
    openDetail: {
      preClickMinMs: 0,
      preClickMaxMs: 0,
      pollDelayMinMs: 0,
      pollDelayMaxMs: 0,
      postOpenMinMs: 0,
      postOpenMaxMs: 0,
    },
    commentsHarvest: {
      scrollStepMin: 0,
      scrollStepMax: 0,
      settleMinMs: 0,
      settleMaxMs: 0,
    },
    pacing: {
      defaultOperationMinIntervalMs: 0,
      defaultEventCooldownMs: 0,
      defaultJitterMs: 0,
      navigationMinIntervalMs: 0,
    },
  };

  const tabDelay = normalizeMinMax(
    {
      minMs: gate?.tabPool?.openDelayMinMs,
      maxMs: gate?.tabPool?.openDelayMaxMs,
    },
    {
      minMs: defaults?.tabPool?.openDelayMinMs,
      maxMs: defaults?.tabPool?.openDelayMaxMs,
    },
    0,
  );
  out.tabPool.openDelayMinMs = tabDelay.minMs;
  out.tabPool.openDelayMaxMs = tabDelay.maxMs;

  const submitActionDelay = normalizeMinMax(
    {
      minMs: gate?.submitSearch?.actionDelayMinMs,
      maxMs: gate?.submitSearch?.actionDelayMaxMs,
    },
    {
      minMs: defaults?.submitSearch?.actionDelayMinMs,
      maxMs: defaults?.submitSearch?.actionDelayMaxMs,
    },
    20,
  );
  out.submitSearch.actionDelayMinMs = submitActionDelay.minMs;
  out.submitSearch.actionDelayMaxMs = submitActionDelay.maxMs;

  const submitSettle = normalizeMinMax(
    {
      minMs: gate?.submitSearch?.settleMinMs,
      maxMs: gate?.submitSearch?.settleMaxMs,
    },
    {
      minMs: defaults?.submitSearch?.settleMinMs,
      maxMs: defaults?.submitSearch?.settleMaxMs,
    },
    60,
  );
  out.submitSearch.settleMinMs = submitSettle.minMs;
  out.submitSearch.settleMaxMs = submitSettle.maxMs;

  const openDetailPreClick = normalizeMinMax(
    {
      minMs: gate?.openDetail?.preClickMinMs,
      maxMs: gate?.openDetail?.preClickMaxMs,
    },
    {
      minMs: defaults?.openDetail?.preClickMinMs,
      maxMs: defaults?.openDetail?.preClickMaxMs,
    },
    60,
  );
  out.openDetail.preClickMinMs = openDetailPreClick.minMs;
  out.openDetail.preClickMaxMs = openDetailPreClick.maxMs;

  const openDetailPoll = normalizeMinMax(
    {
      minMs: gate?.openDetail?.pollDelayMinMs,
      maxMs: gate?.openDetail?.pollDelayMaxMs,
    },
    {
      minMs: defaults?.openDetail?.pollDelayMinMs,
      maxMs: defaults?.openDetail?.pollDelayMaxMs,
    },
    80,
  );
  out.openDetail.pollDelayMinMs = openDetailPoll.minMs;
  out.openDetail.pollDelayMaxMs = openDetailPoll.maxMs;

  const openDetailPost = normalizeMinMax(
    {
      minMs: gate?.openDetail?.postOpenMinMs,
      maxMs: gate?.openDetail?.postOpenMaxMs,
    },
    {
      minMs: defaults?.openDetail?.postOpenMinMs,
      maxMs: defaults?.openDetail?.postOpenMaxMs,
    },
    120,
  );
  out.openDetail.postOpenMinMs = openDetailPost.minMs;
  out.openDetail.postOpenMaxMs = openDetailPost.maxMs;

  const commentsScrollStep = normalizeMinMax(
    {
      minMs: gate?.commentsHarvest?.scrollStepMin,
      maxMs: gate?.commentsHarvest?.scrollStepMax,
    },
    {
      minMs: defaults?.commentsHarvest?.scrollStepMin,
      maxMs: defaults?.commentsHarvest?.scrollStepMax,
    },
    120,
  );
  out.commentsHarvest.scrollStepMin = commentsScrollStep.minMs;
  out.commentsHarvest.scrollStepMax = commentsScrollStep.maxMs;

  const commentsSettle = normalizeMinMax(
    {
      minMs: gate?.commentsHarvest?.settleMinMs,
      maxMs: gate?.commentsHarvest?.settleMaxMs,
    },
    {
      minMs: defaults?.commentsHarvest?.settleMinMs,
      maxMs: defaults?.commentsHarvest?.settleMaxMs,
    },
    80,
  );
  out.commentsHarvest.settleMinMs = commentsSettle.minMs;
  out.commentsHarvest.settleMaxMs = commentsSettle.maxMs;

  out.pacing.defaultOperationMinIntervalMs = toInt(
    gate?.pacing?.defaultOperationMinIntervalMs,
    toInt(defaults?.pacing?.defaultOperationMinIntervalMs, 700, 0),
    0,
  );
  out.pacing.defaultEventCooldownMs = toInt(
    gate?.pacing?.defaultEventCooldownMs,
    toInt(defaults?.pacing?.defaultEventCooldownMs, 300, 0),
    0,
  );
  out.pacing.defaultJitterMs = toInt(
    gate?.pacing?.defaultJitterMs,
    toInt(defaults?.pacing?.defaultJitterMs, 220, 0),
    0,
  );
  out.pacing.navigationMinIntervalMs = toInt(
    gate?.pacing?.navigationMinIntervalMs,
    toInt(defaults?.pacing?.navigationMinIntervalMs, 1800, 0),
    0,
  );

  return out;
}

function normalizePlatformKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'xiaohongshu';
  if (key === 'xhs') return 'xiaohongshu';
  return key;
}

function buildDefaultDoc() {
  return {
    version: 1,
    updatedAt: nowIso(),
    platforms: {
      xiaohongshu: cloneDefaultPlatformGate('xiaohongshu'),
      weibo: cloneDefaultPlatformGate('weibo'),
      '1688': cloneDefaultPlatformGate('1688'),
    },
  };
}

export function resolveFlowGatePath(options = {}) {
  const home = resolveWebautoHome(options);
  return path.join(home, 'config', 'flow-gates.json');
}

function normalizeDoc(raw) {
  const base = buildDefaultDoc();
  const input = raw && typeof raw === 'object' ? raw : {};
  const sourcePlatforms = input.platforms && typeof input.platforms === 'object' ? input.platforms : {};
  const platforms = {};
  for (const key of Object.keys(base.platforms)) {
    const normalizedKey = normalizePlatformKey(key);
    const defaults = cloneDefaultPlatformGate(normalizedKey);
    platforms[normalizedKey] = normalizePlatformGate(sourcePlatforms[normalizedKey], defaults);
  }
  for (const [rawKey, rawGate] of Object.entries(sourcePlatforms)) {
    const key = normalizePlatformKey(rawKey);
    if (platforms[key]) continue;
    const defaults = cloneDefaultPlatformGate(key);
    platforms[key] = normalizePlatformGate(rawGate, defaults);
  }
  return {
    version: 1,
    updatedAt: String(input.updatedAt || nowIso()),
    platforms,
  };
}

export async function loadFlowGateDoc(options = {}) {
  const filePath = resolveFlowGatePath(options);
  let parsed = null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed && options.ensure !== false) {
    const seeded = buildDefaultDoc();
    await saveFlowGateDoc(seeded, options);
    return normalizeDoc(seeded);
  }
  return normalizeDoc(parsed);
}

export async function saveFlowGateDoc(doc, options = {}) {
  const filePath = resolveFlowGatePath(options);
  const normalized = normalizeDoc(doc);
  const payload = {
    ...normalized,
    updatedAt: nowIso(),
  };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export async function resolvePlatformFlowGate(platform, options = {}) {
  const key = normalizePlatformKey(platform);
  const doc = await loadFlowGateDoc(options);
  const defaults = cloneDefaultPlatformGate(key);
  return normalizePlatformGate(doc.platforms[key], defaults);
}

function deepMerge(base, patch) {
  const left = base && typeof base === 'object' ? base : {};
  const right = patch && typeof patch === 'object' ? patch : {};
  const out = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && left[key]
      && typeof left[key] === 'object'
      && !Array.isArray(left[key])
    ) {
      out[key] = deepMerge(left[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function patchPlatformFlowGate(platform, patch, options = {}) {
  const key = normalizePlatformKey(platform);
  const doc = await loadFlowGateDoc(options);
  const current = doc.platforms[key] || cloneDefaultPlatformGate(key);
  doc.platforms[key] = deepMerge(current, patch || {});
  const saved = await saveFlowGateDoc(doc, options);
  return saved.platforms[key];
}

export async function resetPlatformFlowGate(platform, options = {}) {
  const key = normalizePlatformKey(platform);
  const doc = await loadFlowGateDoc(options);
  doc.platforms[key] = cloneDefaultPlatformGate(key);
  const saved = await saveFlowGateDoc(doc, options);
  return saved.platforms[key];
}

export async function listPlatformFlowGates(options = {}) {
  const doc = await loadFlowGateDoc(options);
  return doc.platforms;
}
