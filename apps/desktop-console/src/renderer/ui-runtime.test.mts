import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { listAccountProfiles } from './account-source.mts';
import { getAllTasks, getTask, taskStateStore, useTaskState } from './hooks/use-task-state.mts';
import { createEl, labeledInput, section } from './ui-components.mts';
import { setupDom, type DomHarness } from './test-dom.mts';

let dom: DomHarness;

beforeEach(() => {
  dom = setupDom();
});

afterEach(() => {
  taskStateStore.dispose();
  dom.cleanup();
});

test('ui-components create element tree correctly', () => {
  const child = createEl('span', { className: 'child' }, ['hello']);
  const root = createEl('div', { id: 'root' }, [child, ' world']);
  assert.equal(root.id, 'root');
  assert.equal(root.querySelector('.child')?.textContent, 'hello');
  assert.match(root.textContent || '', /hello world/);

  const input = createEl('input', { value: 'x' }) as HTMLInputElement;
  const wrapped = labeledInput('keyword', input);
  assert.equal(wrapped.querySelector('label')?.textContent, 'keyword');
  assert.equal((wrapped.querySelector('input') as HTMLInputElement).value, 'x');

  const card = section('Title', [wrapped]);
  assert.equal(card.className, 'card');
  assert.equal(card.querySelector('div')?.textContent, 'Title');
});

test('account-source normalizes account list rows', async () => {
  const api = {
    pathJoin: (...parts: string[]) => parts.join('/'),
    cmdRunJson: async () => ({
      ok: true,
      json: {
        profiles: [
          { profileId: 'xhs-1', accountRecordId: 'rec-1', accountId: 'uid-1', alias: 'A', status: 'active', valid: true },
          { profileId: 'xhs-2', accountId: '', alias: '', status: '', valid: true, reason: 'missing' },
          { profileId: '', accountId: 'invalid-row' },
        ],
      },
    }),
  };
  const rows = await listAccountProfiles(api);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].profileId, 'xhs-1');
  assert.equal(rows[0].valid, true);
  assert.equal(rows[1].profileId, 'xhs-2');
  assert.equal(rows[1].valid, false);
  assert.equal(rows[1].status, 'invalid');
});

test('task-state store receives init and update events', async () => {
  let stateListener: ((update: any) => void) | null = null;
  let unsubscribed = false;
  const runId = `run-${Date.now()}`;

  (window as any).api = {
    onStateUpdate: (cb: (update: any) => void) => {
      stateListener = cb;
      return () => {
        unsubscribed = true;
      };
    },
    stateGetTasks: async () => ([
      {
        runId,
        profileId: 'xhs-1',
        keyword: 'kw',
        phase: 'phase1',
        status: 'running',
        progress: { total: 10, processed: 1, failed: 0 },
        stats: { notesProcessed: 1, commentsCollected: 0, likesPerformed: 0, repliesGenerated: 0, imagesDownloaded: 0, ocrProcessed: 0 },
        startedAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]),
  };

  const updates: string[] = [];
  const unlisten = useTaskState((u) => updates.push(u.type));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(updates.includes('init'));
  assert.equal(getTask(runId)?.phase, 'phase1');

  assert.ok(stateListener, 'state listener should be registered');
  stateListener?.({
    runId,
    type: 'state.update',
    data: { phase: 'phase2', status: 'completed' },
    timestamp: Date.now(),
  });

  assert.equal(getTask(runId)?.phase, 'phase2');
  assert.equal(getTask(runId)?.status, 'completed');
  assert.ok(getAllTasks().some((item) => item.runId === runId));

  unlisten();
  taskStateStore.dispose();
  assert.equal(unsubscribed, true);
});
