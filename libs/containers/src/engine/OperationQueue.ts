// Container Engine v2 - Operation Queue & Scheduler (skeleton)

import { ContainerNodeRuntime, OperationDef, OperationInstance, RunMode } from './types.js';

export class OperationQueue {
  static buildDefaultQueue(defOps?: OperationDef[]): OperationInstance[] {
    const ops: OperationDef[] = (defOps && defOps.length ? defOps : [{ type: 'find-child' as const } as OperationDef]);
    return ops.map((def): OperationInstance => ({ def, status: 'pending' } as OperationInstance));
  }

  static nextRunnable(node: ContainerNodeRuntime): OperationInstance | undefined {
    return node.opQueue.find(op => op.status === 'pending');
  }

  static markRunning(op: OperationInstance) { op.status = 'running'; }
  static markDone(op: OperationInstance, result?: any) { op.status = 'done'; op.result = result; }
  static markFailed(op: OperationInstance, error: string) { op.status = 'failed'; op.error = error; }
}

export class Scheduler {
  constructor(private maxParallelSiblings = 3) {}

  canRun(node: ContainerNodeRuntime, mode: RunMode): boolean {
    if (mode === 'sequential') return true;
    // For parallel mode, allow limited concurrency across siblings; simplified placeholder
    return true;
  }
}
