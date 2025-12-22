// 行为记录模块：集中式事件/操作记录 + 可选页面事件接入
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default class BehaviorRecorder {
  constructor({ workflow = 'workflow', sessionId = 'unknown', sessionDir = '', publish } = {}) {
    this.workflow = workflow;
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.events = [];
    this.max = 5000; // 简单上限
    this.publish = typeof publish === 'function' ? publish : null;
  }

  record(type, data = {}, level = 'info') {
    const evt = { ts: Date.now(), type, level, workflow: this.workflow, sessionId: this.sessionId, ...data };
    this.events.push(evt);
    if (this.events.length > this.max) this.events.shift();
    if (this.publish) {
      try {
        this.publish(type, evt);
      } catch {}
    }
  }

  recordAction(action, payload = {}) {
    this.record('action', { action, ...payload });
  }

  attachPage(page) {
    try {
      page.on('console', msg => this.record('console', { type: msg.type(), text: msg.text() }));
    } catch {}
    try {
      page.on('pageerror', err => this.record('pageerror', { message: err?.message }));
    } catch {}
    try {
      page.on('request', req => this.record('request', { url: req.url(), method: req.method(), resourceType: req.resourceType() }));
      page.on('response', res => this.record('response', { url: res.url(), status: res.status() }));
    } catch {}
    try {
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.record('framenavigated', { url: frame.url() }); });
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

