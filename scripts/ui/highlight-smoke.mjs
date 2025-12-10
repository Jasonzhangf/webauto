import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...options.env } });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function getHighlightLogEntries(sinceMs = 0) {
  const logPath = path.join(os.homedir(), '.webauto', 'logs', 'highlight-debug.log');
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const raw = fs.readFileSync(logPath, 'utf-8').trim();
  if (!raw) return [];
  return raw
    .split(/\n+/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => {
      if (!sinceMs) return true;
      const ts = Date.parse(entry.ts || entry.timestamp || '');
      return Number.isFinite(ts) ? ts >= sinceMs : true;
    });
}

async function highlightSmoke(profileId, selector) {
  console.log('[highlight-smoke] highlight', { profileId, selector });
  await run(process.execPath, ['scripts/ui/send-highlight-cli.mjs', '--profile', profileId, '--selector', selector]);
}

async function clearHighlight(profileId) {
  console.log('[highlight-smoke] clear', { profileId });
  await run(process.execPath, ['scripts/ui/send-highlight-cli.mjs', '--profile', profileId, '--clear']);
}

function assertHighlightLoop(entries, profileId) {
  const requests = entries.filter((entry) => entry.event === 'request' && entry.sessionId === profileId);
  const results = entries.filter((entry) => entry.event === 'result' && entry.sessionId === profileId);
  const clears = entries.filter((entry) => entry.event === 'clear' && entry.sessionId === profileId);
  if (!requests.length) {
    throw new Error('highlight log missing request entry');
  }
  if (!results.length) {
    throw new Error('highlight log missing result entry');
  }
  const lastResult = results[results.length - 1];
  const count = Number(lastResult.count || lastResult.details?.count || 0);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`highlight log count invalid: ${count}`);
  }
  if (!clears.length) {
    throw new Error('highlight log missing clear entry');
  }
}

async function main() {
  const profile = process.argv[2] || 'weibo-fresh';
  const selector = process.argv[3] || '#app';
  const startTs = Date.now();
  await highlightSmoke(profile, selector);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await clearHighlight(profile);
  const logEntries = getHighlightLogEntries(startTs);
  assertHighlightLoop(logEntries, profile);
  console.log('[highlight-smoke] log verification ok');
}

main().catch((err) => {
  console.error('[highlight-smoke] failed', err);
  process.exit(1);
});
