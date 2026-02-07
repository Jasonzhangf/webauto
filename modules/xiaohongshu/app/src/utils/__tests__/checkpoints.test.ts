import test from 'node:test';
import assert from 'node:assert';
import type { XhsCheckpointId } from '../checkpoints.js';

function detectCheckpointFromMatchIds(
  matchIds: string[],
  url: string,
  dom?: { hasDetailMask?: boolean; hasSearchInput?: boolean; title?: string }
): { checkpoint: XhsCheckpointId; signals: string[] } {
  const signals: string[] = [];
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('/website-login/captcha') || lowerUrl.includes('verifyuuid=')) {
    return { checkpoint: 'risk_control', signals: ['risk_control_url'] };
  }

  if (!url.includes('xiaohongshu.com')) {
    return { checkpoint: 'offsite', signals: ['offsite'] };
  }

  if (dom?.hasDetailMask === false && dom?.hasSearchInput === true) {
    const isInSearch = url.includes('/search_result') || url.includes('keyword=');
    return {
      checkpoint: isInSearch ? 'search_ready' : 'home_ready',
      signals: ['no_detail_mask', 'has_search_input', isInSearch ? 'search_ready' : 'home_ready'],
    };
  }

  if (matchIds.includes('xiaohongshu_login.login_guard')) {
    return { checkpoint: 'login_guard', signals: ['login_guard'] };
  }

  if (matchIds.some(id => id.includes('qrcode_guard') || id.includes('captcha_guard'))) {
    return { checkpoint: 'risk_control', signals: ['risk_control'] };
  }

  if (matchIds.some(id => id.includes('comment_section'))) {
    return { checkpoint: 'comments_ready', signals: ['comments_anchor'] };
  }

  if (matchIds.includes('xiaohongshu_detail.modal_shell') && matchIds.includes('xiaohongshu_detail.content_anchor')) {
    return { checkpoint: 'detail_ready', signals: ['detail_shell', 'content_anchor'] };
  }

  if (matchIds.includes('xiaohongshu_search.search_bar') && matchIds.includes('xiaohongshu_search.search_result_list')) {
    return { checkpoint: 'search_ready', signals: ['search_bar', 'search_result_list'] };
  }

  if (matchIds.some(id => id.includes('xiaohongshu_home'))) {
    return { checkpoint: 'home_ready', signals: ['home'] };
  }

  return { checkpoint: 'unknown', signals: [] };
}

test('DOM-first priority: home_ready when no detail mask and has search input', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_home', 'xiaohongshu_home.search_input'],
    'https://www.xiaohongshu.com/explore',
    { hasDetailMask: false, hasSearchInput: true }
  );
  assert.strictEqual(result.checkpoint, 'home_ready');
  assert.ok(result.signals.includes('no_detail_mask'));
  assert.ok(result.signals.includes('has_search_input'));
});

test('DOM-first priority: search_ready when in search_result with search input', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_search', 'xiaohongshu_search.search_bar'],
    'https://www.xiaohongshu.com/search_result?keyword=test',
    { hasDetailMask: false, hasSearchInput: true }
  );
  assert.strictEqual(result.checkpoint, 'search_ready');
});

test('hard stops: risk_control from URL pattern', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_home'],
    'https://www.xiaohongshu.com/website-login/captcha?redirectPath=...'
  );
  assert.strictEqual(result.checkpoint, 'risk_control');
  assert.ok(result.signals.includes('risk_control_url'));
});

test('hard stops: offsite when not xiaohongshu.com', () => {
  const result = detectCheckpointFromMatchIds(
    ['some_other_container'],
    'https://www.google.com'
  );
  assert.strictEqual(result.checkpoint, 'offsite');
});

test('hard stops: login_guard', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_login.login_guard'],
    'https://www.xiaohongshu.com/signup'
  );
  assert.strictEqual(result.checkpoint, 'login_guard');
});

test('page states: detail_ready', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_detail.modal_shell', 'xiaohongshu_detail.content_anchor'],
    'https://www.xiaohongshu.com/explore/123456'
  );
  assert.strictEqual(result.checkpoint, 'detail_ready');
  assert.ok(result.signals.includes('detail_shell'));
  assert.ok(result.signals.includes('content_anchor'));
});

test('page states: comments_ready', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_detail.comment_section', 'xiaohongshu_detail.comment_section.comment_item'],
    'https://www.xiaohongshu.com/explore/123456'
  );
  assert.strictEqual(result.checkpoint, 'comments_ready');
});

test('page states: search_ready from containers', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_search.search_bar', 'xiaohongshu_search.search_result_list'],
    'https://www.xiaohongshu.com/search_result?keyword=test'
  );
  assert.strictEqual(result.checkpoint, 'search_ready');
});

test('page states: home_ready from home container', () => {
  const result = detectCheckpointFromMatchIds(
    ['xiaohongshu_home', 'xiaohongshu_home.feed_list'],
    'https://www.xiaohongshu.com/explore'
  );
  assert.strictEqual(result.checkpoint, 'home_ready');
});

test('edge cases: unknown for unrecognized state', () => {
  const result = detectCheckpointFromMatchIds(
    ['some_random_container'],
    'https://www.xiaohongshu.com/unknown-page'
  );
  assert.strictEqual(result.checkpoint, 'unknown');
});
