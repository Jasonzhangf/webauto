import { spawnSync } from 'node:child_process';

const runtimeMode = String(process.env.WEBAUTO_RUNTIME_MODE || 'autoscript')
  .trim()
  .toLowerCase();
const autoscriptProvider = String(process.env.WEBAUTO_BROWSER_PROVIDER || 'camo')
  .trim()
  .toLowerCase();
const autoscriptKeepalive = process.env.WEBAUTO_AUTOSCRIPT_KEEPALIVE !== '0';
const autoscriptStopOnExit = process.env.WEBAUTO_AUTOSCRIPT_STOP_ON_EXIT === '1';
const autoscriptExitOnUnhealthy = process.env.WEBAUTO_AUTOSCRIPT_EXIT_ON_UNHEALTHY === '1';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopBrowserBackendIfRequested() {
  if (!autoscriptStopOnExit) return;
  console.log('[webauto] skip backend shutdown (managed by @web-auto/camo)');
}

async function runAutoscriptRuntime() {
  process.env.WEBAUTO_BROWSER_PROVIDER = autoscriptProvider;
  const { ensureBrowserService, checkBrowserService } = await import('../../modules/camo-runtime/src/utils/browser-service.mjs');
  console.log(`[webauto] runtime mode=autoscript provider=${autoscriptProvider}`);
  await ensureBrowserService();

  if (!autoscriptKeepalive) return;

  let shuttingDown = false;
  const onSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[webauto] received ${signal}, shutting down autoscript runtime`);
    stopBrowserBackendIfRequested();
    process.exit(0);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  console.log('[webauto] autoscript backend ready');
  while (!shuttingDown) {
    await sleep(5000);
    const healthy = await checkBrowserService();
    if (!healthy) {
      console.warn('[webauto] autoscript backend health check failed');
      if (autoscriptExitOnUnhealthy) {
        stopBrowserBackendIfRequested();
        process.exit(1);
      }
    }
  }
}

async function startRuntime() {
  if (runtimeMode === 'unified') {
    console.log('[webauto] runtime mode=unified');
    await import('../../services/unified-api/server.js');
    return;
  }

  if (runtimeMode === 'autoscript') {
    await runAutoscriptRuntime();
    return;
  }

  throw new Error(`Unsupported WEBAUTO_RUNTIME_MODE: ${runtimeMode}. Allowed: autoscript|unified`);
}

void startRuntime().catch((error) => {
  console.error('[webauto] runtime start failed:', error?.message || String(error));
  process.exit(1);
});
