// UI 配置的 JSON Schema

export const uiSchema = {
  $id: 'https://webauto.dev/schemas/ui.json',
  type: 'object',
  properties: {
    window: {
      type: 'object',
      properties: {
        width: {
          type: 'integer',
          minimum: 400,
          description: '窗口宽度',
          default: 800
        },
        height: {
          type: 'integer',
          minimum: 300,
          description: '窗口高度',
          default: 600
        },
        minWidth: {
          type: 'integer',
          minimum: 300,
          description: '最小宽度',
          default: 400
        },
        minHeight: {
          type: 'integer',
          minimum: 200,
          description: '最小高度',
          default: 300
        }
      },
      required: ['width', 'height', 'minWidth', 'minHeight']
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'auto'],
      description: '主题',
      default: 'auto'
    },
    autoHide: {
      type: 'boolean',
      description: '自动隐藏',
      default: false
    }
  },
  required: ['window', 'theme']
} as const;

export type UISchema = typeof uiSchema;