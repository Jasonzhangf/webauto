import { UNIFIED_API_URL } from './core-daemon.mjs';
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

async function runPhase1Foreground(profile, { headless = false, ownerPid = process.pid } = {}) {
  const script = path.join(__dirname, '..', 'phase1-boot.mjs');
  const repoRoot = path.resolve(__dirname, '../../..');
  const args = [script, '--profile', profile, '--once', '--foreground', '--owner-pid', String(ownerPid)];
  if (headless) args.push('--headless');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: ['inherit', 'inherit', 'pipe'],
      env: process.env,
    });
    
    let stderrOutput = '';
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderrOutput += String(data);
        process.stderr.write(data);
      });
    }
    
    child.on('exit', (code) => {
      if (code === 0) return resolve({ skipped: false });
      
      // Check if error is session_owned_by_another_process with alive owner
      if (stderrOutput.includes('session_owned_by_another_process')) {
        const match = /ownerPid=(\d+)/.exec(stderrOutput);
        const existingOwner = match ? Number(match[1]) : 0;
        if (existingOwner > 0) {
          try {
            process.kill(existingOwner, 0);
            console.log(`[runtime-ready] phase1 boot skipped: session already owned by alive process ${existingOwner}`);
            return resolve({ skipped: true });
          } catch {}
        }
      }
      
      reject(new Error(`phase1_boot_exit_${code}`));
    });
    child.on('error', reject);
  });
}

async function ensureSessionReady(profile, apiUrl) {
  const list = await controllerAction('browser:page:list', { profileId: profile }, apiUrl).catch(() => null);
  
  // Handle multiple response shapes
  const pages =
    list?.pages ||
    list?.data?.pages ||
    list?.result?.pages ||
    list?.data?.result?.pages ||
    (Array.isArray(list) ? list : []);
  
  if (Array.isArray(pages) && pages.length > 0) {
    return true;
  }

  // Fallback: check session list if page list empty
  try {
    const sess = await controllerAction('session:list', {}, apiUrl).catch(() => null);
    const sessions =
      sess?.sessions ||
      sess?.data?.sessions ||
      sess?.result?.sessions ||
      [];
    if (Array.isArray(sessions)) {
      const found = sessions.find((s) => String(s?.profileId || s?.profile || '').trim() === String(profile).trim());
      if (found) return true;
    }
  } catch {}

  return false;
}

