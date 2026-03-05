import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { assertCollectedLinksCount } from '../../../../apps/webauto/entry/lib/xhs-collect-verify.mjs';
import { verifyPersistedCollectCount } from '../../../../scripts/xiaohongshu/phase2-collect.mjs';
import { assertCollectNoProgress, handleCollectNoProgress, handleCollectAnchorEmpty } from '../../../../modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs';
import { mergeLinksJsonl, readJsonlRows } from '../../../../modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs';
import { resolveSearchResultTokenLink } from '../../../../modules/camo-runtime/src/autoscript/action-providers/xhs/utils.mjs';

test('DIRECT: collect regression count equals target', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), '.tmp', 'collect-count-'));
  const keyword = 'count-regression';
  const env = 'debug';
  const target = 3;
  const linksPath = path.join(tmpRoot, 'xiaohongshu', env, keyword, 'safe-detail-urls.jsonl');
  await fs.mkdir(path.dirname(linksPath), { recursive: true });
  const rows = Array.from({ length: target }, (_, idx) => (
    JSON.stringify({ noteId: `note-${idx + 1}`, noteUrl: `https://www.xiaohongshu.com/explore/note-${idx + 1}?xsec_token=token${idx + 1}`, listUrl: 'https://www.xiaohongshu.com/search_result?keyword=test' })
  )).join('\n');
  await fs.writeFile(linksPath, `${rows}\n`, 'utf8');

  const result = await assertCollectedLinksCount({
    keyword,
    env,
    outputRoot: tmpRoot,
    target,
  });

  assert.equal(result.actual, target);
  assert.equal(result.expected, target);
  assert.equal(result.linksPath, linksPath);
});

test('DIRECT: collect regression count equals target for target=100', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), '.tmp', 'collect-count-100-'));
  const keyword = 'count-regression-100';
  const env = 'debug';
  const target = 100;
  const linksPath = path.join(tmpRoot, 'xiaohongshu', env, keyword, 'safe-detail-urls.jsonl');
  await fs.mkdir(path.dirname(linksPath), { recursive: true });
  const rows = Array.from({ length: target }, (_, idx) => (
    JSON.stringify({
      noteId: `note-${idx + 1}`,
      noteUrl: `https://www.xiaohongshu.com/explore/note-${idx + 1}?xsec_token=token${idx + 1}`,
      listUrl: 'https://www.xiaohongshu.com/search_result?keyword=test',
    })
  )).join('\n');
  await fs.writeFile(linksPath, `${rows}\n`, 'utf8');

  const result = await assertCollectedLinksCount({
    keyword,
    env,
    outputRoot: tmpRoot,
    target,
  });

  assert.equal(result.actual, target);
  assert.equal(result.expected, target);
  assert.equal(result.linksPath, linksPath);
});

test('DIRECT: phase2-collect verifyPersistedCollectCount matches target and throws on mismatch', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), '.tmp', 'collect-count-check-'));
  const keyword = 'count-verify';
  const env = 'debug';
  const target = 5;
  const linksPath = path.join(tmpRoot, 'xiaohongshu', env, keyword, 'safe-detail-urls.jsonl');
  await fs.mkdir(path.dirname(linksPath), { recursive: true });
  const rows = Array.from({ length: target }, (_, idx) => (
    JSON.stringify({ noteId: `note-${idx + 1}`, noteUrl: `https://www.xiaohongshu.com/explore/note-${idx + 1}?xsec_token=token${idx + 1}`, listUrl: 'https://www.xiaohongshu.com/search_result?keyword=test' })
  )).join('\n');
  await fs.writeFile(linksPath, `${rows}\n`, 'utf8');

  const okResult = await verifyPersistedCollectCount({
    keyword,
    env,
    outputRoot: tmpRoot,
    target,
  });

  assert.equal(okResult.actual, target);
  assert.equal(okResult.expected, target);
  assert.equal(okResult.persistPath, linksPath);

  await assert.rejects(
    () => verifyPersistedCollectCount({
      keyword,
      env,
      outputRoot: tmpRoot,
      target: target + 1,
    }),
    (err) => {
      assert.equal(err.code, 'COLLECT_COUNT_MISMATCH');
      assert.ok(String(err.message).includes('expected='));
      assert.ok(String(err.message).includes('actual='));
      assert.ok(String(err.message).includes('persistPath='));
      assert.equal(err.details.expected, target + 1);
      assert.equal(err.details.actual, target);
      assert.equal(err.details.persistPath, linksPath);
      return true;
    }
  );
});

