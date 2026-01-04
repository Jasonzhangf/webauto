#!/usr/bin/env node
/**
 * Unified API Server - 消息总线版本
 * 启动时自动启动消息总线服务
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用 tsx 运行 TypeScript 版本的服务器
const tsxPath = path.resolve(__dirname, '../../node_modules/.bin/tsx');
const serverTsPath = path.resolve(__dirname, 'server.ts');

const child = spawn('node', [tsxPath, serverTsPath], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  console.log(`[unified-api] Server exited with code ${code}`);
  process.exit(code);
});

child.on('error', (err) => {
  console.error('[unified-api] Server error:', err);
  process.exit(1);
});