async function getSessionOwner(profile, apiUrl) {
  try {
    const res = await fetch(`${apiUrl}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'browser:session:owner', payload: { profileId: profile } }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return data?.data?.ownerPid || data?.ownerPid || null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function bindSessionOwner(profile, apiUrl, { headless = false } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fetch(apiUrl + "/health", {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      const res = await fetch(apiUrl + "/v1/controller/action", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:session:bind',
          payload: {
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
        const errMsg = String(data?.error || `bind_owner_failed_http_${res.status}`);
        if (errMsg.includes('Unknown action: browser:session:bind')) {
          console.log('[runtime-ready] browser:session:bind unsupported by current controller, skip bind');
          return;
        }
        throw new Error(errMsg);
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
  unifiedApiUrl = UNIFIED_API_URL,
  headless = false,
  requireCheckpoint = true,
  ownerPid = process.pid,
} = {}) {
  const stage = String(phase || 'runtime').trim() || 'runtime';
  const profileId = String(profile || '').trim();
  if (!profileId) throw new Error(`${stage}: profile_required`);

  // Check if session pages exist
  let hasSession = await ensureSessionReady(profileId, unifiedApiUrl);
  let sessionOwner = hasSession ? await getSessionOwner(profileId, unifiedApiUrl) : null;
  let bootSkipped = false;
  
  if (hasSession && sessionOwner && isProcessAlive(sessionOwner)) {
    // Session ready with alive owner
    console.log(`[${stage}] session ready with owner=${sessionOwner}, skip phase1 boot`);
    if (sessionOwner !== ownerPid) {
      console.log(`[${stage}] session owned by ${sessionOwner}, continue as guest`);
    }
    bootSkipped = true;
  } else {
    // Try boot phase1
    console.log(`[${stage}] session not ready, boot via phase1 profile=${profileId}`);
    try {
      const bootResult = await runPhase1Foreground(profileId, { headless, ownerPid });
      if (bootResult?.skipped) {
        bootSkipped = true;
      }
    } catch (bootErr) {
      const msg = String(bootErr?.message || bootErr || '');
      if (msg.includes('session_owned_by_another_process')) {
        const match = /ownerPid=(\d+)/.exec(msg);
        const existingOwner = match ? Number(match[1]) : 0;
        if (existingOwner > 0 && isProcessAlive(existingOwner)) {
          console.log(`[${stage}] phase1 boot skipped: owned by alive process ${existingOwner}`);
          bootSkipped = true;
        } else {
          throw bootErr;
        }
      } else {
        throw bootErr;
      }
    }
  }

  // After boot (or skip), verify session is usable
  if (!bootSkipped) {
    // We just booted, wait for session
    for (let i = 0; i < 10; i++) {
      hasSession = await ensureSessionReady(profileId, unifiedApiUrl);
      if (hasSession) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!hasSession) {
      throw new Error(`${stage}: session_not_ready_after_phase1`);
    }
  } else {
    // Boot was skipped because owner exists, just verify pages eventually appear
    if (!hasSession) {
      console.log(`[${stage}] waiting for pages from existing owner...`);
      for (let i = 0; i < 5; i++) {
        hasSession = await ensureSessionReady(profileId, unifiedApiUrl);
        if (hasSession) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    // If still no pages but we know owner is alive (we checked earlier), continue
    if (!hasSession) {
      console.log(`[${stage}] no pages but owner alive, continue`);
    }
  }

  // Try bind owner, but don't fail if already owned by someone else
  try {
    await bindSessionOwner(profileId, unifiedApiUrl, { headless });
  } catch (err) {
    const msg = String(err?.message || err || '');
    const ownerMatch = /ownerPid=(\d+)/.exec(msg);
    const existingOwner = ownerMatch ? Number(ownerMatch[1]) : 0;
    
    if (msg.includes('session_owned_by_another_process') && isProcessAlive(existingOwner)) {
      console.log(`[${stage}] session owner active (ownerPid=${existingOwner}), continuing as guest`);
    } else if (msg.includes('Not found') && bootSkipped) {
      // When boot was skipped, wait for owner to create session
      console.log(`[${stage}] session not found, waiting for owner to create it...`);
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const hasSession = await ensureSessionReady(profileId, unifiedApiUrl);
        if (hasSession) {
          console.log(`[${stage}] session now available from owner`);
          break;
        }
      }
    } else {
      throw err;
    }
  }
  // When boot was skipped, owner should have ensured checkpoint
  // But we should verify it's ready before proceeding
  if (bootSkipped) {
    console.log(`[${stage}] boot was skipped, waiting for owner to ensure checkpoint...`);
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const det = await detectXhsCheckpoint({ sessionId: profileId, serviceUrl: unifiedApiUrl });
      console.log(`[${stage}] waiting checkpoint=${det.checkpoint} url=${det.url}`);
      if (det.checkpoint === 'search_ready' || det.checkpoint === 'home_ready') {
        console.log(`[${stage}] owner has ensured checkpoint=${det.checkpoint}`);
        return { success: true, checkpoint: det.checkpoint, url: det.url };
      }
      // Don't throw for offsite when bootSkipped - owner will handle it
      if (HARD_STOPS.has(det.checkpoint)) {
        console.log(`[${stage}] detected hard_stop ${det.checkpoint} but owner is active, continuing...`);
      }
    }
    // After waiting, if still not ready, assume owner will handle it
    console.log(`[${stage}] owner checkpoint not confirmed yet, continuing anyway`);
    return { success: true, checkpoint: 'unknown' };
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
