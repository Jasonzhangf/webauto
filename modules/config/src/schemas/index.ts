// JSON Schema 导出

export { browserServiceSchema, type BrowserServiceSchema } from './browser-service.schema.js';
export { portsSchema, type PortsSchema } from './ports.schema.js';
export { environmentsSchema, type EnvironmentsSchema, type EnvironmentSchema } from './environments.schema.js';
export { uiSchema, type UISchema } from './ui.schema.js';

// 主 Schema - 组合所有子 Schema
export const mainSchema = {
  $id: 'https://webauto.dev/schemas/main.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  description: 'WebAuto 主配置文件',
  properties: {
    browserService: {
      $ref: 'https://webauto.dev/schemas/browser-service.json#'
    },
    ports: {
      $ref: 'https://webauto.dev/schemas/ports.json#'
    },
    environments: {
      $ref: 'https://webauto.dev/schemas/environments.json#'
    },
    ui: {
      $ref: 'https://webauto.dev/schemas/ui.json#'
    }
  },
  required: ['browserService', 'ports', 'environments', 'ui'],
  additionalProperties: false
} as const;

export type MainSchema = typeof mainSchema;