import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { detectXhsCheckpoint, ensureXhsCheckpoint } from '../../../dist/modules/xiaohongshu/app/src/utils/checkpoints.js';
import { execute as discoverFallback } from '../../../dist/modules/xiaohongshu/app/src/blocks/XhsDiscoverFallbackBlock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function controllerAction(action, payload, apiUrl) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function runPhase1Foreground(profile, { headless = false } = {}) {
  const script = path.join(__dirname, '..', 'phase1-boot.mjs');
  const repoRoot = path.resolve(__dirname, '../../..');
  const args = [script, '--profile', profile, '--once', '--foreground', '--owner-pid', String(process.pid)];
  if (headless) args.push('--headless');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`phase1_boot_exit_${code}`))));
    child.on('error', reject);
  });
}

async function ensureSessionReady(profile, apiUrl) {
  const list = await controllerAction('browser:page:list', { profileId: profile }, apiUrl).catch(() => null);
  const pages = list?.pages || list?.data?.pages || [];
  if (Array.isArray(pages) && pages.length > 0) return true;
  return false;
}

async function bindSessionOwner(profile, { headless = false } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fetch('CORE_DAEMON_URL/health', {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      const res = await fetch('CORE_DAEMON_URL/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          args: {
            profileId: profile,
            sessionName: profile,
            headless: !!headless,
            ownerPid: process.pid,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `bind_owner_failed_http_${res.status}`);
      }
      if (attempt > 1) {
        console.log(`[runtime-ready] bindSessionOwner recovered on attempt ${attempt}`);
      }
      return;
    } catch (err) {
      lastError = err;
      if (attempt >= 5) break;
      await delay(600 * attempt);
    }
  }

  throw new Error(lastError?.message || 'bind_owner_failed');
}

const HARD_STOPS = new Set(['risk_control', 'login_guard', 'offsite']);

export async function ensureRuntimeReady({
  phase,
  profile,
  keyword,
  env = 'debug',
  unifiedApiUrl = 'CORE_DAEMON_URL',
  headless = false,
  requireCheckpoint = true,
} = {}) {
  const stage = String(phase || 'runtime').trim() || 'runtime';
  const profileId = String(profile || '').trim();
  if (!profileId) throw new Error(`${stage}: profile_required`);

  const hasSession = await ensureSessionReady(profileId, unifiedApiUrl);
  if (!hasSession) {
    console.log(`[${stage}] session not ready, boot via phase1 profile=${profileId}`);
    await runPhase1Foreground(profileId, { headless });
  }

  const hasSessionAfter = await ensureSessionReady(profileId, unifiedApiUrl);
  if (!hasSessionAfter) {
    throw new Error(`${stage}: session_not_ready_after_phase1`);
  }

  try {
    await bindSessionOwner(profileId, { headless });
  } catch (err) {
    const msg = String(err?.message || err || '');
    const ownerMatch = /ownerPid=(\d+)/.exec(msg);
    const ownerPid = ownerMatch ? Number(ownerMatch[1]) : 0;
    let ownerAlive = false;
    if (ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
        ownerAlive = true;
      } catch {
        ownerAlive = false;
      }
    }

    if (!msg.includes('session_owned_by_another_process') || !ownerAlive) {
      throw err;
    }

    console.log(`[${stage}] session owner active (ownerPid=${ownerPid}), continue without rebinding`);
  }

  if (!requireCheckpoint) {
    return { success: true, checkpoint: 'unknown' };
  }

  const det = await detectXhsCheckpoint({ sessionId: profileId, serviceUrl: unifiedApiUrl });
  console.log(`[${stage}] locate checkpoint=${det.checkpoint} url=${det.url}`);

  if (HARD_STOPS.has(det.checkpoint)) {
    throw new Error(`${stage}: hard_stop checkpoint=${det.checkpoint} url=${det.url}`);
  }

  if (det.checkpoint === 'search_ready' || det.checkpoint === 'home_ready') {
    return { success: true, checkpoint: det.checkpoint, url: det.url };
  }

  const ensured = await ensureXhsCheckpoint({
    sessionId: profileId,
    target: 'search_ready',
    serviceUrl: unifiedApiUrl,
    timeoutMs: 20000,
    allowOneLevelUpFallback: true,
  });

  if (ensured.success || ensured.reached === 'search_ready' || ensured.reached === 'home_ready') {
    const det2 = await detectXhsCheckpoint({ sessionId: profileId, serviceUrl: unifiedApiUrl });
    return { success: true, checkpoint: det2.checkpoint, url: det2.url };
  }

  if (keyword) {
    const fallback = await discoverFallback({
      keyword,
      profile: profileId,
      unifiedApiUrl,
      env,
    }).catch((err) => ({ success: false, error: err?.message || String(err) }));

    if (fallback?.success) {
      const det3 = await detectXhsCheckpoint({ sessionId: profileId, serviceUrl: unifiedApiUrl });
      if (det3.checkpoint === 'search_ready' || det3.checkpoint === 'home_ready') {
        return { success: true, checkpoint: det3.checkpoint, url: det3.url };
      }
    }
  }

  throw new Error(
    `${stage}: checkpoint_not_ready reached=${ensured.reached || det.checkpoint} url=${ensured.url || det.url}`,
  );
}
