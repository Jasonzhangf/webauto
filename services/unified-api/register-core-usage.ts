/**
 * P0 Controller Actions Usage 注册
 * 
 * 职责：
 * - 为所有核心 Controller actions 提供 usage 描述
 * - 统一参数格式与使用说明
 * - 支持自动生成 API 文档
 */

import { registerActionUsage } from '../../modules/api-usage/src/index.js';

/**
 * 注册所有 Controller actions 的 usage
 */
export function registerCoreUsage() {
  // Browser actions
  registerActionUsage('browser:highlight', {
    description: '高亮页面元素（通过 CSS selector）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID (alias for profileId)' },
      selector: { type: 'string', required: true, description: 'CSS selector' },
      options: { type: 'object', description: '高亮选项 (style, duration, channel, sticky, maxMatches)' }
    },
    returns: 'success + data (highlight result)'
  });

  registerActionUsage('browser:clear-highlight', {
    description: '清除所有高亮',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      channel: { type: 'string', description: '指定清除哪个 channel 的高亮' }
    },
    returns: 'success + data'
  });

  registerActionUsage('browser:execute', {
    description: '在页面中执行 JavaScript 代码',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      script: { type: 'string', required: true, description: '要执行的 JS 代码' }
    },
    returns: 'success + data (script execution result)'
  });

  registerActionUsage('browser:highlight-dom-path', {
    description: '高亮 DOM 路径对应的元素',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      path: { type: 'string', required: true, description: 'DOM 路径' },
      options: { type: 'object', description: '高亮选项' }
    },
    returns: 'success + data'
  });

  registerActionUsage('browser:status', {
    description: '获取浏览器服务状态',
    parameters: {},
    returns: 'success + data'
  });

  registerActionUsage('browser:cancel-pick', {
    description: '取消 DOM 选择器拾取',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' }
    },
    returns: 'success + data'
  });

  registerActionUsage('browser:pick-dom', {
    description: '拾取页面 DOM 元素（旧版）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      timeout: { type: 'number', description: '超时时间（ms，默认 25000）' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data'
  });

  // Container actions
  registerActionUsage('containers:get', {
    description: '获取页面容器快照（inspect alias）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      url: { type: 'string', description: '目标 URL（可选，默认当前页面）' },
      maxDepth: { type: 'number', description: '最大匹配深度（默认 2）' },
      maxChildren: { type: 'number', description: '每层最大子节点数（默认 5）' },
      containerId: { type: 'string', description: '指定容器 ID' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (sessionId, profileId, url, snapshot, domTree)'
  });

  registerActionUsage('containers:inspect', {
    description: '获取页面容器快照',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      url: { type: 'string', description: '目标 URL（可选，默认当前页面）' },
      maxDepth: { type: 'number', description: '最大匹配深度（默认 2）' },
      maxChildren: { type: 'number', description: '每层最大子节点数（默认 5）' },
      containerId: { type: 'string', description: '指定容器 ID' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (sessionId, profileId, url, snapshot, domTree)'
  });

  registerActionUsage('containers:match', {
    description: '执行容器匹配，获取容器树',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID or profileId' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大匹配深度（默认 2）' },
      maxChildren: { type: 'number', description: '每层最大子节点数（默认 5）' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (matched, container, snapshot)'
  });

  registerActionUsage('containers:inspect-container', {
    description: '检查指定容器的详细信息',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大深度' },
      maxChildren: { type: 'number', description: '最大子节点数' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (sessionId, profileId, url, snapshot)'
  });

  registerActionUsage('containers:inspect-branch', {
    description: '检查 DOM 分支结构',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      path: { type: 'string', required: true, description: 'DOM 路径' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大深度' },
      maxChildren: { type: 'number', description: '最大子节点数' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (sessionId, profileId, url, branch)'
  });


  registerActionUsage('containers:get-container', {
    description: '检查指定容器的详细信息（inspect-container alias）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大深度' },
      maxChildren: { type: 'number', description: '最大子节点数' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (sessionId, profileId, url, snapshot)'
  });

  registerActionUsage('containers:remap', {
    description: '更新容器 selector 并写入定义',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      selector: { type: 'string', required: true, description: '新的 selector' },
      definition: { type: 'object', description: '容器定义（可选）' },
      url: { type: 'string', description: '目标 URL' },
      siteKey: { type: 'string', description: '站点键（可选）' }
    },
    returns: 'success + data (snapshot)'
  });

  registerActionUsage('containers:create-child', {
    description: '创建子容器',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      parentId: { type: 'string', required: true, description: '父容器 ID' },
      containerId: { type: 'string', required: true, description: '子容器 ID' },
      selectors: { type: 'array', description: 'selector 列表' },
      definition: { type: 'object', description: '容器定义（可选）' },
      url: { type: 'string', description: '目标 URL' },
      siteKey: { type: 'string', description: '站点键（可选）' }
    },
    returns: 'success + data (containers match result)'
  });

  registerActionUsage('containers:update-alias', {
    description: '更新容器别名',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      alias: { type: 'string', required: true, description: '新的别名' },
      url: { type: 'string', description: '目标 URL' },
      siteKey: { type: 'string', description: '站点键（可选）' }
    },
    returns: 'success + data (snapshot)'
  });

  registerActionUsage('containers:update-operations', {
    description: '更新容器操作列表',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      operations: { type: 'array', required: true, description: '操作列表' },
      url: { type: 'string', description: '目标 URL' },
      siteKey: { type: 'string', description: '站点键（可选）' }
    },
    returns: 'success + data (snapshot)'
  });

  registerActionUsage('containers:status', {
    description: '容器匹配状态（match alias）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID or profileId' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大匹配深度（默认 2）' },
      maxChildren: { type: 'number', description: '每层最大子节点数（默认 5）' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (matched, container, snapshot)'
  });

  // Session actions
  registerActionUsage('session:create', {
    description: '创建新的浏览器会话',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      url: { type: 'string', description: '初始 URL' },
      headless: { type: 'boolean', description: '是否 headless 模式' },
      keepOpen: { type: 'boolean', description: '是否保持打开' }
    },
    returns: 'success + session info'
  });

  registerActionUsage('session:delete', {
    description: '删除浏览器会话',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' }
    },
    returns: 'success'
  });

  registerActionUsage('session:list', {
    description: '列出所有会话',
    parameters: {},
    returns: 'success + data (sessions)'
  });

  // Operations
  registerActionUsage('operations:list', {
    description: '列出可用操作',
    parameters: {},
    returns: 'success + data (operations)'
  });

  registerActionUsage('operations:run', {
    description: '运行容器操作',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      op: { type: 'string', required: true, description: '操作 ID（支持 op/operation/id 字段）' },
      config: { type: 'object', description: '操作配置' }
    },
    returns: 'success + data (operation result)'
  });

  // DOM actions
  registerActionUsage('dom:pick:2', {
    description: '拾取页面元素（v2：返回 domPath + selector）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      timeout: { type: 'number', description: '超时时间（ms，默认 25000）' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (domPath, selector, raw)'
  });

  registerActionUsage('dom:branch:2', {
    description: '检查 DOM 分支结构（v2）',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      path: { type: 'string', required: true, description: 'DOM 路径' },
      url: { type: 'string', description: '目标 URL' },
      maxDepth: { type: 'number', description: '最大深度' },
      maxChildren: { type: 'number', description: '最大子节点数' },
      rootSelector: { type: 'string', description: '根选择器' }
    },
    returns: 'success + data (branch)'
  });

  // Logs
  registerActionUsage('logs:stream', {
    description: '流式读取日志',
    parameters: {
      source: { type: 'string', description: '日志源（browser/service/debug）' },
      session: { type: 'string', description: 'Session ID 过滤' },
      lines: { type: 'number', description: '读取行数' }
    },
    returns: 'success + log lines'
  });

  // Container operations
  registerActionUsage('container:operation', {
    description: '对指定容器执行操作',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      containerId: { type: 'string', required: true, description: '容器 ID' },
      operationId: { type: 'string', required: true, description: '操作 ID（highlight/extract/scroll/click/navigate/close）' },
      config: { type: 'object', description: '操作配置' }
    },
    returns: 'success + data (operation result)'
  });
}

/**
 * 导出注册函数，供 server.ts 加载
 */
export default registerCoreUsage;

  registerActionUsage('system:shortcut', {
    description: '触发系统级快捷键（例如新建标签）',
    parameters: {
      app: { type: 'string', description: '应用名称（默认 camoufox）' },
      shortcut: { type: 'string', required: true, description: '快捷键名称（e.g. new-tab）' }
    },
    returns: 'success + data'
  });

