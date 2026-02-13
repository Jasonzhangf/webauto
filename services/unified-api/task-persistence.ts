// services/unified-api/task-persistence.ts
// Simple JSONL persistence for task state (webauto-04b)

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { TaskState, TaskEvent } from './task-state.js';

const STATE_DIR = path.join(os.homedir(), '.webauto', 'state');

export async function ensureStateDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

export async function saveTaskSnapshot(task: TaskState): Promise<void> {
  await ensureStateDir();
  const file = path.join(STATE_DIR, `${task.runId}.json`);
  await fs.writeFile(file, JSON.stringify(task, null, 2), 'utf8');
}

export async function loadTaskSnapshot(runId: string): Promise<TaskState | null> {
  try {
    const file = path.join(STATE_DIR, `${runId}.json`);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function appendEvent(event: TaskEvent): Promise<void> {
  await ensureStateDir();
  const file = path.join(STATE_DIR, `${event.runId}.events.jsonl`);
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

export async function loadEvents(runId: string, since?: number): Promise<TaskEvent[]> {
  try {
    const file = path.join(STATE_DIR, `${runId}.events.jsonl`);
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.trim().split('\n');
    const events = lines.map(line => JSON.parse(line));
    if (!since) return events;
    return events.filter(e => e.timestamp > since);
  } catch {
    return [];
  }
}

export async function deleteTaskFiles(runId: string): Promise<void> {
  const snapshotFile = path.join(STATE_DIR, `${runId}.json`);
  const eventsFile = path.join(STATE_DIR, `${runId}.events.jsonl`);
  await Promise.all([
    fs.unlink(snapshotFile).catch(() => {}),
    fs.unlink(eventsFile).catch(() => {}),
  ]);
}

export async function loadAllTasks(): Promise<TaskState[]> {
  await ensureStateDir();
  const files = await fs.readdir(STATE_DIR);
  const tasks: TaskState[] = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('.events.')) continue;
    const runId = file.replace('.json', '');
    const task = await loadTaskSnapshot(runId);
    if (task) tasks.push(task);
  }
  return tasks;
}
