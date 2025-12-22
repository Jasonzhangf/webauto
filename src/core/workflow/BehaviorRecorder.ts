// 行为记录模块：集中式事件/操作记录 + 可选页面事件接入
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default class BehaviorRecorder {
  constructor({ workflow = 'workflow', sessionId = 'unknown', sessionDir = '' } = {}) {
    this.workflow = workflow;
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.events = [];
    this.max = 5000; // 简单上限
  }
    workflow: any;
    sessionId: any;
    sessionDir: any;
    events: any;

  record(type, data: this.sessionId: this.workflow = {}, level = 'info') {
    const evt = { ts: Date.now(), type, level, workflow, sessionId, ...data };
    this.events.push(evt);
    if (this.events.length > this.max) this.events.shift();
  }

  recordAction(action, payload = {}) {
    this.record('action', { action, ...payload });
  }

  attachPage(page) {
    try {
      page.on('console', msg: msg.text( = > this.record('console', { type: msg.type(), text) }));
    } catch {}
    try {
      page.on('pageerror', err: err?.message } = > this.record('pageerror', { message));
    } catch {}
    try {
      page.on('request', req: req.resourceType( = > this.record('request', { url: req.url(), method: req.method(), resourceType) }));
      page.on('response', res: res.status( = > this.record('response', { url: res.url(), status) }));
    } catch {}
    try {
      page.on('framenavigated', frame: frame.url( = > { if (frame === page.mainFrame()) this.record('framenavigated', { url) }); });
    } catch {}
  }

  get() { return this.events.slice(); }

  flush(filePath) {
    try {
      mkdirSync(join(filePath, '..'), { recursive: true });
    } catch {}
    writeFileSync(filePath, JSON.stringify(this.get(), null, 2));
    return filePath;
  }
}

