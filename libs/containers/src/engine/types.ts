// Container Engine v2 - Core Types (skeleton)
// Focus: tree discovery, parent-child registration, operation queue, focus, feedback, incremental loading

export type RunMode = 'sequential' | 'parallel';

export interface SelectorByClass {
  classes: string[]; // class names only (no XPath)
  variant?: 'primary' | 'backup';
  score?: number; // optional priority hint
}

export interface OperationDef {
  type:
    | 'find-child' // default operation: discover children within container scope
    | 'click'
    | 'scroll'
    | 'type'
    | 'waitFor'
    | 'custom';
  config?: Record<string, any>;
}

export interface PaginationConfig {
  mode: 'scroll' | 'click';
  targetSelector?: SelectorByClass; // for click-next
  maxSteps?: number; // safety guard
  delayMs?: number; // optional delay between steps
}

export interface ContainerDefV2 {
  id: string;
  name?: string;
  type?: string;
  scope?: string;
  pagePatterns?: string[]; // URL or route patterns for activation
  anchors?: SelectorByClass[]; // optional: dedicated root detection anchors; fallback to selectors
  selectors: SelectorByClass[]; // class-based selectors
  children?: string[]; // child container ids (static registration)
  dependsOn?: string[]; // dependencies within same page context
  capabilities?: string[];
  runMode?: RunMode; // default: sequential
  operations?: OperationDef[]; // default: [ { type: 'find-child' } ]
  pagination?: PaginationConfig; // incremental loading behavior
  version?: string;
  replacedBy?: string;
  reliability?: number; // 0..1
}

export type ContainerState = 'unknown' | 'located' | 'stable' | 'failed';

export interface BBox {
  x1: number; y1: number; x2: number; y2: number;
}

export interface OperationInstance {
  def: OperationDef;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  result?: any;
  error?: string;
}

export interface ContainerNodeRuntime {
  defId: string;
  state: ContainerState;
  handle?: any; // runtime handle (DOM element reference, selector, etc.)
  bbox?: BBox;
  visible?: boolean;
  score?: number;
  opQueue: OperationInstance[];
  runMode: RunMode;
  children: string[]; // realized child ids (runtime)
  feedback: { hits: number; fails: number; boundaryReached?: boolean };
}

export interface ContainerGraph {
  nodes: Map<string, ContainerNodeRuntime>;
  edges: { parentToChild: Array<{ parent: string; child: string }>; depends: Array<{ from: string; to: string }> };
  indices: {
    byName: Map<string, string>;
    byType: Map<string, string[]>;
    byScope: Map<string, string[]>;
    byCapability: Map<string, string[]>;
    byPagePattern: Map<string, string[]>;
  };
}

export interface PageContext {
  url: string;
  title?: string;
  lang?: string;
  theme?: 'light' | 'dark' | string;
  userAgent?: string;
}

export interface StrategyTrace {
  strategy: string;
  success: boolean;
  durationMs: number;
  details?: any;
}

export interface DiscoveryResult {
  candidates: Array<{ defId: string; score: number; bbox?: BBox; visible?: boolean; handle?: any }>;
  trace: StrategyTrace[];
}

// Workflow overlay: per-workflow behavior/operation overrides for containers
export interface BehaviorOverride {
  containerId: string;
  runMode?: RunMode;
  operations?: OperationDef[]; // replace default operations
  priority?: number; // optional ordering hint among siblings
  concurrency?: number; // for parallel mode
}

export interface WorkflowOverlay {
  id: string; // workflow id/instance id
  rootId: string;
  overrides?: BehaviorOverride[];
}

// Highlight options for focus visualization
export interface HighlightOptions {
  color?: string;       // default green for executing container
  durationMs?: number;  // if omitted, persistent highlight
  label?: string;       // optional label text
  persistent?: boolean; // true means do not auto-remove
}

// UI Rendering Events - for UI/Logic separation
export type UiRenderStyle = 'executing' | 'discovered' | 'completed' | 'failed' | 'matched' | 'focused';

export interface UiRenderEvent {
  type: 'highlight' | 'connection' | 'clear' | 'focus' | 'tree_update';
  data: {
    containerId?: string;
    containerName?: string;
    style?: UiRenderStyle;
    bbox?: BBox;
    handle?: any;
    label?: string;
    color?: string;
    from?: string;
    to?: string;
    persistent?: boolean;
    duration?: number;
    channel?: string;
  };
}
