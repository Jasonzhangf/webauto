// Desktop Console（Electron 管理台）配置的 JSON Schema

export const desktopConsoleSchema = {
  $id: 'https://webauto.dev/schemas/desktop-console.json',
  type: 'object',
  properties: {
    unifiedApiUrl: {
      type: 'string',
      description: 'Unified API URL',
      default: 'http://127.0.0.1:7701'
    },
    browserServiceUrl: {
      type: 'string',
      description: 'Browser Service URL',
      default: 'http://127.0.0.1:7704'
    },
    searchGateUrl: {
      type: 'string',
      description: 'SearchGate URL',
      default: 'http://127.0.0.1:7790'
    },
    downloadRoot: {
      type: 'string',
      description: '下载目录根路径（建议使用 ~/.webauto/download）'
    },
    defaultEnv: {
      type: 'string',
      enum: ['debug', 'prod'],
      description: '默认 env',
      default: 'debug'
    },
    defaultKeyword: {
      type: 'string',
      description: '默认 keyword',
      default: ''
    },
    timeouts: {
      type: 'object',
      properties: {
        loginTimeoutSec: {
          type: 'integer',
          minimum: 30,
          description: '登录等待超时（秒）',
          default: 900
        },
        cmdTimeoutSec: {
          type: 'integer',
          minimum: 0,
          description: '命令超时（秒），0 表示不超时',
          default: 0
        }
      },
      required: ['loginTimeoutSec', 'cmdTimeoutSec']
    }
  },
  required: [
    'unifiedApiUrl',
    'browserServiceUrl',
    'searchGateUrl',
    'downloadRoot',
    'defaultEnv',
    'defaultKeyword',
    'timeouts'
  ],
  additionalProperties: false
} as const;

export type DesktopConsoleSchema = typeof desktopConsoleSchema;
