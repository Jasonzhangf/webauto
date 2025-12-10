export interface UiControllerOptions {
  repoRoot?: string;
  messageBus?: {
    publish?: (topic: string, payload?: any) => void;
  };
  userContainerRoot?: string;
  containerIndexPath?: string;
  cliTargets?: Record<string, string>;
  defaultWsHost?: string;
  defaultWsPort?: number | string;
  defaultHttpHost?: string;
  defaultHttpPort?: number | string;
  defaultHttpProtocol?: string;
}

export class UiController {
  constructor(options?: UiControllerOptions);
  handleAction(action: string, payload?: Record<string, unknown>): Promise<any>;
  captureInspectorSnapshot(options?: Record<string, unknown>): Promise<any>;
  captureInspectorBranch(options?: Record<string, unknown>): Promise<any>;
}
