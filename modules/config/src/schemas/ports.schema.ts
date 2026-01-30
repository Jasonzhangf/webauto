// 端口配置的 JSON Schema

export const portsSchema = {
  $id: 'https://webauto.dev/schemas/ports.json',
  type: 'object',
  properties: {
    unified_api: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      description: 'Unified API 端口',
      default: 7701
    },
    browser_service: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      description: 'Browser Service 端口',
      default: 7704
    },
    floating_bus: {
      type: 'integer',
      minimum: 1,
      maximum: 65535,
      description: 'Floating Bus 端口',
      default: 8790
    }
  },
  required: ['unified_api', 'browser_service']
} as const;

export type PortsSchema = typeof portsSchema;