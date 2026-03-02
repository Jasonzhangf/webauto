import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveActionLogFile, resolveControlFile } from './paths.mts';
import { summarizeAction } from './utils.mts';

const CONTROL_FILE = resolveControlFile();
const UI_CLI_ACTION_LOG_FILE = resolveActionLogFile();

export async function writeControlFile(host: string, port: number) {
  const payload = {
    pid: process.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  };
  try {
    await fs.mkdir(path.dirname(CONTROL_FILE), { recursive: true });
    await fs.writeFile(CONTROL_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore control file write errors
  }
}

export async function removeControlFile() {
  try {
    await fs.unlink(CONTROL_FILE);
  } catch {
    // ignore cleanup errors
  }
}

export async function appendActionLog(entry: Record<string, any>) {
  const payload = { ts: new Date().toISOString(), ...entry };
  try {
    await fs.mkdir(path.dirname(UI_CLI_ACTION_LOG_FILE), { recursive: true });
    await fs.appendFile(UI_CLI_ACTION_LOG_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // ignore action log failures
  }
}

export function summarizeActionForLog(input: any) {
  return summarizeAction(input || {});
}
