import { pathToFileURL } from 'node:url';
import { browserServiceDistEntry, ensureBrowserServiceBuild } from './service-build-utils.js';

async function loadService() {
  const distEntry = browserServiceDistEntry();
  console.log(`[remote-service] Loading from: ${distEntry}`);
  ensureBrowserServiceBuild('browser-service');
  
  try {
    const mod = await import(pathToFileURL(distEntry).href);
    return mod;
  } catch (e) {
    console.error('[remote-service] Failed to load service:', e);
    throw e;
  }
}

export async function startBrowserService(options = {}) {
  const mod = await loadService();
  console.log('[remote-service] Starting browser service with options:', JSON.stringify(options));
  return mod.startBrowserService(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hostIndex = process.argv.indexOf('--host');
  const portIndex = process.argv.indexOf('--port');
  const wsPortIndex = process.argv.indexOf('--ws-port');
  const wsHostIndex = process.argv.indexOf('--ws-host');
  const disableWs = process.argv.includes('--no-ws');
  
  const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : '127.0.0.1';
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 7704;
  const wsPort = wsPortIndex >= 0 ? Number(process.argv[wsPortIndex + 1]) : 8765;
  const wsHost = wsHostIndex >= 0 ? process.argv[wsHostIndex + 1] : '127.0.0.1';
  
  console.log('[remote-service] CLI mode, launching...');
  startBrowserService({
    host,
    port,
    wsPort,
    wsHost,
    enableWs: !disableWs
  }).catch((err) => {
    console.error('Failed to start browser service:', err);
    process.exit(1);
  });
}
