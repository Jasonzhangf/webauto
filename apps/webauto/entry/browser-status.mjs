#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const profileId = String(process.argv[2] || '').trim();
if (!profileId) {
  console.error(JSON.stringify({ ok: false, error: 'missing profileId' }));
  process.exit(1);
}

const cliPath = path.resolve(process.cwd(), 'bin', 'camoufox-cli.mjs');
const ret = spawnSync(process.execPath, [cliPath, 'status', profileId], { encoding: 'utf8' });
const stdout = String(ret.stdout || '').trim();
const stderr = String(ret.stderr || '').trim();
let parsed = null;
try { parsed = stdout ? JSON.parse(stdout) : null; } catch {}

if (ret.status !== 0) {
  console.error(JSON.stringify({ ok: false, code: ret.status, stderr: stderr || stdout }));
  process.exit(1);
}

const session = parsed?.session || null;
console.log(JSON.stringify({ ok: true, profileId, online: Boolean(session), session }));
