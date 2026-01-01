declare module './container-operations.mjs' {
  export interface ContainerOperationsBindingState {
    bindingRules: Map<string, any>;
    getBindingRule: (id: string) => any;
    addBindingRule: (rule: any) => void;
    removeBindingRule: (id: string) => boolean;
  }

  export function setupContainerOperationsRoutes(
    app: any,
    sessionManager: any
  ): ContainerOperationsBindingState;
}

