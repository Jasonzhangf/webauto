import { app } from 'electron';

console.log('[preload-test] Starting test...');

app.whenReady().then(() => {
  console.log('[preload-test] app.whenReady() OK');
  process.exit(0);
}).catch(err => {
  console.error('[preload-test] failed:', err);
  process.exit(1);
});

