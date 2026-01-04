import WebSocket from 'ws';

interface PublishPayload {
  messageType: string;
  payload?: any;
  source?: any;
}

interface SubscribePayload {
  pattern: string;
  options?: any;
}

interface RemoteMessage {
  type: string;
  message?: any;
}

/**
 * RemoteMessageBusClient
 * 通过 WebSocket (/bus) 连接 Unified API 的消息总线
 */
export class RemoteMessageBusClient {
  private url: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private subscriptions: Map<string, (msg: any) => void> = new Map();
  private pendingSubs: Map<string, string> = new Map();

  constructor(url: string) {
    this.url = url;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.connected = true;
        console.log(`[RemoteMessageBusClient] Connected to ${this.url}`);
        resolve();
      });

      this.ws.on('message', (data) => this.handleMessage(data.toString()));

      this.ws.on('close', () => {
        this.connected = false;
        console.warn('[RemoteMessageBusClient] Disconnected');
      });

      this.ws.on('error', (err) => {
        console.error('[RemoteMessageBusClient] Error:', err);
        reject(err);
      });
    });
  }

  public async publish(type: string, payload: any = {}, source: any = {}): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('Message bus not connected');
    }

    const message: PublishPayload = {
      messageType: type,
      payload,
      source
    };

    this.ws.send(JSON.stringify({ type: 'publish', ...message }));
  }

  public subscribe(pattern: string, handler: (msg: any) => void, options: any = {}): void {
    if (!this.ws || !this.connected) {
      throw new Error('Message bus not connected');
    }

    this.subscriptions.set(pattern, handler);
    this.ws.send(JSON.stringify({ type: 'subscribe', pattern, options }));
  }

  private handleMessage(raw: string): void {
    let msg: RemoteMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'message' && msg.message) {
      const message = msg.message;
      for (const [pattern, handler] of this.subscriptions.entries()) {
        if (this.matchesPattern(pattern, message.type)) {
          handler(message);
        }
      }
    }
  }

  private matchesPattern(pattern: string, type: string): boolean {
    const regex = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(type);
  }
}
