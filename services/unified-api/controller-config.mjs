/**
 * Unified API 的 Controller 配置
 * 从原 server.mjs 提取的配置
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const controllerConfig = {
  repoRoot: process.env.WEBAUTO_REPO_ROOT || path.resolve(__dirname, '../..'),
  userContainerRoot: process.env.WEBAUTO_USER_CONTAINER_ROOT || path.join(os.homedir(), '.webauto', 'container-lib'),
  containerIndexPath: process.env.WEBAUTO_CONTAINER_INDEX || path.join(path.resolve(__dirname, '../..'), 'container-library.index.json'),
  cliTargets: {
    'browser-control': path.join(path.resolve(__dirname, '../..'), 'modules/browser-control/src/cli.ts'),
    'session-manager': path.join(path.resolve(__dirname, '../..'), 'modules/session-manager/src/cli.ts'),
    logging: path.join(path.resolve(__dirname, '../..'), 'modules/logging/src/cli.ts'),
    operations: path.join(path.resolve(__dirname, '../..'), 'modules/operations/src/cli.ts'),
    'container-matcher': path.join(path.resolve(__dirname, '../..'), 'modules/container-matcher/src/cli.ts'),
  },
  defaultWsHost: process.env.WEBAUTO_WS_HOST || '127.0.0.1',
  defaultWsPort: Number(process.env.WEBAUTO_WS_PORT || 8765),
  defaultHttpHost: process.env.WEBAUTO_BROWSER_HTTP_HOST || '127.0.0.1',
  defaultHttpPort: Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || 7704),
  defaultHttpProtocol: process.env.WEBAUTO_BROWSER_HTTP_PROTO || 'http',
};
