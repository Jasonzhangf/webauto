// Browser Service 配置的 JSON Schema

export const browserServiceSchema = {
  $id: 'https://webauto.dev/schemas/browser-service.json',
  type: 'object',
  properties: {
    host: {
      type: 'string',
      description: '监听地址',
      default: '0.0.0.0'
    },
    port: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      description: '端口号',
      default: 7704
    },
    backend: {
      type: 'object',
      properties: {
        baseUrl: {
          type: 'string',
          description: '后端 API 基础 URL',
          default: 'http://127.0.0.1:7701'
        }
      },
      required: ['baseUrl']
    },
    healthCheck: {
      type: 'object',
      properties: {
        autoCheck: {
          type: 'boolean',
          description: '是否自动健康检查',
          default: true
        },
        strictMode: {
          type: 'boolean',
          description: '严格模式',
          default: false
        },
        skipOnFirstSuccess: {
          type: 'boolean',
          description: '首次成功后跳过检查',
          default: true
        },
        timeout: {
          type: 'integer',
          minimum: 1000,
          description: '超时时间（毫秒）',
          default: 30000
        }
      },
      required: ['autoCheck', 'strictMode', 'skipOnFirstSuccess', 'timeout']
    }
  },
  required: ['host', 'port', 'backend', 'healthCheck']
} as const;

export type BrowserServiceSchema = typeof browserServiceSchema;