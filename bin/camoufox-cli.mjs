#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

function quoteCmdArg(value) {
  if (!value) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function spawnCommand(command, argv) {
  if (process.platform === 'win32') {
    const lower = String(command || '').toLowerCase();
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
      const cmdLine = [quoteCmdArg(command), ...argv.map(quoteCmdArg)].join(' ');
      return spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
        stdio: 'inherit',
        env: process.env,
        windowsHide: true,
      });
    }
  }
  return spawn(command, argv, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
}

function resolveCamoCommand() {
  const localCamo = path.join(ROOT, 'node_modules', '@web-auto', 'camo', 'bin', 'camo.mjs');
  if (fs.existsSync(localCamo)) {
    return { cmd: process.execPath, argv: [localCamo, ...args] };
  }

  const shim = process.platform === 'win32' ? 'camo.cmd' : 'camo';
  const localShim = path.join(ROOT, 'node_modules', '.bin', shim);
  if (fs.existsSync(localShim)) {
    return { cmd: localShim, argv: args };
  }

  return { cmd: shim, argv: args };
}

const { cmd, argv } = resolveCamoCommand();
const child = spawnCommand(cmd, argv);

child.on('error', (err) => {
  console.error(`Failed to start camoufox-cli: ${err?.message || String(err)}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
