#!/usr/bin/env node
// 运行任意工作流，并在同一进程内先执行 workflows/preflows/enabled.json 中的前置流程
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import WorkflowRunner from '../workflows/WorkflowRunner.js';

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.log('用法: node scripts/run-with-preflows.js <workflow.json> [--debug] [--sessionId=xxx]');
    process.exit(1);
  }
  const workflowPath = args[0].startsWith('.') || args[0].startsWith('/')
    ? join(process.cwd(), args[0])
    : join(process.cwd(), args[0]);
  if (!existsSync(workflowPath)) {
    console.error('❌ 工作流不存在:', workflowPath);
    process.exit(1);
  }
  // 解析参数：--debug、--sessionId，以及任意 --key=value 注入为运行参数
  const rest = args.slice(1);
  const debug = rest.includes('--debug');
  const parameters = {};
  for (const a of rest) {
    if (!a.startsWith('--')) continue;
    if (a === '--debug') continue;
    const eq = a.indexOf('=');
    if (eq > 2) {
      const k = a.slice(2, eq);
      const v = a.slice(eq + 1);
      parameters[k] = v;
    }
  }
  const sessionId = parameters.sessionId;

  const runner = new WorkflowRunner();
  const result = await runner.runWorkflow(workflowPath, { debug, sessionId, ...parameters });
  console.log('📦 执行完成:', result.success ? '✅ 成功' : '❌ 失败');
  if (!result.success) {
    console.error('错误:', result.error);
    process.exit(1);
  }
}

main().catch(err => { console.error('💥 运行错误:', err?.message || err); process.exit(1); });
