import { execSync, spawnSync } from 'child_process';

function runCamo(args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  try {
    const result = spawnSync('camo', args, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: result.stdout || '', stderr: result.stderr || '', ok: result.status === 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, ok: false };
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseDevtoolsJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  return null;
}

export async function devtoolsEval(profileId, script, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 10000;
  const result = runCamo(['devtools', 'eval', profileId, '--script', script], { timeoutMs });
  const parsed = parseDevtoolsJson(result.stdout);
  if (!parsed) {
    const out = String(result.stdout || '').slice(0, 200).replace(/\n/g, ' ');
    const err = String(result.stderr || '').slice(0, 200).replace(/\n/g, ' ');
    console.error(`[weibo.common] devtoolsEval parse failed profile=${profileId} stdout=[${out}] stderr=[${err}]`);
  }
  if (parsed?.result?.value !== undefined) return parsed.result.value;
  return parsed;
}
