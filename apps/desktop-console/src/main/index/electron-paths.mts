import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { app } from 'electron';
import { resolveDefaultDownloadRoot } from '../desktop-settings.mts';

export function configureElectronPaths() {
  try {
    const downloadRoot = resolveDefaultDownloadRoot();
    const normalized = path.normalize(downloadRoot);
    const baseDir = path.basename(normalized).toLowerCase() === 'download'
      ? path.dirname(normalized)
      : normalized;
    const userDataRoot = path.join(baseDir, 'desktop-console');
    const cacheRoot = path.join(userDataRoot, 'cache');
    const gpuCacheRoot = path.join(cacheRoot, 'gpu');

    try { mkdirSync(cacheRoot, { recursive: true }); } catch {}
    try { mkdirSync(gpuCacheRoot, { recursive: true }); } catch {}

    app.setPath('userData', userDataRoot);
    app.setPath('cache', cacheRoot);
    app.commandLine.appendSwitch('disk-cache-dir', cacheRoot);
    app.commandLine.appendSwitch('gpu-cache-dir', gpuCacheRoot);

    // Remote Windows sessions often fail DirectComposition/ANGLE initialization.
    const disableGpuByDefault = process.platform === 'win32'
      && String(process.env.WEBAUTO_ELECTRON_DISABLE_GPU || '1').trim() !== '0';
    if (disableGpuByDefault) {
      try { app.disableHardwareAcceleration(); } catch {}
      app.commandLine.appendSwitch('disable-gpu');
      app.commandLine.appendSwitch('disable-gpu-compositing');
      app.commandLine.appendSwitch('disable-direct-composition');
      app.commandLine.appendSwitch('use-angle', 'swiftshader');
    }
  } catch (err) {
    console.warn('[desktop-console] failed to configure cache paths', err);
  }
}
