/**
 * wa status - 查看任务状态
 */
import { header, ok, fail, info, json, table } from '../lib/output.mjs';
import { runCmd } from '../lib/cross-platform.mjs';

export async function statusCommand(args, opts) {
  const parsed = parseArgs(args);
  if (parsed.help) { printHelp(); return; }
  
  header('WebAuto 任务状态');
  
  // Check daemon
  const daemonCheck = runCmd('curl -s http://127.0.0.1:7701/health');
  if (!daemonCheck.ok || !daemonCheck.stdout?.includes('"ok":true')) {
    fail('Unified API 服务未运行');
    info('运行 wa daemon start 启动服务');
    return;
  }
  
  // Get status
  const statusResult = runCmd('curl -s http://127.0.0.1:7701/api/v1/tasks');
  if (!statusResult.ok) {
    fail('获取状态失败');
    return;
  }
  
  let data;
  try {
    data = JSON.parse(statusResult.stdout);
  } catch {
    fail('解析状态失败');
    return;
  }
  
  if (parsed.json) {
    json(data);
    return;
  }
  
  // Format output
  const summary = data?.summary?.totals || {};
  const tasks = data?.detail || [];
  
  info(`总计: ${summary.total || 0} 个任务`);
  info(`运行中: ${summary.running || 0} | 完成: ${summary.succeeded || 0} | 失败: ${summary.failed || 0}`);
  
  if (tasks.length > 0) {
    console.log('');
    const rows = tasks.slice(0, 10).map(t => [
      t.runId?.slice(0, 8) || '?',
      t.status || '?',
      t.keyword || '-',
      t.progress ? `${t.progress}/${t.total || '?'}` : '-',
      t.exitReason || '-',
    ]);
    table(rows, [
      { label: 'RunID' },
      { label: '状态' },
      { label: '关键字' },
      { label: '进度' },
      { label: '原因' },
    ]);
  }
  
  // Specific run status
  if (parsed.runId) {
    console.log('');
    info(`任务详情: ${parsed.runId}`);
    const detailResult = runCmd(`curl -s http://127.0.0.1:7701/api/v1/tasks/${parsed.runId}`);
    if (detailResult.ok) {
      try {
        const detail = JSON.parse(detailResult.stdout);
        json(detail);
      } catch { /* ignore */ }
    }
  }
}

function parseArgs(args) {
  const result = { help: false, runId: null, json: false, watch: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h': case '--help':
        result.help = true; break;
      case '--run-id':
        result.runId = args[++i]; break;
      case '--json':
        result.json = true; break;
      case '--watch':
        result.watch = true; break;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
用法: wa status [选项]

选项:
  --run-id <id>      指定任务 ID
  --json             JSON 输出
  --watch            持续监控
  -h, --help         显示帮助
  `);
}
