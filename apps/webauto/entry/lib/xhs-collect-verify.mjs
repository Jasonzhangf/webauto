import { resolveXhsOutputContext, readJsonlRows } from '../../../../modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs';

function toTarget(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export async function readCollectedLinksCount({ keyword, env, outputRoot, runId } = {}) {
  if (!runId || typeof runId !== 'string' || !runId.trim()) {
    const err = new Error('COLLECT_VERIFY_RUNID_REQUIRED: runId is required for verification');
    err.code = 'COLLECT_VERIFY_RUNID_REQUIRED';
    err.details = { keyword, env, outputRoot, runId };
    throw err;
  }
  const ctx = resolveXhsOutputContext({
    params: {
      keyword,
      env,
      outputRoot,
      runId,
    },
  });
  const rows = await readJsonlRows(ctx.linksPath);
  return {
    linksPath: ctx.linksPath,
    count: rows.length,
  };
}

export async function assertCollectedLinksCount({ keyword, env, outputRoot, target, runId } = {}) {
  const expected = toTarget(target);
  if (!runId || typeof runId !== 'string' || !runId.trim()) {
    const err = new Error('COLLECT_VERIFY_RUNID_REQUIRED: runId is required for verification');
    err.code = 'COLLECT_VERIFY_RUNID_REQUIRED';
    err.details = { keyword, env, outputRoot, target, runId };
    throw err;
  }
  const { linksPath, count } = await readCollectedLinksCount({ keyword, env, outputRoot, runId });
  if (expected > 0 && count < expected) {
    const err = new Error(`COLLECT_COUNT_MISMATCH expected=${expected} actual=${count}`);
    err.code = 'COLLECT_COUNT_MISMATCH';
    err.details = { expected, actual: count, linksPath };
    throw err;
  }
  return {
    linksPath,
    expected,
    actual: count,
  };
}
