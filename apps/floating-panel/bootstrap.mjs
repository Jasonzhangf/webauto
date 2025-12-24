import path from 'node:path';
import { spawnSync } from 'node:child_process';

spawnSync('node', [
  '--input-type=module',
  '-e',
  `import('file://' + path.resolve(new URL('.', import.meta.url).pathname, 'dist/main/index.js'))`
], { stdio: 'inherit', cwd: new URL('.', import.meta.url).pathname });
