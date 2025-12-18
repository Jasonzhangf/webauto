import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import WebSocket from 'ws';

export class ControllerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.endpoint = options.endpoint;
    this.repoRoot = options.repoRoot;
    this.messageBus = options.messageBus;
    this.autoStart = options.autoStart !== false;
    this.spawnScript =
      options.spawnScript || (this.repoRoot ? path.join(this.repoRoot, 'services/controller/src/server.mjs') : null);
    this.spawnArgs = options.spawnArgs || [];
    this.nodeBinary = options.nodeBinary || process.env.WEBAUTO_NODE_BINARY || process.env.npm_node_execpath || 'node';
    this.spawnEnv = options.spawnEnv || {};
    this.logger = options.logger || console;
    this.requestSeq = 0;
    this.pending = new Map();
    this.socket = null;
    this.connectPromise = null;
    this.controllerProcess = null;
    this.disposed = false;
  }

  async init() {
    if (this.disposed) return;
    if (this.autoStart) {
      await this.ensureProcess();
    }
    try {
      await this.ensureSocket();
    } catch (err) {
      this.logger.warn('[controller-client] initial connect failed', err?.message || err);
    }
  }

  async call(action, payload = {}) {
    if (!action) {
      throw new Error('Missing action');
    }
    const socket = await this.ensureSocket();
    const requestId = ++this.requestSeq;
    const envelope = {
      type: 'action',
      action,
      payload,
      requestId,
    };
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`controller timeout (${action})`));
      }, 30000);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(envelope), (err) => {
          if (err) {
            clearTimeout(timer);
            this.pending.delete(requestId);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
    if (response && response.type === 'response') {
      return {
        success: response.success,
        error: response.error,
        data: response.data,
      };
    }
    return response;
  }

  async captureSnapshot(options = {}) {
    const response = await this.call('containers:inspect', options);
    if (!response?.success) {
      throw new Error(response?.error || '容器视图抓取失败');
    }
    const data = response.data || {};
    return {
      sessionId: data.sessionId || data.session_id || 'unknown-session',
      profileId: data.profileId || data.profile_id || options.profile || 'default',
      targetUrl: data.url || data.targetUrl || options.url,
      snapshot: data.snapshot || data.containerSnapshot || null,
    };
  }

  async captureBranch(options = {}) {
    const response = await this.call('containers:inspect-branch', options);
    if (!response?.success) {
      throw new Error(response?.error || '无法获取 DOM 分支');
    }
    const data = response.data || {};
    return {
      sessionId: data.sessionId || data.profileId || options.profile || 'unknown-session',
      profileId: data.profileId || data.profile || options.profile || 'default',
      targetUrl: data.url || data.targetUrl || options.url,
      branch: data.branch || null,
    };
  }

  async ensureSocket() {
    if (this.disposed) {
      throw new Error('controller client disposed');
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }
    if (!this.endpoint) {
      throw new Error('controller endpoint is not configured');
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.endpoint);
      const handleOpen = () => {
        this.logger.log('[controller-client] connected to', this.endpoint);
        ws.off('error', handleError);
        this.connectPromise = null;
        this.socket = ws;
        ws.on('message', (raw) => this.handleSocketMessage(raw));
        ws.on('close', () => this.handleSocketClose());
        ws.on('error', (err) => this.logger.warn('[controller-client] socket error', err?.message || err));
        resolve(ws);
      };
      const handleError = (err) => {
        ws.off('open', handleOpen);
        ws.off('error', handleError);
        this.connectPromise = null;
        reject(err);
      };
      ws.once('open', handleOpen);
      ws.once('error', handleError);
    });
    try {
      await this.connectPromise;
      return this.socket;
    } catch (err) {
      if (this.autoStart) {
        await this.ensureProcess();
        return this.ensureSocket();
      }
      throw err;
    }
  }

  handleSocketMessage(raw) {
    let message = null;
    try {
      message = JSON.parse(raw.toString());
    } catch (err) {
      this.logger.warn('[controller-client] invalid message', err?.message || err);
      return;
    }
    if (!message) return;
    this.logger.log('[controller-client] recv', message.type, message.action || message.topic || '');
    if (message.type === 'event' && message.topic) {
      this.messageBus?.publish?.(message.topic, message.payload);
      this.emit('event', message);
      return;
    }
    if (message.type === 'response') {
      const requestId = message.requestId;
      const pending = this.pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.resolve(message);
      }
      return;
    }
    if (message.type === 'ready') {
      this.emit('ready');
      return;
    }
    if (message.type === 'error') {
      const requestId = message.requestId;
      const pending = requestId ? this.pending.get(requestId) : null;
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(new Error(message.error || 'controller error'));
      } else {
        this.logger.warn('[controller-client] error from server', message.error || message);
      }
    }
  }

  handleSocketClose() {
    if (this.disposed) return;
    this.logger.warn('[controller-client] socket closed, retrying...');
    this.socket = null;
    this.pending.forEach(({ reject, timer }, requestId) => {
      clearTimeout(timer);
      reject(new Error('controller disconnected'));
    });
    this.pending.clear();
    setTimeout(() => {
      if (!this.disposed) {
        this.ensureSocket().catch((err) => {
          this.logger.warn('[controller-client] reconnect failed', err?.message || err);
        });
      }
    }, 1000);
  }

  async ensureProcess() {
    if (this.disposed || this.controllerProcess || !this.spawnScript) {
      return;
    }
    const env = {
      ...process.env,
      WEBAUTO_REPO_ROOT: this.repoRoot || process.env.WEBAUTO_REPO_ROOT,
      ...this.spawnEnv,
    };
    const portMatch = this.endpoint?.match(/:(\d+)(\/|$)/);
    if (portMatch) {
      env.WEBAUTO_CONTROLLER_PORT = portMatch[1];
    }
    this.logger.log('[controller-client] spawning controller service');
    this.controllerProcess = spawn(this.nodeBinary, [this.spawnScript, ...this.spawnArgs], {
      cwd: this.repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.controllerProcess.stdout.on('data', (chunk) => {
      this.logger.log(`[controller] ${chunk.toString().trim()}`);
    });
    this.controllerProcess.stderr.on('data', (chunk) => {
      this.logger.warn(`[controller] ${chunk.toString().trim()}`);
    });
    this.controllerProcess.on('exit', (code, signal) => {
      this.logger.log('[controller-client] controller exited', code, signal);
      this.controllerProcess = null;
      if (!this.disposed) {
        setTimeout(() => this.ensureProcess().catch(() => {}), 2000);
      }
    });
  }

  async dispose() {
    this.disposed = true;
    if (this.socket) {
      try {
        this.socket.terminate();
      } catch {
        // ignore
      }
    }
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('controller disposed'));
    });
    this.pending.clear();
    if (this.controllerProcess) {
      this.controllerProcess.removeAllListeners();
      this.controllerProcess.kill();
      this.controllerProcess = null;
    }
  }
}
