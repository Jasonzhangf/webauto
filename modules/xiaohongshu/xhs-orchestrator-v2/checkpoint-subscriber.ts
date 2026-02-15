// Checkpoint Subscriber - Use camo container subscription instead of polling
// V2: Filter-based container subscription orchestration

export type XhsCheckpointId =
  | 'home_ready'
  | 'search_ready'
  | 'detail_ready'
  | 'comments_ready'
  | 'login_guard'
  | 'risk_control'
  | 'offsite'
  | 'unknown';

export interface CheckpointRule {
  checkpoint: XhsCheckpointId;
  selectors: string[];
  requireAll: boolean;
  priority: number;
}

// XHS checkpoint rules using CSS selectors
// These map to the container-library definitions but use direct selectors
export const XHS_CHECKPOINT_RULES: CheckpointRule[] = [
  {
    checkpoint: 'home_ready',
    selectors: ['.search-input', '[placeholder*="搜索"]'],
    requireAll: false,
    priority: 1,
  },
  {
    checkpoint: 'search_ready',
    selectors: ['.search-bar', '.search-result-list', '[class*="search-result"]'],
    requireAll: true,
    priority: 2,
  },
  {
    checkpoint: 'detail_ready',
    selectors: ['.note-detail-modal', '.note-content', '[class*="detail-container"]'],
    requireAll: true,
    priority: 3,
  },
  {
    checkpoint: 'comments_ready',
    selectors: ['.comment-section', '.comment-list', '.comment-item'],
    requireAll: false,
    priority: 4,
  },
  {
    checkpoint: 'login_guard',
    selectors: ['.login-mask', '.login-dialog', '[class*="login"]'],
    requireAll: false,
    priority: 0, // Highest priority - blocks everything
  },
];

export interface CheckpointEvent {
  from: XhsCheckpointId;
  to: XhsCheckpointId;
  timestamp: number;
  triggeredBy: string; // selector that triggered
  elements: any[];
}

export interface CheckpointSubscriberOptions {
  profileId?: string;
  serviceUrl?: string;
  throttleMs?: number;
  onCheckpointChange?: (event: CheckpointEvent) => void;
}

export class CheckpointSubscriber {
  private client: any; // CamoContainerClient
  private currentCheckpoint: XhsCheckpointId = 'unknown';
  private subscription: any = null;
  private options: CheckpointSubscriberOptions;

  constructor(options: CheckpointSubscriberOptions = {}) {
    this.options = {
      throttleMs: 500,
      ...options,
    };
  }

  async initialize() {
    // Dynamic import to avoid loading camo unless needed
    const { createCamoClient } = await import('@web-auto/camo/src/lib/client.mjs');
    this.client = createCamoClient({
      profileId: this.options.profileId,
      serviceUrl: this.options.serviceUrl,
    });
  }

  async start() {
    if (!this.client) {
      await this.initialize();
    }

    // Build container subscriptions from checkpoint rules
    const containers = XHS_CHECKPOINT_RULES.map((rule) => ({
      containerId: rule.checkpoint,
      selector: rule.selectors[0], // Primary selector
      onAppear: (elements: any[]) => {
        this.handleElementAppear(rule.checkpoint, elements);
      },
      onDisappear: (elements: any[]) => {
        this.handleElementDisappear(rule.checkpoint, elements);
      },
    }));

    this.subscription = await this.client.subscribe(containers, {
      throttle: this.options.throttleMs,
    });

    // Initial detection
    await this.detectCurrentCheckpoint();
  }

  private handleElementAppear(checkpoint: XhsCheckpointId, elements: any[]) {
    if (checkpoint === this.currentCheckpoint) return;

    const event: CheckpointEvent = {
      from: this.currentCheckpoint,
      to: checkpoint,
      timestamp: Date.now(),
      triggeredBy: 'appear',
      elements,
    };

    this.currentCheckpoint = checkpoint;
    this.options.onCheckpointChange?.(event);
  }

  private handleElementDisappear(checkpoint: XhsCheckpointId, elements: any[]) {
    // When key elements disappear, revert to lower checkpoint
    if (checkpoint === this.currentCheckpoint) {
      this.detectCurrentCheckpoint();
    }
  }

  private async detectCurrentCheckpoint() {
    const checkpoints = await this.client.detectCheckpoint(
      Object.fromEntries(
        XHS_CHECKPOINT_RULES.map((r) => [
          r.checkpoint,
          { selectors: r.selectors, requireAll: r.requireAll },
        ])
      )
    );

    // Get highest priority checkpoint
    const matched = checkpoints
      .map((c) => XHS_CHECKPOINT_RULES.find((r) => r.checkpoint === c))
      .filter(Boolean)
      .sort((a, b) => (b?.priority || 0) - (a?.priority || 0));

    const newCheckpoint = (matched[0]?.checkpoint || 'unknown') as XhsCheckpointId;

    if (newCheckpoint !== this.currentCheckpoint) {
      const event: CheckpointEvent = {
        from: this.currentCheckpoint,
        to: newCheckpoint,
        timestamp: Date.now(),
        triggeredBy: 'poll',
        elements: [],
      };
      this.currentCheckpoint = newCheckpoint;
      this.options.onCheckpointChange?.(event);
    }
  }

  getCurrentCheckpoint(): XhsCheckpointId {
    return this.currentCheckpoint;
  }

  async stop() {
    this.subscription?.unsubscribe();
    this.client?.destroy();
    this.currentCheckpoint = 'unknown';
  }
}

export function createCheckpointSubscriber(options: CheckpointSubscriberOptions) {
  return new CheckpointSubscriber(options);
}