test('DIRECT: collect no-progress throws with required fields', () => {
  const expected = 10;
  const actual = 3;
  const persistPath = '/tmp/safe-detail-urls.jsonl';
  const lastAnchor = '.note-item';
  const lastUrl = 'https://www.xiaohongshu.com/explore/abc?xsec_token=token';

  assert.throws(
    () => assertCollectNoProgress({
      stage: 'collect_links',
      expected,
      actual,
      persistPath,
      lastAnchor,
      lastUrl,
      noProgressRounds: 5,
      maxNoProgressRounds: 3,
    }),
    (err) => {
      assert.equal(err.code, 'COLLECT_NO_PROGRESS');
      assert.ok(String(err.message).includes('expected='));
      assert.ok(String(err.message).includes('actual='));
      assert.ok(String(err.message).includes('persistPath='));
      assert.equal(err.details.stage, 'collect_links');
      assert.equal(err.details.expected, expected);
      assert.equal(err.details.actual, actual);
      assert.equal(err.details.persistPath, persistPath);
      assert.equal(err.details.lastAnchor, lastAnchor);
      assert.equal(err.details.lastUrl, lastUrl);
      assert.ok(err.details.actual < err.details.expected);
      return true;
    }
  );
});

test('DIRECT: collect no-progress triggers diagnostics and error', async () => {
  let dumped = null;
  const dumpDiagnostics = async (payload) => {
    dumped = payload;
    return { jsonPath: '/tmp/no-progress.json', screenshotPath: '/tmp/no-progress.png' };
  };

  const expected = 10;
  const actual = 2;
  const persistPath = '/tmp/safe-detail-urls.jsonl';

  await assert.rejects(
    () => handleCollectNoProgress({
      profileId: 'profile-1',
      params: { keyword: 'k', env: 'debug' },
      context: { runId: 'run-1' },
      stage: 'collect_links',
      expected,
      actual,
      persistPath,
      lastAnchor: '.note-item',
      lastUrl: 'https://www.xiaohongshu.com/explore/x?xsec_token=token',
      listSelector: '.note-item',
      noProgressRounds: 5,
      maxNoProgressRounds: 5,
      dumpDiagnostics,
    }),
    (err) => {
      assert.equal(err.code, 'COLLECT_NO_PROGRESS');
      assert.equal(err.details.expected, expected);
      assert.equal(err.details.actual, actual);
      assert.equal(err.details.persistPath, persistPath);
      assert.ok(err.details.actual < err.details.expected);
      return true;
    }
  );

  assert.ok(dumped);
  assert.equal(dumped.stage, 'collect_links');
  assert.equal(dumped.expected, expected);
  assert.equal(dumped.actual, actual);
  assert.equal(dumped.persistPath, persistPath);
});

test('DIRECT: collect anchor empty triggers diagnostics and error', async () => {
  let dumped = null;
  const dumpDiagnostics = async (payload) => {
    dumped = payload;
    return { jsonPath: '/tmp/anchor-empty.json', screenshotPath: null };
  };

  await assert.rejects(
    () => handleCollectAnchorEmpty({
      profileId: 'profile-1',
      params: { keyword: 'k', env: 'debug' },
      context: { runId: 'run-1' },
      stage: 'collect_links',
      expected: 10,
      actual: 0,
      persistPath: '/tmp/safe-detail-urls.jsonl',
      lastUrl: 'https://www.xiaohongshu.com/search_result?keyword=k',
      anchorCount: 0,
      visibleCount: 0,
      containerVisible: false,
      listSelector: '.feeds-container',
      anchorSelector: '.note-item:has(a.cover)',
      dumpDiagnostics,
    }),
    (err) => {
      assert.equal(err.code, 'COLLECT_ANCHOR_EMPTY');
      assert.equal(err.details.anchorCount, 0);
      assert.equal(err.details.visibleCount, 0);
      assert.equal(err.details.containerVisible, false);
      assert.ok(String(err.message).includes('persistPath='));
      return true;
    }
  );

  assert.ok(dumped);
  assert.equal(dumped.anchorCount, 0);
  assert.equal(dumped.visibleCount, 0);
  assert.equal(dumped.containerVisible, false);
  assert.equal(dumped.listSelector, '.feeds-container');
  assert.equal(dumped.anchorSelector, '.note-item:has(a.cover)');
});

test('DIRECT: collect link rows include collectedAt timestamp', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), '.tmp', 'collect-collected-at-'));
  const keyword = 'collect-collected-at';
  const env = 'debug';
  const linksPath = path.join(tmpRoot, 'xiaohongshu', env, keyword, 'safe-detail-urls.jsonl');

  await mergeLinksJsonl({
    filePath: linksPath,
    links: [
      {
        noteId: 'note-1',
        noteUrl: 'https://www.xiaohongshu.com/explore/note-1?xsec_token=token1',
        listUrl: 'https://www.xiaohongshu.com/search_result?keyword=test',
        collectedAt: '2026-03-05T00:00:00.000Z',
      },
    ],
  });

  const rows = await readJsonlRows(linksPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].collectedAt, '2026-03-05T00:00:00.000Z');
  assert.ok(Number.isFinite(Number(rows[0].collectedAtMs)));
});

test('DIRECT: resolve search_result token link keeps token and noteId', () => {
  const input = '/search_result/69909a1f000000001600bd3e?xsec_token=AB4wYrjwuwVsAH9I-pqbD6yE3ZuOZas5pCodS25fnpUzE=&xsec_source=pc_search';
  const resolved = resolveSearchResultTokenLink(input);
  assert.ok(resolved);
  assert.equal(resolved.noteId, '69909a1f000000001600bd3e');
  assert.ok(resolved.searchUrl?.includes('xsec_token='));
});
