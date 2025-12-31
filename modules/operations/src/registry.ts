export interface OperationContext {
  containerId?: string;
  node?: any; // ContainerNodeRuntime or similar reference
  page: {
    evaluate(fn: (...args: any[]) => any, ...args: any[]): Promise<any>;
  };
  logger?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  systemInput?: {
    mouseMove: (x: number, y: number, steps?: number) => Promise<any>;
    mouseClick: (x: number, y: number, button?: string, clicks?: number) => Promise<any>;
  };
}

export interface OperationDefinition<TConfig = any> {
  id: string;
  description?: string;
  requiredCapabilities?: string[];
  run: (ctx: OperationContext, config: TConfig) => Promise<any>;
}

const registry = new Map<string, OperationDefinition>();

export function registerOperation<TConfig>(definition: OperationDefinition<TConfig>) {
  registry.set(definition.id, definition as OperationDefinition);
}

export function getOperation(id: string) {
  return registry.get(id);
}

export function listOperations() {
  return Array.from(registry.values());
}
