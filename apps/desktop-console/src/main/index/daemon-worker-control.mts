import { createDaemonWorker, resolveDaemonWorkerConfig } from './daemon-worker.mts';

export type DaemonWorkerController = {
  startDaemonWorkerHeartbeat: (waitForCleanup: (hint: string) => Promise<void>) => void;
  stopDaemonWorkerHeartbeat: (reason?: string) => void;
  getExitReason: () => string;
};

export function createDaemonWorkerController(): DaemonWorkerController {
  let daemonWorker: ReturnType<typeof createDaemonWorker> | null = null;

  const ensureDaemonWorker = () => {
    if (daemonWorker) return daemonWorker;
    const config = resolveDaemonWorkerConfig();
    if (!config) return null;
    daemonWorker = createDaemonWorker(config);
    return daemonWorker;
  };

  const startDaemonWorkerHeartbeat = (waitForCleanup: (hint: string) => Promise<void>) => {
    const worker = ensureDaemonWorker();
    if (!worker) return;
    worker.startDaemonWorkerHeartbeat(waitForCleanup);
  };

  const stopDaemonWorkerHeartbeat = (reason = 'stop') => {
    const worker = ensureDaemonWorker();
    if (!worker) return;
    worker.stopDaemonWorkerHeartbeat(reason);
  };

  const getExitReason = () => daemonWorker?.getExitReason() || 'before_quit';

  return {
    startDaemonWorkerHeartbeat,
    stopDaemonWorkerHeartbeat,
    getExitReason,
  };
}
