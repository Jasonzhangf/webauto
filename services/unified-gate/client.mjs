/**
 * Unified Gate Client
 * For scripts to request/release profiles and check permissions
 */
const GATE_URL = process.env.UNIFIED_GATE_URL || 'http://127.0.0.1:7800';

export async function requestProfile(taskId, timeout = 30000) {
  const res = await fetch(`${GATE_URL}/profile/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, timeout })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Profile request failed: ${err.error}`);
  }
  return res.json();
}

export async function releaseProfile(profile, token) {
  const res = await fetch(`${GATE_URL}/profile/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, token })
  });
  return res.json();
}

export async function heartbeat(profile, token) {
  const res = await fetch(`${GATE_URL}/profile/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, token })
  });
  if (!res.ok) throw new Error('Heartbeat failed');
  return res.json();
}

export async function checkSearch(keyword, profile) {
  const res = await fetch(`${GATE_URL}/search/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, profile })
  });
  return res.json();
}
