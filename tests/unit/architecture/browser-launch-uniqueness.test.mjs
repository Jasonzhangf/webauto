import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Test: Browser launch uniqueness
 * 
 * Ensures that only modules/camo-backend/src/internal/engine-manager.ts
 * contains the Camoufox() browser launch call, and that BrowserSession.ts
 * only launches browsers through launchEngineContext.
 */

const REPO_ROOT = path.resolve(process.cwd());
const ENGINE_MANAGER_PATH = path.join(REPO_ROOT, 'modules/camo-backend/src/internal/engine-manager.ts');
const BROWSER_SESSION_PATH = path.join(REPO_ROOT, 'modules/camo-backend/src/internal/BrowserSession.ts');

function scanAllSourceFiles(dir, exclude = ['node_modules', 'dist', '.git']) {
  const files = [];
  const scan = (d) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (exclude.includes(f)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { scan(full); continue; }
      if (/\.(m?js|ts|mts|mjs)$/.test(f)) {
        files.push(full);
      }
    }
  };
  scan(dir);
  return files;
}

test('engine-manager.ts exists and contains Camoufox launch', () => {
  assert.ok(fs.existsSync(ENGINE_MANAGER_PATH), `engine-manager.ts should exist at ${ENGINE_MANAGER_PATH}`);
  const content = fs.readFileSync(ENGINE_MANAGER_PATH, 'utf-8');
  assert.ok(/Camoufox\s*\(/.test(content), 'engine-manager.ts should contain Camoufox() call');
});

test('BrowserSession.ts exists and uses launchEngineContext', () => {
  assert.ok(fs.existsSync(BROWSER_SESSION_PATH), `BrowserSession.ts should exist at ${BROWSER_SESSION_PATH}`);
  const content = fs.readFileSync(BROWSER_SESSION_PATH, 'utf-8');
  assert.ok(/launchEngineContext/.test(content), 'BrowserSession.ts should call launchEngineContext');
  assert.ok(!/Camoufox\s*\(/.test(content), 'BrowserSession.ts should NOT directly call Camoufox()');
});

test('Camoufox() browser CONTEXT launch is ONLY in engine-manager.ts', () => {
  const modulesDir = path.join(REPO_ROOT, 'modules');
  const servicesDir = path.join(REPO_ROOT, 'services');
  const appsDir = path.join(REPO_ROOT, 'apps');
  
  const allFiles = [
    ...scanAllSourceFiles(modulesDir),
    ...scanAllSourceFiles(servicesDir),
    ...scanAllSourceFiles(appsDir),
  ];

  const camoufoxLaunchFiles = [];
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Look for Camoufox() as a function call that returns a browser context
    // Pattern: const result = await Camoufox({...})
    if (/await\s+Camoufox\s*\(/.test(content) || /=\s*Camoufox\s*\(/.test(content)) {
      camoufoxLaunchFiles.push(file);
    }
  }

  // Filter out test files
  const nonTestLaunchFiles = camoufoxLaunchFiles.filter(f => !f.includes('.test.') && !f.includes('/test/'));
  
  assert.equal(
    nonTestLaunchFiles.length, 
    1, 
    `Camoufox() context launch should be in exactly 1 non-test file, found: ${nonTestLaunchFiles.join(', ')}`
  );
  assert.equal(
    nonTestLaunchFiles[0], 
    ENGINE_MANAGER_PATH, 
    `Camoufox() should only be in engine-manager.ts`
  );
});

test('launchEngineContext is defined only in engine-manager.ts', () => {
  const modulesDir = path.join(REPO_ROOT, 'modules');
  const files = scanAllSourceFiles(modulesDir);
  
  const exportLaunchFiles = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    // Check for function definition/export
    if (/export\s+(async\s+)?function\s+launchEngineContext/.test(content)) {
      exportLaunchFiles.push(file);
    }
  }

  assert.equal(
    exportLaunchFiles.length, 
    1, 
    `launchEngineContext should be defined in exactly 1 file, found: ${exportLaunchFiles.join(', ')}`
  );
  assert.equal(
    exportLaunchFiles[0], 
    ENGINE_MANAGER_PATH, 
    `launchEngineContext should only be defined in engine-manager.ts`
  );
});

test('no direct playwright browser.launch or browser.launchPersistentContext in modules/services/apps', () => {
  const modulesDir = path.join(REPO_ROOT, 'modules');
  const servicesDir = path.join(REPO_ROOT, 'services');
  const appsDir = path.join(REPO_ROOT, 'apps');
  
  const allFiles = [
    ...scanAllSourceFiles(modulesDir),
    ...scanAllSourceFiles(servicesDir),
    ...scanAllSourceFiles(appsDir),
  ];

  const directLaunchFiles = [];
  for (const file of allFiles) {
    if (file.includes('.test.') || file.includes('/test/')) continue;
    const content = fs.readFileSync(file, 'utf-8');
    // Check for direct playwright browser launch patterns (chromium.launch, browser.launch, etc)
    // But NOT launchEngineContext which is our abstraction
    if (/\b(chromium|firefox|webkit)\s*\.\s*launch\s*\(/.test(content)) {
      directLaunchFiles.push(file);
    }
    if (/\b(chromium|firefox|webkit)\s*\.\s*launchPersistentContext\s*\(/.test(content)) {
      directLaunchFiles.push(file);
    }
    // Also check for browser.launch from playwright direct import
    if (/\bbrowser\s*\.\s*launch\s*\(/.test(content) && !content.includes('launchEngineContext')) {
      // Make sure it's not just a variable named browser in a different context
      if (/from\s+['"`]playwright['"`]/.test(content)) {
        directLaunchFiles.push(file);
      }
    }
  }

  assert.equal(
    directLaunchFiles.length, 
    0, 
    `No direct playwright browser launch calls should exist, found: ${directLaunchFiles.join(', ')}`
  );
});

test('chromium engine is removed (throws error)', () => {
  const content = fs.readFileSync(ENGINE_MANAGER_PATH, 'utf-8');
  assert.ok(/throw\s+new\s+Error\s*\(\s*['"`]chromium_removed['"`]\s*\)/.test(content), 
    'engine-manager.ts should throw chromium_removed error for chromium engine');
  // No chromium support in engine type
  assert.ok(!/engine\s*===\s*['"`]chromium['"`]/.test(content), 
    'engine-manager.ts should not support chromium engine type');
});

test('engine-manager uses only Camoufox for browser launch', () => {
  const content = fs.readFileSync(ENGINE_MANAGER_PATH, 'utf-8');
  // Verify the engine type is constrained
  assert.ok(/engine\s*===\s*['"`]camoufox['"`]/.test(content), 
    'engine-manager.ts should check for camoufox engine');
  // No chromium/firefox/webkit engine support
  assert.ok(!/engine\s*===\s*['"`]chromium['"`]/.test(content), 'Should not support chromium engine');
  assert.ok(!/engine\s*===\s*['"`]firefox['"`]/.test(content), 'Should not support firefox engine');
  assert.ok(!/engine\s*===\s*['"`]webkit['"`]/.test(content), 'Should not support webkit engine');
});

test('browser session only imports browser types from playwright', () => {
  const content = fs.readFileSync(BROWSER_SESSION_PATH, 'utf-8');
  // Should import only types, not the full playwright library
  assert.ok(/import\s+type\s+\{[^}]*\}\s+from\s+['"`]playwright['"`]/.test(content), 
    'BrowserSession.ts should only import types from playwright');
  // Should NOT import chromium/firefox/webkit directly
  assert.ok(!/import\s+[^{]*\{[^}]*(chromium|firefox|webkit)[^}]*\}\s+from\s+['"`]playwright['"`]/.test(content),
    'BrowserSession.ts should NOT import browser instances from playwright');
});

test('only camo-backend module contains browser session management code', () => {
  const modulesDir = path.join(REPO_ROOT, 'modules');
  const modules = fs.readdirSync(modulesDir).filter(f => {
    const full = path.join(modulesDir, f);
    return fs.statSync(full).isDirectory();
  });

  const modulesWithBrowserLaunch = [];
  for (const mod of modules) {
    const modDir = path.join(modulesDir, mod);
    const files = scanAllSourceFiles(modDir);
    for (const file of files) {
      if (file.includes('.test.')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      // Check for browser launch patterns (Camoufox call, not just references)
      if (/await\s+Camoufox\s*\(/.test(content)) {
        modulesWithBrowserLaunch.push(mod);
        break;
      }
    }
  }

  assert.deepEqual(
    modulesWithBrowserLaunch.sort(),
    ['camo-backend'],
    `Only camo-backend should contain browser launch code, found: ${modulesWithBrowserLaunch.join(', ')}`
  );
});
