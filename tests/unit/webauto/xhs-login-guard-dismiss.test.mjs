import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeAssertLoggedInOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/auth-ops.mjs';

describe('xhs login guard dismissal', () => {
  it('fails immediately when a visible login guard exists even if account signal is present', async () => {
    const result = await executeAssertLoggedInOperation({
      profileId: 'xhs-login-guard-dismiss',
      params: {},
      context: {
        testingOverrides: {
          evaluate: async () => ({
            result: {
              hasLoginGuard: true,
              hasAccountSignal: true,
              accountId: '69a6e5b0000000002401e93b',
              loginUrl: false,
              visibleGuardCount: 1,
            },
          }),
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'OPERATION_FAILED');
    assert.equal(result.message, 'LOGIN_GUARD_DETECTED');
  });

  it('fails fast when a valid account still lands on the explicit login url', async () => {
    const result = await executeAssertLoggedInOperation({
      profileId: 'xhs-login-guard-login-url',
      params: {},
      context: {
        testingOverrides: {
          evaluate: async () => ({
            result: {
              hasLoginGuard: true,
              hasAccountSignal: true,
              accountId: '69a6e5b0000000002401e93b',
              loginUrl: true,
              visibleGuardCount: 1,
            },
          }),
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'OPERATION_FAILED');
    assert.equal(result.message, 'LOGIN_GUARD_DETECTED');
  });
});
