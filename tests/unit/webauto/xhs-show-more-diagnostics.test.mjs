import test from 'node:test';
import assert from 'node:assert/strict';

import { executeExpandRepliesOperation } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs';
import { getProfileState } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/state.mjs';

function createContext() {
  return {
    event: {
      count: 3,
      elements: [
        {
          path: 'root/0',
          textSnippet: '展开 4 条回复',
          visible: true,
          classes: ['show-more'],
          selector: '.show-more',
          rect: { left: 10, top: 20, width: 80, height: 20 },
        },
      ],
    },
    emit: async () => {},
    trace: [],
  };
}

test('expand replies records show-more diagnostics into profile state', async () => {
  const profileId = 'diag-profile';
  const state = getProfileState(profileId);
  state.currentNoteId = 'note-1';

  const clicks = [];
  let readCount = 0;
  const targetSets = [
    {
      targets: [
        {
          text: '展开 4 条回复',
          rect: { left: 10, top: 20, width: 80, height: 20 },
          center: { x: 50, y: 30 },
        },
        {
          text: '展开 2 条回复',
          rect: { left: 12, top: 60, width: 80, height: 20 },
          center: { x: 52, y: 70 },
        },
      ],
    },
    {
      targets: [
        {
          text: '展开 2 条回复',
          rect: { left: 12, top: 60, width: 80, height: 20 },
          center: { x: 52, y: 70 },
        },
      ],
    },
    { targets: [] },
    { targets: [] },
  ];

  const ctx = createContext();
  ctx.testingOverrides = {
    readExpandReplyTargets: async () => targetSets[Math.min(readCount++, targetSets.length - 1)],
    clickPoint: async (_profileId, point) => {
      clicks.push(point);
    },
    sleep: async () => {},
  };

  const result = await executeExpandRepliesOperation({
    profileId,
    context: ctx,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.expanded, 2);
  assert.equal(result.data.visibleInitial, 1);
  assert.equal(result.data.visibleMax, 2);
  assert.equal(result.data.distinctSeen, 2);
  assert.equal(result.data.showMoreClicks, 2);
  assert.equal(result.data.clickTimeline.length, 2);
  assert.deepEqual(clicks, [{ x: 50, y: 30 }, { x: 52, y: 70 }]);
  assert.equal(state.lastExpandReplies.noteId, 'note-1');
  assert.equal(state.lastExpandReplies.visibleMax, 2);
  assert.equal(state.lastExpandReplies.clicks, 2);
  assert.ok(state.lastExpandReplies.textsSample.includes('展开 4 条回复'));
  assert.ok(state.lastExpandReplies.textsSample.includes('展开 2 条回复'));
});
