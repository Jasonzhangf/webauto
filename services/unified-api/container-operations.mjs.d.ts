export interface ContainerOperationsBindingState {
  bindingRules: Map<string, any>;
  getBindingRule: (id: string) => any;
  addBindingRule: (rule: any) => void;
  removeBindingRule: (id: string) => boolean;
}

// Thin type wrapper for the JS implementation in container-operations.mjs
export function setupContainerOperationsRoutes(
  app: any,
  sessionManager: any
): ContainerOperationsBindingState;


export function handleContainerOperationRequest(
  url: string,
  req: any,
  res: any,
  routes: any,
  readJsonBody: any
): Promise<void>;
