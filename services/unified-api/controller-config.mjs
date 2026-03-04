/**
 * Unified API 的 Controller 配置
 * 从原 server.mjs 提取的配置
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCamoEnv } from '../../apps/webauto/entry/lib/camo-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackRepoRoot = path.resolve(__dirname, '../..');
applyCamoEnv({ repoRoot: fallbackRepoRoot });

const repoRoot = process.env.CAMO_REPO_ROOT || fallbackRepoRoot;
const dataRoot = process.env.CAMO_DATA_ROOT;
if (!dataRoot) {
  throw new Error('CAMO_DATA_ROOT is required for Unified API controller config.');
}
const containerIndexPath = process.env.CAMO_CONTAINER_INDEX;
if (!containerIndexPath) {
  throw new Error('CAMO_CONTAINER_INDEX is required for Unified API controller config.');
}

export const controllerConfig = {
  repoRoot,
  userContainerRoot: process.env.CAMO_CONTAINER_ROOT || path.join(dataRoot, 'container-lib'),
  containerIndexPath,
  cliTargets: {
    'session-manager': path.join(repoRoot, 'modules/session-manager/src/cli.ts'),
    logging: path.join(repoRoot, 'modules/logging/src/cli.ts'),
    operations: path.join(repoRoot, 'modules/operations/src/cli.ts'),
  },
  defaultWsHost: process.env.CAMO_WS_HOST || '127.0.0.1',
  defaultWsPort: Number(process.env.CAMO_WS_PORT || 8765),
  defaultHttpHost: process.env.CAMO_BROWSER_HTTP_HOST || '127.0.0.1',
  defaultHttpPort: Number(process.env.CAMO_BROWSER_HTTP_PORT || 7704),
  defaultHttpProtocol: process.env.CAMO_BROWSER_HTTP_PROTO || 'http',
};
