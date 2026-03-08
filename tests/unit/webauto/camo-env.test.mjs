import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyCamoEnv } from '../../../apps/webauto/entry/lib/camo-env.mjs';

describe('camo env defaults', () => {
  it('defaults bring-to-front mode to never', () => {
    const env = {};
    applyCamoEnv({ env, repoRoot: '/tmp/webauto' });

    assert.equal(env.WEBAUTO_BRING_TO_FRONT_MODE, 'never');
    assert.equal(env.CAMO_BRING_TO_FRONT_MODE, 'never');
  });

  it('preserves explicit bring-to-front mode override', () => {
    const env = {
      WEBAUTO_BRING_TO_FRONT_MODE: 'auto',
    };
    applyCamoEnv({ env, repoRoot: '/tmp/webauto' });

    assert.equal(env.WEBAUTO_BRING_TO_FRONT_MODE, 'auto');
    assert.equal(env.CAMO_BRING_TO_FRONT_MODE, 'auto');
  });
});
