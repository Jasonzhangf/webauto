/**
 * 统一日志工具
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

class Logger {
  constructor(keyword, env) {
    this.keyword = keyword || 'unknown';
    this.env = env || 'download';
    this.logDir = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', this.env, this.keyword);
    fs.mkdirSync(this.logDir, { recursive: true });
    
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.logFile = path.join(this.logDir, `run.${ts}.log`);
    this.eventsFile = path.join(this.logDir, `run-events.${ts}.jsonl`);
  }

  log(msg, type = 'INFO') {
    const time = new Date().toISOString();
    const line = `[${time}] [${type}] ${msg}`;
    console.log(line);
    try {
      fs.appendFileSync(this.logFile, line + '\n');
    } catch {}
  }

  info(msg) { this.log(msg, 'INFO'); }
  warn(msg) { this.log(msg, 'WARN'); }
  error(msg) { this.log(msg, 'ERROR'); }

  event(type, data) {
    const event = {
      ts: new Date().toISOString(),
      type,
      ...data
    };
    try {
      fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n');
    } catch {}
  }
}

export default Logger;
