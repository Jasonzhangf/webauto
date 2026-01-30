// 环境配置的 JSON Schema

export const environmentSchema = {
  type: 'object',
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      description: 'Node 环境'
    },
    WEBAUTO_DEBUG: {
      type: 'string',
      enum: ['0', '1'],
      description: '调试模式'
    },
    WEBAUTO_LOG_LEVEL: {
      type: 'string',
      enum: ['debug', 'info', 'warn', 'error'],
      description: '日志级别'
    }
  },
  required: ['NODE_ENV', 'WEBAUTO_DEBUG', 'WEBAUTO_LOG_LEVEL']
} as const;

export const environmentsSchema = {
  $id: 'https://webauto.dev/schemas/environments.json',
  type: 'object',
  properties: {
    development: environmentSchema,
    production: environmentSchema
  },
  required: ['development', 'production']
} as const;

export type EnvironmentsSchema = typeof environmentsSchema;
export type EnvironmentSchema = typeof environmentSchema;