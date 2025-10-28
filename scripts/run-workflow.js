#!/usr/bin/env node
// 运行指定的单个工作流（不触发全局前置流程）
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import WorkflowEngine from '../src/core/workflow/WorkflowEngine.js';

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log('用法: node scripts/run-workflow.js <workflow.json>');
    process.exit(1);
  }
  const workflowPath = args[0].startsWith('.') || args[0].startsWith('/')
    ? join(process.cwd(), args[0])
    : join(process.cwd(), args[0]);

  if (!existsSync(workflowPath)) {
    console.error('❌ 工作流不存在:', workflowPath);
    process.exit(1);
  }

  // 解析参数（--debug、--sessionId=...、以及任意 --key=value 注入为运行参数）
  const flags = args.slice(1);
  const debug = flags.includes('--debug');
  const parameters = {};
  for (const a of flags) {
    if (!a.startsWith('--')) continue;
    if (a === '--debug') continue;
    const idx = a.indexOf('=');
    if (idx > 2) {
      const k = a.slice(2, idx);
      const v = a.slice(idx + 1);
      parameters[k] = v;
    }
  }
  const sessionId = parameters.sessionId;

  const cfg = JSON.parse(readFileSync(workflowPath, 'utf8'));
  const engine = new WorkflowEngine();
  const res = await engine.executeWorkflow(cfg, { debug, sessionId, ...parameters });
  console.log('📦 执行完成:', res.success ? '✅ 成功' : '❌ 失败');
  if (!res.success) {
    console.error('错误:', res.error);
    process.exit(1);
  }
}

main().catch(err => { console.error('💥 运行错误:', err?.message || err); process.exit(1); });
