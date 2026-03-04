// services/unified-api/task-persistence.ts
// Simple JSONL persistence for task state

import fs from 'node:fs/promises';
import path from 'node:path';
import { applyCamoEnv } from '../../apps/webauto/entry/lib/camo-env.mjs';
import type { TaskState, TaskEvent } from './task-state.js';

applyCamoEnv();

function resolveStateDir(): string {
  const dataRoot = process.env.CAMO_DATA_ROOT || process.env.CAMO_HOME;
  if (!dataRoot) {
    throw new Error('CAMO_DATA_ROOT or CAMO_HOME is required for task persistence.');
  }
  return path.join(dataRoot, 'state');
}

export async function ensureStateDir(): Promise<void> {
  await fs.mkdir(resolveStateDir(), { recursive: true });
}

export async function saveTaskSnapshot(task: TaskState): Promise<void> {
  await ensureStateDir();
  const file = path.join(resolveStateDir(), `${task.runId}.json`);
  await fs.writeFile(file, JSON.stringify(task, null, 2), 'utf8');
}

export async function loadTaskSnapshot(runId: string): Promise<TaskState | null> {
  try {
    const file = path.join(resolveStateDir(), `${runId}.json`);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function appendEvent(event: TaskEvent): Promise<void> {
  await ensureStateDir();
  const file = path.join(resolveStateDir(), `${event.runId}.events.jsonl`);
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

export async function loadEvents(runId: string, since?: number): Promise<TaskEvent[]> {
  try {
    const file = path.join(resolveStateDir(), `${runId}.events.jsonl`);
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
  const dir = resolveStateDir();
  const snapshotFile = path.join(dir, `${runId}.json`);
  const eventsFile = path.join(dir, `${runId}.events.jsonl`);
  await Promise.all([
    fs.unlink(snapshotFile).catch(() => {}),
    fs.unlink(eventsFile).catch(() => {}),
  ]);
}

export async function loadAllTasks(): Promise<TaskState[]> {
  await ensureStateDir();
  const files = await fs.readdir(resolveStateDir());
  const tasks: TaskState[] = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('.events.')) continue;
    const runId = file.replace('.json', '');
    const task = await loadTaskSnapshot(runId);
    if (task) tasks.push(task);
  }
  return tasks;
}
