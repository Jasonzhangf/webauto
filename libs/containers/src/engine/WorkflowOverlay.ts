// Container Engine v2 - Workflow Overlay (skeleton)
// Applies per-workflow behavior overrides onto container definitions at runtime

import { BehaviorOverride, ContainerDefV2, WorkflowOverlay } from './types.js';

export function applyWorkflowOverlay(defs: ContainerDefV2[], overlay?: WorkflowOverlay): ContainerDefV2[] {
  if (!overlay || !overlay.overrides || !overlay.overrides.length) return defs;
  const map = new Map(defs.map(d => [d.id, { ...d }]));
  for (const o of overlay.overrides as BehaviorOverride[]) {
    const d = map.get(o.containerId);
    if (!d) continue;
    if (o.runMode) d.runMode = o.runMode;
    if (o.operations) d.operations = o.operations;
    // priority/concurrency can be used by planner/scheduler extensions
    (d as any).__overlay = { priority: o.priority, concurrency: o.concurrency };
  }
  return Array.from(map.values());
}

