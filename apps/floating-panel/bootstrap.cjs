const path = require('path');
require('child_process').spawnSync('node', [
  '--input-type=module',
  '-e',
  `import('file://' + path.resolve(__dirname, 'dist/main/index.js'))`
], { stdio: 'inherit', cwd: __dirname });
