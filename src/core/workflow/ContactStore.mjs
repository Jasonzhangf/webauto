import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Persistent store for deduping sent contacts on 1688
// Location: ~/.webauto/chat-history/1688-sent.json

const baseDir = join(homedir(), '.webauto', 'chat-history');
const file1688 = join(baseDir, '1688-sent.json');

function ensure() {
  try { mkdirSync(baseDir, { recursive: true }); } catch {}
}

function load(file) {
  try {
    if (!existsSync(file)) return { entries: [] };
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

function save(file, data) {
  try { writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

export function has1688({ key, uid, offerId, chatUrl } = {}) {
  ensure();
  const db = load(file1688);
  const arr = Array.isArray(db.entries) ? db.entries : [];
  return arr.some(e =>
    (key && e.key === key) ||
    (uid && e.uid === uid) ||
    (offerId && e.offerId === offerId) ||
    (chatUrl && e.chatUrl === chatUrl)
  );
}

function normName(s) {
  try {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[·•・·]/g, '')
      .replace(/[“”"'`]/g, '')
      .trim();
  } catch { return String(s || ''); }
}

function tryDecode(s) {
  if (!s) return s;
  let t = String(s);
  for (let i = 0; i < 2; i++) {
    try { t = decodeURIComponent(t); } catch { break; }
  }
  return t;
}

export function has1688Loose({ key, uid, offerId, chatUrl } = {}) {
  ensure();
  const db = load(file1688);
  const arr = Array.isArray(db.entries) ? db.entries : [];
  const keyN = key ? normName(key) : null;
  const uidN = uid ? tryDecode(uid) : null;
  return arr.some(e => {
    const ek = e.key ? normName(e.key) : null;
    const eu = e.uid ? tryDecode(e.uid) : null;
    if (keyN && ek && ek === keyN) return true;
    if (uidN && eu && eu === uidN) return true;
    if (offerId && e.offerId && String(e.offerId) === String(offerId)) return true;
    if (chatUrl && e.chatUrl && e.chatUrl === chatUrl) return true;
    return false;
  });
}

export function add1688(entry = {}) {
  ensure();
  const db = load(file1688);
  const arr = Array.isArray(db.entries) ? db.entries : [];
  const now = Date.now();
  const rec = { ...entry, keyNorm: entry.key ? normName(entry.key) : undefined, uidDecoded: entry.uid ? tryDecode(entry.uid) : undefined, lastSentAt: now };
  arr.push(rec);
  save(file1688, { entries: arr });
  return rec;
}

export function list1688() {
  ensure();
  const db = load(file1688);
  return Array.isArray(db.entries) ? db.entries : [];
}

export function clear1688() {
  ensure();
  save(file1688, { entries: [] });
  return true;
}

export function remove1688(criteria = {}) {
  ensure();
  const db = load(file1688);
  const arr = Array.isArray(db.entries) ? db.entries : [];
  const idx = arr.findIndex(e =>
    (criteria.key && e.key === criteria.key) ||
    (criteria.uid && e.uid === criteria.uid) ||
    (criteria.offerId && e.offerId === criteria.offerId) ||
    (criteria.chatUrl && e.chatUrl === criteria.chatUrl)
  );
  if (idx >= 0) {
    arr.splice(idx, 1);
    save(file1688, { entries: arr });
    return true;
  }
  return false;
}
