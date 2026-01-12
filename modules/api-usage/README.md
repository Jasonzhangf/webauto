command: |
  # @webauto/api-usage
  
  API 统一 usage 描述模块，用于为每个 action 提供参数说明和使用方法。
  
  ## 功能
  
  - 统一的 action usage 注册与查询
  - 参数类型定义与验证
  - 支持自动生成 API 文档
  - 兼容多种参数格式（profile/profileId/sessionId）
  
  ## 使用示例
  
  ```typescript
  import { registerActionUsage, getActionUsage, getAllUsages } from '@webauto/api-usage';
  
  // 注册 action usage
  registerActionUsage('browser:highlight', {
    description: '高亮页面元素',
    parameters: {
      profile: { type: 'string', required: true, description: 'Profile ID' },
      selector: { type: 'string', required: true, description: 'CSS selector' }
    },
    returns: 'success + data (highlight result)'
  });
  
  // 查询 action usage
  const usage = getActionUsage('browser:highlight');
  console.log(usage.description);
  
  // 获取所有 usages
  const all = getAllUsages();
  console.log(Object.keys(all).length);
  ```
  
  ## API
  
  - `registerActionUsage(action, usage)`: 注册 action usage
  - `getActionUsage(action)`: 查询单个 action usage
  - `getAllUsages()`: 获取所有已注册的 usages
  - `clearAllUsages()`: 清除所有 usages
