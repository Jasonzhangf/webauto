import WebSocket from 'ws';
import chalk from 'chalk';
import { WebAutoConfig, CommandResult, PythonCommand } from '../types';

export class WsTransport {
  private config: WebAutoConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private connecting = false;
  private queue: Array<{resolve: (v: any)=>void; reject: (e:any)=>void; payload:any}> = [];
  private lastSentAt = 0;
  private minDelayMs = 800; // 反风控：命令间最小间隔
  private jitterMs = 500;   // 反风控：抖动

  constructor(config: WebAutoConfig) {
    this.config = config;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      // wait until connected
      while (this.connecting) await new Promise(r => setTimeout(r, 50));
      return;
    }
    this.connecting = true;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.config.websocketUrl);
      ws.on('open', () => {
        this.ws = ws;
        this.connected = true;
        this.connecting = false;
        if (this.config.verbose) console.log(chalk.gray('[WS] connected'));
        resolve();
      });
      ws.on('error', (err) => {
        this.connecting = false;
        reject(err);
      });
      ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        if (this.config.verbose) console.log(chalk.gray('[WS] closed'));
      });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // 简化：一个请求一个响应，先进先出
          const next = this.queue.shift();
          if (next) {
            next.resolve(msg);
          }
        } catch (e) {
          const next = this.queue.shift();
          if (next) next.reject(e);
        }
      });
    });
  }

  private async antiBotDelay(): Promise<void> {
    const now = Date.now();
    const delta = now - this.lastSentAt;
    if (delta < this.minDelayMs) {
      const rest = this.minDelayMs - delta + Math.floor(Math.random() * this.jitterMs);
      await new Promise(r => setTimeout(r, rest));
    } else {
      // small base jitter anyway
      const rest = Math.floor(200 + Math.random() * 200);
      await new Promise(r => setTimeout(r, rest));
    }
    this.lastSentAt = Date.now();
  }

  async execute(command: PythonCommand, sessionId?: string): Promise<CommandResult> {
    await this.ensureConnected();
    await this.antiBotDelay();

    const request = {
      type: 'command',
      session_id: sessionId || (command.parameters as any)?.sessionId || '',
      data: command,
      timestamp: Date.now()
    };

    const response = await new Promise<any>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }
      this.queue.push({ resolve, reject, payload: request });
      try {
        this.ws.send(JSON.stringify(request));
      } catch (e) {
        this.queue.pop();
        reject(e);
      }
    });

    const ok = response?.data?.success === true || response?.type === 'response';
    return {
      success: !!ok,
      data: response?.data,
      result: response?.data,
      error: ok ? undefined : (response?.data?.error || response?.message || 'unknown error'),
      executionTime: 0
    };
  }
}
