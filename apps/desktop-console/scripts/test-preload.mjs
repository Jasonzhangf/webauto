import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const appRoot = process.cwd();

const result = spawnSync('npx', [electronBin, '.'], {
  stdio: 'inherit',
  cwd: appRoot,
  env: { ...process.env, WEBAUTO_DESKTOP_CONSOLE_PRELOAD_TEST: '1' },
});

process.exit(result.status || 0);
