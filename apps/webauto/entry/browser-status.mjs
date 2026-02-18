#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCamo } from './lib/camo-cli.mjs';

const profileId = String(process.argv[2] || '').trim();
if (!profileId) {
  console.error(JSON.stringify({ ok: false, error: 'missing profileId' }));
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ret = runCamo(['status', profileId, '--json'], { rootDir: ROOT, timeoutMs: 20000 });

if (!ret.ok) {
  console.error(JSON.stringify({ ok: false, code: ret.code, stderr: ret.stderr || ret.stdout }));
  process.exit(1);
}

const session = ret.json?.session || null;
console.log(JSON.stringify({ ok: true, profileId, online: Boolean(session), session }));
