type StatePayload = Record<string, unknown>;

class LocalStateBus {
  private readonly state = new Map<string, StatePayload>();
  private readonly subscribers = new Map<string, Array<(payload: unknown) => void>>();

  setState(key: string, payload: StatePayload): void {
    this.state.set(key, { ...payload, lastUpdate: Date.now() });
    this.publish(`state:${key}`, this.state.get(key));
  }

  getState(key?: string): StatePayload | Record<string, StatePayload> | undefined {
    if (key) return this.state.get(key);
    return Object.fromEntries(this.state);
  }

  publish(event: string, payload: unknown): void {
    const listeners = this.subscribers.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Keep runtime event pipeline resilient.
      }
    }
  }

  subscribe(event: string, listener: (payload: unknown) => void): () => void {
    const current = this.subscribers.get(event) || [];
    current.push(listener);
    this.subscribers.set(event, current);
    return () => {
      const next = (this.subscribers.get(event) || []).filter((fn) => fn !== listener);
      if (next.length === 0) {
        this.subscribers.delete(event);
      } else {
        this.subscribers.set(event, next);
      }
    };
  }
}

let stateBus: LocalStateBus | null = null;

export function getStateBus(): LocalStateBus {
  if (!stateBus) stateBus = new LocalStateBus();
  return stateBus;
}

export { LocalStateBus };
