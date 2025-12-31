import { BrowserService } from '../../browser/src/service.mjs';
import type { OperationContext } from '../../operations/src/registry.js';

export interface BrowserContextProviderOptions {
  profile: string;
  host?: string;
  port?: number;
}

function sanitizeArg(arg: any) {
  if (typeof arg === 'undefined') {
    return null;
  }
  return arg;
}

function buildScript(fn: ((...args: any[]) => any) | string, args: any[]): string {
  if (typeof fn === 'string' && (!args || args.length === 0)) {
    return fn;
  }
  const source = typeof fn === 'function' ? fn.toString() : fn;
  const serializedArgs = JSON.stringify((args || []).map(sanitizeArg));
  return `(() => {
    const __name = (target, value) => {
      try {
        Object.defineProperty(target, 'name', { value, configurable: true });
      } catch {}
      return target;
    };
    const __fn = ${source};
    const __args = ${serializedArgs};
    return Promise.resolve(__fn(...__args));
  })()`;
}

export class BrowserWorkflowContextProvider {
  private service: BrowserService;
  private profile: string;

  constructor(options: BrowserContextProviderOptions) {
    this.profile = options.profile;
    const serviceOptions: Record<string, any> = {};
    if (options.host) serviceOptions.host = options.host;
    if (typeof options.port === 'number') serviceOptions.port = options.port;
    this.service = new BrowserService(serviceOptions);
  }

  async createContext(): Promise<OperationContext> {
    return {
      page: {
        evaluate: async (fn: any, ...args: any[]) => this.evaluate(fn, args),
      },
      logger: console,
    };
  }

  private async evaluate(fn: any, args: any[]) {
    const script = buildScript(fn, args);
    if (process.env.WORKFLOW_CONTEXT_DEBUG === '1') {
      console.debug('[workflow:context] evaluate fn:', typeof fn === 'function' ? fn.toString() : fn);
      console.debug('[workflow:context] script:', script);
    }
    const response = await this.service.command('evaluate', {
      profileId: this.profile,
      script,
    });
    if (response?.ok === false) {
      throw new Error(response?.error || 'evaluate failed');
    }
    return typeof response?.result === 'undefined' ? response : response.result;
  }
}
