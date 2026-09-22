// Stable hashing helpers for invocation_id and other deterministic ids.

import { createHash, randomUUID } from 'node:crypto';

function hashStableId(parts) {
  const normalized = Array.isArray(parts) ? parts : [parts];
  const payload = normalized
    .map((part) => (part === undefined || part === null ? '' : String(part)))
    .join('\u001f');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function makeInvocationId({ workflowRunId, workflowNodeId, bindingId, itemKey, attempt }) {
  return hashStableId([
    workflowRunId || '',
    workflowNodeId || '',
    bindingId || '',
    itemKey || '',
    Number.isFinite(attempt) ? attempt : 0,
  ]);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export function makeArtifactDigest(payload) {
  const serialized = JSON.stringify(canonicalize(payload ?? null));
  return createHash('sha256').update(serialized).digest('hex');
}

export function newEventId() {
  return `evt_${randomUUID().replace(/-/g, '')}`;
}

export function newRunId(prefix = 'run') {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}
