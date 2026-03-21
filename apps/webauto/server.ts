import path from 'node:path';
import { applyCamoEnv } from './entry/lib/camo-env.mjs';

const ROOT = path.resolve(process.cwd());
applyCamoEnv({ env: process.env, repoRoot: ROOT });

async function startRuntime() {
  console.log('[webauto] runtime mode=unified');
  await import('../../services/unified-api/server.js');
}

void startRuntime().catch((error) => {
  console.error('[webauto] runtime start failed:', error?.message || String(error));
  process.exit(1);
});
