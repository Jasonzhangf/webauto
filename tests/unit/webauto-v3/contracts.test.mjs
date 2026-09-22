import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARD_VERDICTS,
  isGuardVerdict,
  makeGuardResult,
} from '../../../modules/webauto-v3/src/contracts.mjs';

test('guard union is closed', () => {
  assert.deepEqual(GUARD_VERDICTS, ['allow', 'deny', 'unknown', 'risk_control', 'unavailable']);
  assert.equal(isGuardVerdict('allow'), true);
  assert.equal(isGuardVerdict('maybe'), false);
  assert.throws(() => makeGuardResult({ verdict: 'maybe' }), /invalid guard verdict/);
});

test('guard result keeps scores out of the top level', () => {
  const result = makeGuardResult({
    verdict: 'allow',
    guard_id: 'weibo.structure',
    subject_ref: 'rev_1',
    diagnostics: { score: 0.91 },
  });
  assert.equal(result.verdict, 'allow');
  assert.equal(result.diagnostics.score, 0.91);
  assert.equal('score' in result, false);
});
