// Container Engine v2 - Page Lifecycle (skeleton)
// Handles page visit events: on navigate/refresh -> root detection -> tree discovery -> execution

import { RootDetector } from './RootDetector.js';
import { TreeDiscoveryEngine } from './TreeDiscoveryEngine.js';
import { RuntimeController } from './RuntimeController.js';
import { ContainerDefV2, RunMode, WorkflowOverlay } from './types.js';

export interface PageLifecycleDeps {
  onNavigate: (cb: (url: string) => Promise<void>) => void;
  highlight: (target: any, opts?: { color?: string; label?: string; persistent?: boolean; durationMs?: number }) => Promise<void>;
}

export class PageLifecycle {
  constructor(
    private rootDef: ContainerDefV2,
    private rootDetector: RootDetector,
    private discovery: TreeDiscoveryEngine,
    private runtime: RuntimeController,
    private deps: PageLifecycleDeps
  ) {}

  start(overlay?: WorkflowOverlay, mode: RunMode = 'sequential') {
    this.deps.onNavigate(async () => {
      // Step 1: root detection
      const r = await this.rootDetector.detect(this.rootDef);
      if (!r.found) return; // root not found, skip
      // Step 2: discover children & build container tree (default behavior)
      // Step 3: apply workflow overlay behaviors and execute
      await this.runtime.start(this.rootDef.id, r.handle, mode);
      // Overlay will be consumed inside runtime (future extension)
      // Non-blocking green highlight for root focus visualization
      void this.deps.highlight(r.handle, { color: '#00C853', label: `Root: ${this.rootDef.name || this.rootDef.id}`, persistent: true });
    });
  }
}
