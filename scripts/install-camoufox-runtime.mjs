#!/usr/bin/env node
/**
 * Ensure camoufox runtime is installed for camo CLI.
 * - macOS/Linux: python3 -m camoufox fetch
 * - Windows: py -m camoufox fetch (fallback to python -m ...)
 */
import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function main() {
  const isWin = process.platform === 'win32';
  
  try {
    if (isWin) {
      try {
        await run('py', ['-m', 'camoufox', 'fetch']);
      } catch {
        await run('python', ['-m', 'camoufox', 'fetch']);
      }
    } else {
      await run('python3', ['-m', 'camoufox', 'fetch']);
    }
    console.log('[install-camoufox-runtime] camoufox runtime ready');
  } catch (err) {
    console.warn(`[install-camoufox-runtime] skipped: ${err?.message || err}`);
    console.warn('[install-camoufox-runtime] you can run manually: python3 -m camoufox fetch');
  }
}

main();
