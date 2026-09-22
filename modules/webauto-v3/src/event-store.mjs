// Append-only JSONL event store. Single source of control truth.
// Replays must rebuild run state without re-executing terminal operations.

import fs from 'node:fs';
import path from 'node:path';
import { newEventId } from './ids.mjs';

function resolveRunDir(runId, explicitDir) {
  if (explicitDir) return path.resolve(explicitDir);
  const root = process.env.WEBAUTO_V3_RUN_DIR
    || path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), '.webauto', 'state', 'webauto-v3');
  return path.join(root, runId);
}

export class EventStore {
  constructor({ runId, dir, create = true } = {}) {
    if (!runId) throw new Error('EventStore requires runId');
    this.runId = runId;
    this.dir = resolveRunDir(runId, dir);
    this.filePath = path.join(this.dir, 'events.jsonl');
    this._seq = 0;
    this._terminalIndex = new Map();
    this._cachedEvents = null;
    if (create) {
      fs.mkdirSync(this.dir, { recursive: true });
      if (!fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, '', 'utf8');
      }
    }
  }

  file() {
    return this.filePath;
  }

  load() {
    let raw = '';
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      raw = '';
    }
    this._cachedEvents = [];
    this._terminalIndex.clear();
    let lastSeq = 0;
    if (raw) {
      let lineNumber = 0;
      for (const line of raw.split('\n')) {
        lineNumber++;
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch (error) {
          throw new Error(`invalid event JSON at ${this.filePath}:${lineNumber}: ${error.message}`);
        }
        if (!event || typeof event !== 'object') {
          throw new Error(`invalid event object at ${this.filePath}:${lineNumber}`);
        }
        if (!Number.isFinite(Number(event.seq))) {
          throw new Error(`invalid event seq at ${this.filePath}:${lineNumber}`);
        }
        event.seq = Number(event.seq);
        this._cachedEvents.push(event);
        if (event.seq > lastSeq) lastSeq = event.seq;
        const terminal = this._extractTerminal(event);
        if (terminal) this._terminalIndex.set(terminal.key, terminal);
      }
    }
    this._seq = lastSeq;
    return this._cachedEvents;
  }

  _extractTerminal(event) {
    if (!['OperationSucceeded', 'OperationFailed'].includes(event.type)) {
      return null;
    }
    const key = event.idempotency_key
      || (event.payload && event.payload.idempotency_key)
      || null;
    if (!key) return null;
    const status = event.type === 'OperationSucceeded'
      ? 'succeeded'
      : 'failed';
    return { key, status, event_id: event.event_id };
  }

  terminalStatus(idempotencyKey) {
    if (!idempotencyKey) return null;
    this.load();
    return this._terminalIndex.get(idempotencyKey) || null;
  }

  append(event) {
    if (!event || typeof event !== 'object') throw new Error('event must be an object');
    if (!event.type) throw new Error('event.type is required');
    if (!event.run_id) event.run_id = this.runId;
    if (!event.source) event.source = 'runtime';
    this.load();
    const seq = this._seq + 1;
    const out = {
      event_id: event.event_id || newEventId(),
      run_id: event.run_id,
      seq,
      type: event.type,
      source: event.source,
      page_revision: event.page_revision || null,
      container_id: event.container_id || null,
      node_id: event.node_id || null,
      operation_id: event.operation_id || null,
      causation_id: event.causation_id || null,
      correlation_id: event.correlation_id || null,
      workflow_run_id: event.workflow_run_id || null,
      workflow_node_id: event.workflow_node_id || null,
      binding_id: event.binding_id || null,
      invocation_id: event.invocation_id || null,
      item_key: event.item_key || null,
      idempotency_key: event.idempotency_key || null,
      payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
      timestamp: event.timestamp || new Date().toISOString(),
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(out)}\n`, 'utf8');
    this._seq = seq;
    this._cachedEvents.push(out);
    const terminal = this._extractTerminal(out);
    if (terminal) this._terminalIndex.set(terminal.key, terminal);
    return out;
  }

  events() {
    this.load();
    return this._cachedEvents.slice();
  }

}
