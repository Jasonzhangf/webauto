import { BrowserOperationContext, BrowserOperationConfig } from '../interfaces/IBrowserOperation';

// Re-export for compatibility
export { BrowserOperationConfig };

class Logger {
  constructor(private name: string) {}

  info(message: string, data?: any) {
    console.log(`[${this.name}] ${message}`, data || '');
  }

  warn(message: string, data?: any) {
    console.warn(`[${this.name}] ${message}`, data || '');
  }

  error(message: string, data?: any) {
    console.error(`[${this.name}] ${message}`, data || '');
  }

  debug(message: string, data?: any) {
    console.debug(`[${this.name}] ${message}`, data || '');
  }
}

export class BrowserContextManager {
  private contexts: Map<string, BrowserOperationContext> = new Map();
  private config: BrowserOperationConfig;

  constructor(config: BrowserOperationConfig) {
    this.config = config;
  }

  createContext(sessionId: string): BrowserOperationContext {
    const context: BrowserOperationContext = {
      id: sessionId,
      browser: null,
      page: null,
      metadata: {
        startTime: new Date(),
        userAgent: this.config.browser.userAgent,
        viewport: this.config.browser.viewport,
        config: this.config
      },
      logger: new Logger(`BrowserContext-${sessionId}`),
      eventBus: this.createEventBus(),
      cookies: new Map(),
      selectors: new Map()
    };

    this.contexts.set(sessionId, context);
    return context;
  }

  getContext(sessionId: string): BrowserOperationContext | undefined {
    return this.contexts.get(sessionId);
  }

  updateContext(sessionId: string, updates: Partial<BrowserOperationContext>): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      Object.assign(context, updates);
    }
  }

  removeContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }

  listContexts(): string[] {
    return Array.from(this.contexts.keys());
  }

  clearAll(): void {
    this.contexts.clear();
  }

  private createEventBus() {
    return {
      emit: (event: string, data: any) => {
        // Simple event bus implementation
        console.log(`[Event] ${event}:`, data);
      },
      on: (event: string, handler: (...args: any[]) => void) => {
        // Event listener registration
        process.on?.(event, handler);
      },
      off: (event: string, handler: (...args: any[]) => void) => {
        // Event listener removal
        process.off?.(event, handler);
      }
    };
  }
}