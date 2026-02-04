#!/usr/bin/env node
/**
 * Start Unified API in background (for local dev).
 * 
 * Why: many scripts assume http://127.0.0.1:7701 is up; starting only browser-service is not enough.
 * This helper makes it explicit and gives a pid file.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pidFile = path.join(os.homedir(), '.webauto', 'run', 'unified-api.pid');
fs.mkdirSync(path.dirname(pidFile), { recursive: true });

const child = spawn('node', ['dist/services/unified-api/server.js'], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env },
});
child.unref();

fs.writeFileSync(pidFile, String(child.pid), 'utf8');
console.log(`Unified API started in background (pid=${child.pid}) on http://127.0.0.1:7701.`);
console.log(`PID file: ${pidFile}`);
