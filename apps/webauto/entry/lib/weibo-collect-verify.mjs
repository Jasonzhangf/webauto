import { resolveWeiboOutputContext, readJsonlRows } from '../../../../modules/camo-runtime/src/autoscript/action-providers/weibo/persistence.mjs';

function toTarget(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export async function readCollectedLinksCount({ keyword, env, outputRoot } = {}) {
  if (!keyword) {
    const err = new Error('WEIBO_VERIFY_KEYWORD_REQUIRED: keyword is required for verification');
    err.code = 'WEIBO_VERIFY_KEYWORD_REQUIRED';
    err.details = { keyword, env, outputRoot };
    throw err;
  }
  const ctx = resolveWeiboOutputContext({ params: { keyword, env, outputRoot } });
  const rows = await readJsonlRows(ctx.linksPath);
  const uniqueUrls = new Set(rows.map((r) => String(r?.url || '').trim()).filter(Boolean));
  return {
    linksPath: ctx.linksPath,
    postsPath: ctx.postsPath,
    metaPath: ctx.metaPath,
    count: uniqueUrls.size,
    rawRows: rows.length,
  };
}

export async function assertCollectedLinksCount({ keyword, env, outputRoot, target } = {}) {
  const expected = toTarget(target);
  const { linksPath, count } = await readCollectedLinksCount({ keyword, env, outputRoot });
  if (expected > 0 && count < expected) {
    const err = new Error(`WEIBO_COLLECT_COUNT_MISMATCH expected=${expected} actual=${count}`);
    err.code = 'WEIBO_COLLECT_COUNT_MISMATCH';
    err.details = { expected, actual: count, linksPath };
    throw err;
  }
  return {
    linksPath,
    expected,
    actual: count,
  };
}

export async function verifyUniqueness({ keyword, env, outputRoot } = {}) {
  const { postsPath, count, rawRows } = await readCollectedLinksCount({ keyword, env, outputRoot });
  if (rawRows !== count) {
    const err = new Error(`WEIBO_COLLECT_DUPLICATES_FOUND raw=${rawRows} unique=${count}`);
    err.code = 'WEIBO_COLLECT_DUPLICATES_FOUND';
    err.details = { rawRows, unique: count, postsPath };
    throw err;
  }
  return { postsPath, unique: count, rawRows };
}
