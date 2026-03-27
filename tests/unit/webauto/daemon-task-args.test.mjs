import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTaskArgs } from '../../../apps/webauto/entry/daemon-task-args.mjs';

describe('daemon task submit args', () => {
  it('keeps args after -- separator', () => {
    const raw = ['task', 'submit', '--detach', '--', 'xhs', 'unified', '--profile', 'p1'];
    assert.deepEqual(resolveTaskArgs(raw, 'task'), ['xhs', 'unified', '--profile', 'p1']);
  });

  it('drops --detach if separator is missing', () => {
    const raw = ['task', 'submit', '--detach', 'xhs', 'unified', '--profile', 'p1'];
    assert.deepEqual(resolveTaskArgs(raw, 'task'), ['xhs', 'unified', '--profile', 'p1']);
  });
});
