#!/usr/bin/env node
// Kill residual Chromium/Chrome/Camoufox/Playwright/Electron crash handlers on macOS/Linux
import { spawnSync } from 'node:child_process';

const patterns = [
  'Camoufox', 'camoufox', 'Chromium', 'chromium',
  'Google Chrome', 'chrome', 'chrome_crashpad_handler',
  'playwright', 'electron'
];

function pkill(pat){
  const r = spawnSync('pkill', ['-f', pat], { stdio: 'ignore' });
  return r.status===0;
}

for (const p of patterns){ try{ pkill(p); }catch{} }
console.log('Killed residual browser processes (best effort).');

