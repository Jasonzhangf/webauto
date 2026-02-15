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
import {
  camoStart,
  camoStop,
  camoType,
  camoPress,
  camoClick,
  camoScreenshot,
} from '../xhs-camo-adapter/camo-commands.js';
import { getPrimarySelector, isBlockingCheckpoint } from '../xhs-camo-adapter/checkpoint-selectors.js';
import { execute as phase2Search } from '../xhs-search/Phase2SearchBlock.js';
import { execute as phase2CollectLinks } from '../xhs-search/Phase2CollectLinksBlock.js';

export interface OrchestratorV2Options extends XhsCollectOptions {
  onCheckpoint?: (event: CheckpointEvent) => void;
  useCamoDirect?: boolean;
}

export class XhsOrchestratorV2 {
  private runId: string;
  private options: OrchestratorV2Options;
  private stateClient: any;
  private checkpointSubscriber: any;
  private currentPhase: 'idle' | 'search' | 'collect' | 'harvest' | 'done' | 'error' = 'idle';
  private links: Array<{ noteId: string; safeUrl: string; searchUrl: string; ts: string }> = [];

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

    if (isBlockingCheckpoint(event.to)) {
      await this.handleBlockingState(event.to);
      return;
    }

    if (event.to === 'home_ready' && this.currentPhase === 'idle') {
      await this.startSearchPhase();
    } else if (event.to === 'search_ready' && this.currentPhase === 'search') {
      await this.startCollectPhase();
    } else if (event.to === 'detail_ready' && this.currentPhase === 'collect') {
      await this.startHarvestPhase();
    }
  }

  private async startSearchPhase() {
    this.currentPhase = 'search';
    await this.stateClient.pushEvent('phase:search:start', {});

    console.log(`[OrchestratorV2] Starting search for: ${this.options.keyword}`);

    if (this.options.useCamoDirect) {
      try {
        const searchInput = getPrimarySelector('home_ready');
        if (searchInput) {
          await camoClick(this.options.profileId, searchInput);
          await new Promise(r => setTimeout(r, 300));
          await camoType(this.options.profileId, searchInput, this.options.keyword);
          await new Promise(r => setTimeout(r, 200));
          await camoPress(this.options.profileId, 'Enter');
        }
      } catch (error: any) {
        console.error(`[OrchestratorV2] Search phase failed: ${error.message}`);
        this.currentPhase = 'error';
      }
    } else {
      try {
        const result = await phase2Search({
          keyword: this.options.keyword,
          profile: this.options.profileId,
          unifiedApiUrl: 'http://127.0.0.1:7701',
          stateClient: this.stateClient,
        });
        if (!result.success) throw new Error(`Search failed: ${result.finalUrl}`);
        console.log(`[OrchestratorV2] Search completed: ${result.finalUrl}`);
      } catch (error: any) {
        console.error(`[OrchestratorV2] Search failed: ${error.message}`);
        this.currentPhase = 'error';
      }
    }
  }

  private async startCollectPhase() {
    this.currentPhase = 'collect';
    await this.stateClient.pushEvent('phase:collect:start', {});

    console.log(`[OrchestratorV2] Starting link collection`);

    try {
      const result = await phase2CollectLinks({
        keyword: this.options.keyword,
        targetCount: this.options.target,
        profile: this.options.profileId,
        unifiedApiUrl: 'http://127.0.0.1:7701',
        env: this.options.env,
        stateClient: this.stateClient,
        onLink: (link, meta) => {
          this.links.push(link);
          console.log(`[OrchestratorV2] ${meta.collected}/${meta.targetCount}: ${link.noteId}`);
        },
      });
      this.links = result.links;
      console.log(`[OrchestratorV2] Collection completed: ${result.totalCollected} links`);
    } catch (error: any) {
      console.error(`[OrchestratorV2] Collect failed: ${error.message}`);
      this.currentPhase = 'error';
    }
  }

  private async startHarvestPhase() {
    this.currentPhase = 'harvest';
    await this.stateClient.pushEvent('phase:harvest:start', {});
    console.log(`[OrchestratorV2] Harvest: ${this.links.length} links`);
    await this.stateClient.pushEvent('phase:harvest:done', { count: 0 });
  }

  private async handleBlockingState(checkpoint: XhsCheckpointId) {
    this.currentPhase = 'error';
    await this.stateClient.pushEvent('phase:blocked', { checkpoint });
    console.log(`[OrchestratorV2] Blocked: ${checkpoint}`);
    try {
      await camoScreenshot(this.options.profileId, `/tmp/blocked-${this.runId}.png`);
    } catch {}
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
      }, 5 * 60 * 1000);

      const checkInterval = setInterval(() => {
        if (this.currentPhase === 'done' || this.currentPhase === 'error') {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve({
            runId: this.runId,
            processed: this.links.length,
            total: this.options.target,
            failed: 0,
            links: this.links.map(l => l.safeUrl),
          });
        }
      }, 1000);
    });
  }
}

export async function runOrchestratorV2(options: OrchestratorV2Options): Promise<XhsCollectResult> {
  const orchestrator = new XhsOrchestratorV2(options);
  return orchestrator.run();
}

export { createCheckpointSubscriber, type XhsCheckpointId, type CheckpointEvent } from './checkpoint-subscriber.js';
export { XHS_CHECKPOINT_RULES } from './checkpoint-subscriber.js';
