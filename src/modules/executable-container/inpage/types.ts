export interface StartOptions {
  site?: string;
  longPressMs?: number;
  minTargetSize?: number;
  highlight?: { color?: string; duration?: number; label?: string };
  debug?: boolean;
  showContainerTree?: boolean;
}

export interface ExecutableContainerRuntimeEvent {
  name: string; // e.g. 'appear', 'action:click'
  node: string; // e.g. 'EventDrivenOptionalClickNode'
  params?: Record<string, any>;
  guards?: Record<string, any>;
}

export interface ExecutableOperation {
  key: string; // e.g. 'highlight', 'click'
  label: string;
  event?: string; // link to runtime.events[name]
  node?: string;
  params?: Record<string, any>;
}

export interface ExecutableContainerRuntime {
  events: ExecutableContainerRuntimeEvent[];
  operations: ExecutableOperation[];
  flags?: { placeholder?: boolean };
}

export interface ExecutableContainerDefinition {
  id?: string;
  website?: string;
  name?: string;
  selector: string;
  type?: string;
  priority?: number;
  validation?: Record<string, any>;
  discovery?: Record<string, any>;
  metadata?: Record<string, any>;
  relationships?: { parentCandidates?: string[] };
  runtime: ExecutableContainerRuntime;
}

export interface ContainerInstance {
  instanceId: string;
  definition: ExecutableContainerDefinition;
  element?: Element | null;
  selector: string;
  type?: string;
  parentId?: string | null;
  childrenIds?: string[];
  createdAt: number;
}

export interface ParentChain {
  chain: string[]; // list of definition ids or selectors from leaf to root
}

export interface RegistryState {
  instances: Map<string, ContainerInstance>;
}

export interface PickerPublicAPI {
  start: (options?: StartOptions) => void;
  stop: () => void;
  getState: () => { picking: boolean; instances: number };
}

declare global {
  interface Window {
    __webautoPicker?: PickerPublicAPI;
    __webautoHighlight?: any;
    __containerIndex?: any;
    __webautoContainerTree?: any;
    webauto_dispatch?: (evt: any) => void; // node bridge hook
  }
}

