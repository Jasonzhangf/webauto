#!/usr/bin/env node
/**
 * Normalize cookie files under ~/.webauto/cookies to the unified array format accepted by Playwright addCookies()
 * - Input formats supported:
 *   1) Array of cookie objects
 *   2) Object with { cookies: [...] }
 *   3) Chrome/DevTools-like exports with keys like expirationDate/expiry
 * - Output format:
 *   [ { name, value, domain, path, expires, httpOnly, secure, sameSite } ]
 *
 * Usage:
 *   node scripts/tools/normalize-cookies.mjs [--dir=~/.webauto/cookies] [--dry-run=false] [--backup=true]
 */

import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';

function arg(k, def) {
  const a = process.argv.find(x => x.startsWith(`--${k}=`));
  if (!a) return def;
  const v = a.slice(k.length + 3);
  if (v === 'true') return true; if (v === 'false') return false; return v;
}

const dir = arg('dir', join(homedir(), '.webauto', 'cookies'));
const dry = !!arg('dry-run', false);
const backup = arg('backup', true) !== false;

function sameSiteNormalize(v) {
  if (!v) return undefined;
  const s = String(v).toLowerCase();
  if (s === 'no_restriction' || s === 'none') return 'None';
  if (s === 'lax') return 'Lax';
  if (s === 'strict') return 'Strict';
  return undefined;
}

function inferDomainFromFilename(file) {
  try {
    const name = basename(file).replace(/\.json$/i, '');
    if (name && name.includes('.')) return name;
  } catch {}
  return undefined;
}

function toSecondsEpoch(v) {
  if (!v && v !== 0) return undefined;
  const num = Number(v);
  if (!isFinite(num)) return undefined;
  // Heuristic: Chrome exports expirationDate in seconds already; sometimes millis
  if (num > 1e12) return Math.round(num / 1000);
  return Math.round(num);
}

function normalizeCookie(c, file) {
  if (!c) return null;
  const out = {};
  out.name = c.name || c.Name || c.key;
  out.value = c.value || c.Value;
  out.domain = c.domain || c.Domain || c.host || inferDomainFromFilename(file);
  out.path = c.path || c.Path || '/';
  const exp = c.expires ?? c.expiry ?? c.expirationDate ?? c.ExpirationDate;
  const expSec = toSecondsEpoch(exp);
  if (expSec && expSec > 0) out.expires = expSec; // omit if no expiry → session cookie
  out.httpOnly = !!(c.httpOnly ?? c.HttpOnly);
  out.secure = !!(c.secure ?? c.Secure);
  out.sameSite = sameSiteNormalize(c.sameSite || c.SameSite);
  // Filter out invalid
  if (!out.name || out.value === undefined || !out.domain) return null;
  return out;
}

function loadAsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.cookies)) return raw.cookies;
  return null;
}

function backupFile(path) {
  try {
    const backupDir = join(dir, 'backup');
    mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = basename(path);
    copyFileSync(path, join(backupDir, `${base}.${ts}.bak`));
  } catch {}
}

function processFile(path) {
  try {
    const rawText = readFileSync(path, 'utf8');
    let raw;
    try { raw = JSON.parse(rawText); } catch { console.log('! skip (invalid json):', path); return { changed:false }; }
    const arr = loadAsArray(raw);
    let src = Array.isArray(arr) ? arr : (Array.isArray(raw?.cookies) ? raw.cookies : []);
    if (!Array.isArray(src) || src.length === 0) {
      console.log('= keep (no cookies):', path);
      return { changed:false };
    }
    const normalized = src.map(c => normalizeCookie(c, path)).filter(Boolean);
    if (normalized.length === 0) {
      console.log('= keep (normalized empty):', path);
      return { changed:false };
    }
    // Only write if different shape
    const alreadyArray = Array.isArray(raw) && raw.every(v => v && typeof v.name === 'string' && v.value !== undefined);
    if (alreadyArray && raw.length === normalized.length) {
      // Assume up-to-date
      console.log('= keep (already unified):', path);
      return { changed:false };
    }
    if (!dry) {
      if (backup) backupFile(path);
      writeFileSync(path, JSON.stringify(normalized, null, 2));
    }
    console.log('* normalized:', path, `(count=${normalized.length})`);
    return { changed:true, count: normalized.length };
  } catch (e) {
    console.log('! error:', path, e.message);
    return { changed:false };
  }
}

function main() {
  if (!existsSync(dir)) {
    console.error('Cookies dir not found:', dir);
    process.exit(1);
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => join(dir, f));
  let changed = 0, total = 0;
  for (const f of files) {
    try { if (statSync(f).isFile()) { total++; const r = processFile(f); if (r.changed) changed++; } } catch {}
  }
  console.log(`Done. Processed ${total} file(s), normalized ${changed}.`);
}

main();
