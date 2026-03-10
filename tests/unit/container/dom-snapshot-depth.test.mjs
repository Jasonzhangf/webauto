import { afterEach, beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;

function buildEvaluateResponse() {
  return {
    result: {
      dom_tree: {
        tag: 'body',
        children: [],
      },
      viewport: {
        width: 1440,
        height: 900,
      },
      current_url: 'https://www.xiaohongshu.com/explore/mock',
    },
  };
}

beforeEach(() => {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    if (body.action === 'evaluate') {
      return {
        ok: true,
        json: async () => buildEvaluateResponse(),
      };
    }
    return {
      ok: true,
      json: async () => ({ sessions: [] }),
    };
  };
});

afterEach(() => {
  global.fetch = originalFetch;
});

it('uses a deeper default DOM snapshot depth for runtime selectors', async () => {
  let capturedScript = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    if (body.action === 'evaluate') {
      capturedScript = String(body.args?.script || body.script || '');
      return {
        ok: true,
        json: async () => buildEvaluateResponse(),
      };
    }
    return {
      ok: true,
      json: async () => ({ sessions: [] }),
    };
  };

  const { getDomSnapshotByProfile } = await import('../../../modules/camo-runtime/src/utils/browser-service.mjs');
  const snapshot = await getDomSnapshotByProfile('profile-depth-default');

  assert.match(capturedScript, /const MAX_DEPTH = 16;/);
  assert.deepEqual(snapshot.__viewport, { width: 1440, height: 900 });
  assert.equal(snapshot.__url, 'https://www.xiaohongshu.com/explore/mock');
});

it('still honors explicit DOM snapshot depth overrides', async () => {
  let capturedScript = '';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    if (body.action === 'evaluate') {
      capturedScript = String(body.args?.script || body.script || '');
      return {
        ok: true,
        json: async () => buildEvaluateResponse(),
      };
    }
    return {
      ok: true,
      json: async () => ({ sessions: [] }),
    };
  };

  const { getDomSnapshotByProfile } = await import('../../../modules/camo-runtime/src/utils/browser-service.mjs');
  await getDomSnapshotByProfile('profile-depth-override', { maxDepth: 20, maxChildren: 200 });

  assert.match(capturedScript, /const MAX_DEPTH = 20;/);
  assert.match(capturedScript, /const MAX_CHILDREN = 200;/);
});
