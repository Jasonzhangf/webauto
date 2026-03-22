/**
 * wa stop - 停止任务
 */
import { header, ok, fail, info, json } from '../lib/output.mjs';
import { runCmd } from '../lib/cross-platform.mjs';

export async function stopCommand(args, opts) {
  const parsed = parseArgs(args);
  if (parsed.help) { printHelp(); return; }
  
  header('停止任务');
  
  if (parsed.all) {
    // Stop all tasks
    info('停止所有任务...');
    const result = runCmd('curl -s -X DELETE http://127.0.0.1:7701/api/v1/tasks');
    if (result.ok) {
      ok('所有任务已停止');
    } else {
      fail('停止任务失败');
    }
    return;
  }
  
  if (parsed.runId) {
    info(`停止任务: ${parsed.runId}`);
    const result = runCmd(`curl -s -X DELETE http://127.0.0.1:7701/api/v1/tasks/${parsed.runId}`);
    if (result.ok) {
      ok('任务已停止');
    } else {
      fail('停止任务失败');
    }
    return;
  }
  
  fail('请指定 --run-id <id> 或 --all');
  info('运行 wa stop -h 查看帮助');
}

function parseArgs(args) {
  const result = { help: false, runId: null, all: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h': case '--help':
        result.help = true; break;
      case '--run-id':
        result.runId = args[++i]; break;
      case '--all':
        result.all = true; break;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
用法: wa stop [选项]

选项:
  --run-id <id>      指定任务 ID
  --all              停止所有任务
  -h, --help         显示帮助
  `);
}
