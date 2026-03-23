/**
 * Core executor for wa run.
 * Bridges CLI commands to the existing entry/lib business logic.
 */

import { ok, fail, info } from './output.mjs';
import { runUnified } from '../../apps/webauto/entry/lib/xhs-unified-runner.mjs';

/**
 * Execute a unified run directly.
 */
export async function executeUnifiedRun(options) {
  const arg = (value, fallback = '') => {
    const v = value === undefined || value === null ? fallback : value;
    const s = String(v);
    if (/[\r\n\0]/.test(s)) throw new Error('Invalid argument');
    return s;
  };

  const argv = {
    profile: arg(options.profile || 'default'),
    keyword: arg(options.keyword || ''),
    env: arg(options.env || 'debug'),
    'max-notes': Number(options.maxNotes || 30),
    'do-comments': Boolean(options.doComments),
    'persist-comments': Boolean(options.persistComments),
    'do-likes': Boolean(options.doLikes),
    'like-keywords': options.likeKeywords ? arg(options.likeKeywords) : undefined,
    'max-likes': Number(options.maxLikes || 5),
    'match-mode': arg(options.matchMode || 'any'),
    'match-min-hits': Number(options.matchMinHits || 1),
    'do-ocr': Boolean(options.doOcr),
    'do-images': Boolean(options.doImages),
    'do-reply': Boolean(options.doReply),
    'tab-count': Number(options.tabCount || 4),
    headless: Boolean(options.headless),
    'no-dry-run': Boolean(options.noDryRun),
    resume: Boolean(options.resume),
    'shared-harvest-path': options.sharedHarvestPath ? arg(options.sharedHarvestPath) : undefined,
    'service-reset': false,
  };

  info('启动任务（直连执行）...');
  await runUnified(argv);
  ok('任务完成');
}
