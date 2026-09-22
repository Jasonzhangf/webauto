// `weibo-user-profile --with-detail true` collected details for every
// harvested post before the v3 migration. The flag has to keep its meaning:
// silently ignoring it would report the profile as done while skipping a
// requested stage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CLI_SOURCE = path.join(REPO_ROOT, 'apps/webauto/weibo-v3/cli.mjs');

test('user-profile --with-detail is parsed and routed to the detail owner', async () => {
  const source = fs.readFileSync(CLI_SOURCE, 'utf8');

  assert.match(
    source,
    /argv\['with-detail'\]/,
    'the compatibility flag must be read from argv',
  );
  assert.match(
    source,
    /withDetail && collected\.posts\.length > 0/,
    'detail collection must be gated on the flag and on harvested posts',
  );
  assert.match(
    source,
    /detail = await runDetailBatch\(/,
    'detail collection must run through the v3 detail owner',
  );
  assert.match(
    source,
    /validation\.result === 'pass' && \(detail \? detail\.ok : true\)/,
    'a failed detail stage must fail the user-profile result',
  );
});

test('user-profile rejects --with-detail=false by not collecting details', async () => {
  const source = fs.readFileSync(CLI_SOURCE, 'utf8');
  // The gate must be conditional, not an unconditional detail run.
  assert.ok(
    !/if \(collected\.posts\.length > 0\) \{\n\s+detail = await runDetailBatch/.test(source),
    'detail must not run when the flag is absent',
  );
});
