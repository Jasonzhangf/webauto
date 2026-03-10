import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeXhsLoginSignal } from '../../../modules/camo-runtime/src/utils/xhs-login-signal.mjs';

describe('xhs login guard signal normalization', () => {
  it('keeps login guard when account signal is already present', () => {
    const result = normalizeXhsLoginSignal({
      hasLoginGuard: true,
      hasAccountSignal: true,
      accountId: '69a6e5b0000000002401e93b',
      loginUrl: false,
      visibleGuardCount: 1,
    });

    assert.equal(result.hasAccountSignal, true);
    assert.equal(result.hasLoginGuard, true);
    assert.equal(result.accountId, '69a6e5b0000000002401e93b');
  });

  it('keeps login guard when no account signal exists', () => {
    const result = normalizeXhsLoginSignal({
      hasLoginGuard: true,
      hasAccountSignal: false,
      accountId: null,
      loginUrl: false,
      visibleGuardCount: 1,
    });

    assert.equal(result.hasAccountSignal, false);
    assert.equal(result.hasLoginGuard, true);
    assert.equal(result.accountId, null);
  });

  it('keeps login guard on explicit login url even if account signal still exists', () => {
    const result = normalizeXhsLoginSignal({
      hasLoginGuard: true,
      hasAccountSignal: true,
      accountId: '69a6e5b0000000002401e93b',
      loginUrl: true,
      visibleGuardCount: 1,
    });

    assert.equal(result.hasAccountSignal, true);
    assert.equal(result.hasLoginGuard, true);
    assert.equal(result.accountId, '69a6e5b0000000002401e93b');
  });
});
