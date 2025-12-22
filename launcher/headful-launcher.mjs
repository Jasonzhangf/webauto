#!/usr/bin/env node
import { startAll } from './core/launcher.mjs';

const args = process.argv.slice(2);
const profile = args.find(a => a.startsWith('--profile='))?.split('=')[1] || 'weibo_fresh';
const url = args.find(a => a.startsWith('--url='))?.split('=')[1] || 'https://weibo.com';
const headless = args.includes('--headless');

startAll({ profile, url, headless }).catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
