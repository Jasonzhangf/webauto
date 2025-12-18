declare global {
  interface Window {
    __webauto_controls__: Record<string, any>;
    bus?: any;
    floatingLogger?: {
      info: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
    };
    healthAPI?: {
      updateStatus: (status: any) => void;
      checkHealth: () => Promise<any>;
    };
  }
}

export {};
