#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureServicesHealthy } from './lib/recovery.mjs';

ensureUtf8Console();

const argv = process.argv.slice(2);
const profileIdx = argv.indexOf('--profile');
const profile = (profileIdx >= 0 ? argv[profileIdx + 1] : '') || 'xiaohongshu_fresh';

await ensureServicesHealthy();

const mod = await import('../../dist/modules/xiaohongshu/app/src/utils/checkpoints.js');
const { detectXhsCheckpoint } = mod;

const result = await detectXhsCheckpoint({ sessionId: profile });
console.log(JSON.stringify(result, null, 2));

const hardStops = new Set(['risk_control', 'login_guard', 'offsite', 'unknown']);
if (hardStops.has(result?.checkpoint)) {
  process.exit(2);
}
