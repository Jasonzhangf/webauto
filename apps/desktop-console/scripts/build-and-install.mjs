#!/usr/bin/env node
/**
 * Build and globally install desktop-console
 * Usage: node scripts/build-and-install.mjs
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

console.log('[build-and-install] Building...');
execSync('npm run build', { cwd: APP_ROOT, stdio: 'inherit' });

console.log('[build-and-install] Installing globally...');
execSync('npm install -g .', { cwd: APP_ROOT, stdio: 'inherit' });

console.log('[build-and-install] Done');
