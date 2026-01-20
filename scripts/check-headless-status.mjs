#!/usr/bin/env node
/**
 * 监控 headless 采集任务状态
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const baseDir = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', 'download', '雷军');
const logPath = path.join(baseDir, 'run-events.20260117-162223-pr68he.jsonl');

function tailLog(lines = 50) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}

function countCompleted() {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const contentMd = path.join(baseDir, entry.name, 'content.md');
        const commentsMd = path.join(baseDir, entry.name, 'comments.md');
        if (fs.existsSync(contentMd) && fs.existsSync(commentsMd)) {
          count++;
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('=== Headless 采集状态监控 ===\n');
  const completed = countCompleted();
  console.log(`已完成: ${completed}/50`);
  console.log(`目录: ${baseDir}\n`);

  console.log('=== 最近日志 ===');
  const logs = tailLog(30);
  for (const log of logs) {
    try {
      const obj = JSON.parse(log);
      if (obj.type === 'phase_end' || obj.type === 'note_persisted' || obj.type === 'error') {
        console.log(`[${obj.ts}] ${obj.type}: ${JSON.stringify(obj).substring(0, 100)}`);
      }
    } catch {}
  }
}

main();
