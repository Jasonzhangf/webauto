// XHS Orchestrator V2 - Camo container subscription based orchestration
// No polling, event-driven workflow

import type { XhsCollectOptions, XhsCollectResult } from '../xhs-core/types.js';
import { createXhsStateClient } from '../xhs-core/state-client.js';
import { generateRunId } from '../xhs-core/utils.js';
import {
  createCheckpointSubscriber,
  type XhsCheckpointId,
  type CheckpointEvent,
} from './checkpoint-subscriber.js';

export interface OrchestratorV2Options extends XhsCollectOptions {
  onCheckpoint?: (event: CheckpointEvent) => void;
}

export class XhsOrchestratorV2 {
  private runId: string;
  private options: OrchestratorV2Options;
  private stateClient: any;
  private checkpointSubscriber: any;
  private currentPhase: 'idle' | 'search' | 'collect' | 'harvest' | 'done' | 'error' = 'idle';

  constructor(options: OrchestratorV2Options) {
    this.runId = generateRunId();
    this.options = options;
  }

  async initialize() {
    this.stateClient = createXhsStateClient(this.runId, this.options, 'v2');
    await this.stateClient.pushEvent('orchestrator:init', { options: this.options });

    this.checkpointSubscriber = createCheckpointSubscriber({
      profileId: this.options.profileId,
      throttleMs: 500,
      onCheckpointChange: (event: CheckpointEvent) => {
        this.handleCheckpointChange(event);
      },
    });

    await this.checkpointSubscriber.start();
  }

  private async handleCheckpointChange(event: CheckpointEvent) {
    console.log(`[OrchestratorV2] Checkpoint: ${event.from} -> ${event.to}`);

    await this.stateClient.pushEvent('checkpoint:change', event);
    this.options.onCheckpoint?.(event);

    // React to checkpoint changes based on current phase
    if (event.to === 'home_ready' && this.currentPhase === 'idle') {
      await this.startSearchPhase();
    } else if (event.to === 'search_ready' && this.currentPhase === 'search') {
      await this.startCollectPhase();
    } else if (event.to === 'detail_ready' && this.currentPhase === 'collect') {
      await this.startHarvestPhase();
    } else if (event.to === 'login_guard' || event.to === 'risk_control') {
      await this.handleBlockingState(event.to);
    }
  }

  private async startSearchPhase() {
    this.currentPhase = 'search';
    await this.stateClient.pushEvent('phase:search:start', {});

    // TODO: Invoke search block via camo commands
    // const camo = await import('@web-auto/camo');
    // await camo.type(this.options.profileId, '.search-input', this.options.keyword);
    // await camo.press(this.options.profileId, 'Enter');

    console.log(`[OrchestratorV2] Starting search for: ${this.options.keyword}`);
  }

  private async startCollectPhase() {
    this.currentPhase = 'collect';
    await this.stateClient.pushEvent('phase:collect:start', {});

    // TODO: Collect links from search results
    // Subscribe to result items appearing

    console.log(`[OrchestratorV2] Starting link collection`);
  }

  private async startHarvestPhase() {
    this.currentPhase = 'harvest';
    await this.stateClient.pushEvent('phase:harvest:start', {});

    // TODO: Harvest detail page data

    console.log(`[OrchestratorV2] Starting detail harvest`);
  }

  private async handleBlockingState(checkpoint: XhsCheckpointId) {
    this.currentPhase = 'error';
    await this.stateClient.pushEvent('phase:blocked', { checkpoint });

    console.log(`[OrchestratorV2] Blocked by: ${checkpoint}`);
    // Wait for user intervention or retry logic
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }

  getCurrentCheckpoint(): XhsCheckpointId {
    return this.checkpointSubscriber?.getCurrentCheckpoint() || 'unknown';
  }

  async stop() {
    await this.checkpointSubscriber?.stop();
    await this.stateClient.markCompleted();
    this.currentPhase = 'done';
  }

  async run(): Promise<XhsCollectResult> {
    await this.initialize();

    // Wait for completion or timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        await this.stop();
        resolve({
          runId: this.runId,
          processed: 0,
          total: this.options.target,
          failed: 0,
          error: 'timeout',
        });
      }, 5 * 60 * 1000); // 5 min timeout

      // TODO: Add completion detection
    });
  }
}

export async function runOrchestratorV2(options: OrchestratorV2Options): Promise<XhsCollectResult> {
  const orchestrator = new XhsOrchestratorV2(options);
  return orchestrator.run();
}

export { createCheckpointSubscriber, type XhsCheckpointId, type CheckpointEvent } from './checkpoint-subscriber.js';
export { XHS_CHECKPOINT_RULES } from './checkpoint-subscriber.js';
