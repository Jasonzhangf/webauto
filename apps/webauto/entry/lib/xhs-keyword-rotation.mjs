import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COLLECT_KEYWORDS } from './xhs-collect-keywords.mjs';
import { nowIso, parseBool, parseIntFlag } from './xhs-unified-blocks.mjs';

const STATE_PATH = path.join(os.homedir(), '.webauto', 'state', 'keyword-rotation.json');
const LOG_PATH = path.join(os.homedir(), '.webauto', 'state', 'keyword-rotation.log.jsonl');
const DEFAULT_LIMIT = 2;
const MAX_HISTORY = 50;

function normalizeKeywords(list = []) {
  const items = Array.isArray(list)
    ? list.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return Array.from(new Set(items));
}

function parseKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeKeywords(raw);
  const text = String(raw || '').trim();
  if (!text) return [];
  return normalizeKeywords(text.split(',').map((item) => item.trim()));
}

function hashList(list = []) {
  return normalizeKeywords(list).join('|');
}

async function loadState() {
  try {
    const raw = await fsp.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    // ignore
  }
  return { version: 1, updatedAt: nowIso(), records: {} };
}

async function writeState(state) {
  const payload = state && typeof state === 'object'
    ? state
    : { version: 1, updatedAt: nowIso(), records: {} };
  payload.version = payload.version || 1;
  payload.updatedAt = nowIso();
  await fsp.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fsp.writeFile(STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function appendRotationLog(entry) {
  try {
    await fsp.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fsp.appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // ignore
  }
}

function buildRotationList({ keyword, keywordsArg, rotateEnabled }) {
  const providedList = parseKeywords(keywordsArg);
  if (providedList.length > 0) return { list: providedList, source: 'keywords' };
  const primary = String(keyword || '').trim();
  if (!rotateEnabled) return { list: primary ? [primary] : [], source: 'keyword' };
  const fallback = normalizeKeywords(COLLECT_KEYWORDS);
  if (primary) {
    const filtered = fallback.filter((item) => item !== primary);
    return { list: [primary, ...filtered], source: 'keyword+fallback' };
  }
  return { list: fallback, source: 'fallback' };
}

export async function resolveRotatedKeyword(argv = {}, options = {}) {
  const rotateEnabled = parseBool(argv['keyword-rotate'], false);
  const rotateLimit = parseIntFlag(argv['keyword-rotate-limit'], DEFAULT_LIMIT, 1);
  const keywordArg = String(argv.keyword || argv.k || '').trim();
  const requireKeyword = options.requireKeyword !== false;
  const hasKeywordInput = Boolean(keywordArg || (argv.keywords && String(argv.keywords).trim()));
  if (requireKeyword && !hasKeywordInput) {
    return { keyword: '', list: [], source: 'missing', event: { event: 'xhs.unified.keyword_rotation_empty', ok: false } };
  }
  const { list, source } = buildRotationList({
    keyword: keywordArg,
    keywordsArg: argv.keywords,
    rotateEnabled,
  });
  const normalizedList = normalizeKeywords(list);
  if (normalizedList.length === 0) {
    return { keyword: '', list: [], source, event: { event: 'xhs.unified.keyword_rotation_empty', ok: false } };
  }

  const state = await loadState();
  const records = state.records || {};
  const recordKey = String(options.recordKey || 'xiaohongshu').trim() || 'xiaohongshu';
  const listHash = hashList(normalizedList);
  let record = records[recordKey];
  if (!record || record.listHash !== listHash) {
    record = {
      listHash,
      index: 0,
      lastKeyword: null,
      consecutiveCount: 0,
      rotateLimit,
    };
  }

  let index = Number(record.index || 0) || 0;
  if (index < 0 || index >= normalizedList.length) index = 0;
  let keyword = normalizedList[index] || normalizedList[0];
  if (record.lastKeyword === keyword && Number(record.consecutiveCount || 0) >= rotateLimit && normalizedList.length > 1) {
    index = (index + 1) % normalizedList.length;
    keyword = normalizedList[index] || normalizedList[0];
    record.consecutiveCount = 0;
  }
  if (record.lastKeyword === keyword) {
    record.consecutiveCount = Number(record.consecutiveCount || 0) + 1;
  } else {
    record.lastKeyword = keyword;
    record.consecutiveCount = 1;
  }
  const history = Array.isArray(record.history) ? record.history.slice(0) : [];
  history.unshift({
    keyword,
    ts: nowIso(),
    source,
    listHash,
  });
  record.history = history.slice(0, MAX_HISTORY);
  record.index = index;
  record.listHash = listHash;
  record.rotateLimit = rotateLimit;
  records[recordKey] = record;
  state.records = records;
  await writeState(state);

  await appendRotationLog({
    event: 'xhs.unified.keyword_rotation',
    ts: nowIso(),
    recordKey,
    keyword,
    listSize: normalizedList.length,
    source,
    rotateLimit,
    consecutiveCount: record.consecutiveCount,
  });

  return {
    keyword,
    list: normalizedList,
    source,
    record,
    event: {
      event: 'xhs.unified.keyword_rotation',
      ok: true,
      keyword,
      listSize: normalizedList.length,
      source,
      rotateLimit,
      consecutiveCount: record.consecutiveCount,
      historyCount: record.history?.length || 0,
    },
  };
}
