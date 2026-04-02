import { execSync } from 'child_process';

function runCamo(args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  try {
    const result = execSync(`camo ${args.join(' ')}`, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: result, stderr: '', ok: true };
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
  // camo CLI wraps the result in { ok, command, profileId, result: { value, valueType } }
  // Unwrap to return the actual value directly
  if (parsed?.result?.value !== undefined) return parsed.result.value;
  return parsed;
}
