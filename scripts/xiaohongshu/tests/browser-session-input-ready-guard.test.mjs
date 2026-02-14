import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const browserSessionPath = path.resolve(
  process.cwd(),
  'services',
  'browser-service',
  'BrowserSession.ts',
);

test('browser session ensures input readiness before system input operations', async () => {
  const src = await readFile(browserSessionPath, 'utf8');
  assert.match(src, /private async ensureInputReady\(page: Page\): Promise<void>/);
  assert.match(src, /if \(os\.platform\(\) !== 'win32'\) return;/);
  assert.match(src, /await page\.bringToFront\(\);/);
  assert.match(src, /async mouseClick[\s\S]*?await this\.ensureInputReady\(page\);/);
  assert.match(src, /async mouseMove[\s\S]*?await this\.ensureInputReady\(page\);/);
  assert.match(src, /async keyboardType[\s\S]*?await this\.ensureInputReady\(page\);/);
  assert.match(src, /async keyboardPress[\s\S]*?await this\.ensureInputReady\(page\);/);
  assert.match(src, /async mouseWheel[\s\S]*?await this\.ensureInputReady\(page\);/);
});
