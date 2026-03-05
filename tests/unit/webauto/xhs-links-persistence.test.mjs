import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { mergeLinksJsonl } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('xhs link persistence', () => {
  it('keeps only xsec_token links and deduplicates by note id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webauto-xhs-links-'));
    tempRoots.push(root);
    const linksPath = path.join(root, 'safe-detail-urls.jsonl');

    const first = await mergeLinksJsonl({
      filePath: linksPath,
      links: [
        { noteId: 'n1', noteUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=aaa' },
        { noteId: 'n1', noteUrl: 'https://www.xiaohongshu.com/explore/n1?xsec_token=bbb' },
        { noteId: 'n2', noteUrl: 'https://www.xiaohongshu.com/explore/n2' },
      ],
    });
    assert.equal(first.added, 1);
    assert.equal(first.total, 1);

    const second = await mergeLinksJsonl({
      filePath: linksPath,
      links: [
        { noteId: 'n2', noteUrl: 'https://www.xiaohongshu.com/explore/n2?xsec_token=ccc' },
      ],
    });
    assert.equal(second.added, 1);
    assert.equal(second.total, 2);
  });
});
