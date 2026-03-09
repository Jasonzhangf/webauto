import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isTransientSubscriptionError } from '../../../modules/camo-runtime/src/container/runtime-core/subscription.mjs';

describe('subscription transient error classification', () => {
  it('treats navigation context destruction as transient', () => {
    assert.equal(isTransientSubscriptionError(new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation')), true);
    assert.equal(isTransientSubscriptionError(new Error('Cannot find context with specified id')), true);
    assert.equal(isTransientSubscriptionError(new Error('Target closed')), true);
  });

  it('keeps unrelated errors non-transient', () => {
    assert.equal(isTransientSubscriptionError(new Error('selector parse failed')), false);
    assert.equal(isTransientSubscriptionError(new Error('network timeout')), false);
  });
});
