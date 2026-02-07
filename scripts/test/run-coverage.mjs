#!/usr/bin/env node
/**
 * Unified test runner with c8 coverage (>=90% threshold)
 * 
 * Usage:
 *   node scripts/test/run-coverage.mjs
 *   node scripts/test/run-coverage.mjs --scope modules
 *   node scripts/test/run-coverage.mjs --scope services
 *   node scripts/test/run-coverage.mjs --scope xiaohongshu
 *   node scripts/test/run-coverage.mjs --report html
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { globSync } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');

const args = process.argv.slice(2);
const scope = args.find(a => a.startsWith('--scope'))?.split('=')[1] || 'all';
const report = args.find(a => a.startsWith('--report'))?.split('=')[1] || 'text';

// Coverage configuration
const coverageConfig = {
  modules: {
    pattern: 'modules/**/*.test.ts',
    src: 'modules',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.test.mts',
      '**/types.ts',
      '**/index.ts',
    ],
    threshold: 90,
  },
  services: {
    pattern: 'services/**/*.test.ts',
    src: 'services',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.test.mts',
    ],
    threshold: 90,
  },
  xiaohongshu: {
    pattern: 'modules/xiaohongshu/**/*.test.ts',
    src: 'modules/xiaohongshu',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.test.mts',
      '**/app/node_modules/**',
    ],
    threshold: 90,
  },
};

function findTestFiles(pattern) {
  return globSync(pattern, { cwd: rootDir, absolute: true });
}

async function runCoverage(config) {
  const reporters = report === 'html' 
    ? ['text', 'lcov', 'html'] 
    : ['text', 'lcov'];
  
  const c8Args = [
    '--reporter=' + reporters.join(','),
    '--all',
    '--src', config.src,
    '--lines', String(config.threshold),
    '--functions', String(config.threshold),
    '--branches', String(Math.max(80, config.threshold - 10)),
    '--statements', String(config.threshold),
    ...config.exclude.flatMap(e => ['--exclude', e]),
    'tsx',
    '--test',
  ];
  
  const testFiles = findTestFiles(config.pattern);
  if (testFiles.length === 0) {
    console.warn(`No test files found for pattern: ${config.pattern}`);
    return 0;
  }
  
  console.log(`Running ${testFiles.length} test files with ${config.threshold}% coverage threshold...`);
  
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['c8', ...c8Args, ...testFiles], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    
    child.on('exit', (code) => resolve(code));
    child.on('error', reject);
  });
}

async function main() {
  console.log('🧪 Unified Test Runner with Coverage\n');
  
  const scopes = scope === 'all' 
    ? ['modules', 'services', 'xiaohongshu']
    : [scope];
  
  let exitCode = 0;
  
  for (const s of scopes) {
    const config = coverageConfig[s];
    if (!config) {
      console.error(`Unknown scope: ${s}`);
      process.exit(1);
    }
    
    console.log(`\n📦 Running ${s} tests...`);
    const code = await runCoverage(config);
    if (code !== 0) exitCode = code;
  }
  
  if (exitCode === 0) {
    console.log('\n✅ All tests passed with coverage >= 90%');
  } else {
    console.log('\n❌ Tests failed or coverage below threshold');
  }
  
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
