#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase1：基础服务就绪检查
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const BROWSER_SERVICE = 'http://127.0.0.1:7704';

async function ensureServices() {
  console.log('⏳ 检查基础服务...');
  
  // 检查 Unified API
  const ua = await fetch(`${UNIFIED_API}/health`);
  if (!ua.ok) throw new Error('Unified API 未就绪');
  console.log('✅ Unified API 已在线');
  
  // 检查 Browser Service
  const bs = await fetch(`${BROWSER_SERVICE}/health`);
  if (!bs.ok) throw new Error('Browser Service 未就绪');
  console.log('✅ Browser Service 已在线');
}

async function main() {
  try {
    await ensureServices();
    console.log('✅ Phase1：基础服务就绪');
    process.exit(0);
  } catch (err) {
    console.error('❌ Phase1 失败:', err.message);
    process.exit(1);
  }
}

main();
