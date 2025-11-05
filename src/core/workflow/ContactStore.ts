import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const baseDir = join(homedir(), '.webauto', 'chat-history');
const file1688 = join(baseDir, '1688-sent.json');

function ensure() { try { mkdirSync(baseDir, { recursive: true }); } catch {} }
function load(file) { try { if (!existsSync(file)) return { entries: [] }; return JSON.parse(readFileSync(file,'utf8')); } catch { return { entries: [] }; }
function save(file, data) { try { writeFileSync(file, JSON.stringify(data, null, 2)); } catch {} }

export function has1688({ key, uid, offerId, chatUrl }: { key?:string, uid?:string, offerId?:string, chatUrl?:string }) {
  ensure(); const db = load(file1688); const arr = Array.isArray(db.entries) ? db.entries : [];
  return arr.some(e => (key && e.key===key) || (uid && e.uid===uid) || (offerId && e.offerId===offerId) || (chatUrl && e.chatUrl===chatUrl));
}

export function add1688(entry: { key?:string, uid?:string, offerId?:string, chatUrl?:string, extra?:any }) {
  ensure(); const db = load(file1688); const arr = Array.isArray(db.entries) ? db.entries : [];
  const now = Date.now(); const rec = { ...entry, lastSentAt: now };
  arr.push(rec); save(file1688, { entries: arr });
  return rec;
}

export function list1688() {
  ensure(); const db = load(file1688); return Array.isArray(db.entries) ? db.entries : [];
}

export function clear1688() { ensure(); save(file1688, { entries: [] }); return true; }

export function remove1688(criteria: { key?:string, uid?:string, offerId?:string, chatUrl?:string }) {
  ensure(); const db = load(file1688); const arr = Array.isArray(db.entries) ? db.entries : [];
  const idx = arr.findIndex(e => (criteria.key && e.key===criteria.key) || (criteria.uid && e.uid===criteria.uid) || (criteria.offerId && e.offerId===criteria.offerId) || (criteria.chatUrl && e.chatUrl===criteria.chatUrl));
  if (idx >= 0) { arr.splice(idx, 1); save(file1688, { entries: arr }); return true; }
  return false;
}
