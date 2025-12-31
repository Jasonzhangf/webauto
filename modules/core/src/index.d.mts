export interface StateBus {
  register(module: string, options?: Record<string, any>): void;
  setState(module: string, state: Record<string, any>): void;
  publish(event: string, data: Record<string, any>): void;
}

export function getStateBus(): StateBus;
export { StateBus as StateBusClass };
