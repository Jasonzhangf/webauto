# 1688工作流架构分析文档

## 1. 核心架构设计

### 1.1 工作流引擎架构
- **主工作流文件**: `workflows/1688/relay/1688-search-wangwang-chat-compose.json`
- **执行引擎**: 基于Playwright的节点式工作流引擎 (`workflows/engine/WorkflowEngine.js`)
- **节点注册系统**: `workflows/engine/NodeRegistry.js` 管理所有可用节点类型

### 1.2 模块组织结构
```
workflows/
├── engine/           # 核心引擎和节点库
├── 1688/            # 1688专用工作流配置
├── preflows/        # 前置准备流程（登录等）
└── records/         # 运行记录和结果
```

## 2. 自动发送机制详解

### 2.1 消息输入与标记 (`ChatComposeNode.js`)
- 定位到 air.1688.com 的聊天框架
- 输入消息内容
- 通过 `data-webauto-send` 属性标记发送按钮
- 排除"打开客户端"等干扰元素

### 2.2 按钮探测与验证
- **主探测**: `ChatComposeNode` 初步定位按钮
- **补充探测**: `probe_send_button` 通过内联JS二次筛选
- **评分机制**: 基于可见性、文本内容、位置等多维度评分

### 2.3 分层点击策略 (`AdvancedClickNode.js`)
1. **JS直接触发**: 最快速的点击方式
2. **事件模拟**: 模拟真实用户交互
3. **鼠标坐标**: 精确坐标点击
4. **Playwright原生**: 最终保底方案

## 3. 完整执行流程

### 3.1 阶段1: 登录预热
```
防检测Camoufox启动 → 加载/保存cookies → 登录验证 → 写入握手文件
```

### 3.2 阶段2: 搜索导航
```
会话接力 → 主页导航 → 反风控处理 → GBK编码搜索 → 锚点校验
```

### 3.3 阶段3: 聊天交互
```
旺旺链接点击 → token捕获 → 聊天页附着 → 消息输入 → 按钮点击
```

### 3.4 阶段4: 结果处理
```
人工确认 → 结果保存 → 行为记录
```

## 4. Workflow接力流程详解

### 4.1 会话生命周期管理

#### 统一SessionID生成
```javascript
// workflows/WorkflowRunner.js:28
const sessionId = generateSessionId(); // 一次主流程+preflow统一ID
```
- 整个执行链路使用同一个 `sessionId`
- 保证所有节点在同一Playwright上下文中执行

#### 会话注册与存储
```javascript
// workflows/engine/SessionRegistry.js:3
sessionId → {browser, context, page} 映射关系
```
- 进程级会话注册表
- 支持跨节点会话复用

#### 文件系统持久化
```bash
~/.webauto/sessions/<sessionId>/
├── login.json          # 登录状态握手文件
├── context.json        # 上下文导出文件
└── behavior.log        # 行为日志
```

### 4.2 接力节点实现机制

#### AttachSessionNode - 会话接入
```javascript
// workflows/engine/nodes/AttachSessionNode.js:11
const session = SessionRegistry.get(sessionId);
engine.attachSession(session);
variables.sessionAttached = true;
```

#### EndNode - 会话持久化
```javascript
// workflows/engine/nodes/EndNode.js:20
SessionRegistry.set(sessionId, {browser, context, page});
// 可选择 cleanup: true 关闭浏览器
```

### 4.3 Preflow到主流程的接力

#### 登录Preflow准备
```json
// workflows/preflows/1688-login-preflow.json:7
{
  "nodes": [
    {"type": "CamoufoxLaunchNode"},
    {"type": "CookieLoaderNode"},
    {"type": "LoginValidationNode"},
    {"type": "HandshakeSignalNode"}  // 写入握手信号
  ]
}
```

#### 握手信号机制
```javascript
// workflows/engine/nodes/HandshakeSignalNode.js:17
writeFile(`${sessionDir}/login.json`, {
  status: "success",
  sessionId: sessionId,
  isLoggedIn: true,
  timestamp: Date.now()
});
```

## 5. 锚点强制配置机制

### 5.1 锚点校验流程

#### 预校验机制
```javascript
// workflows/WorkflowRunner.js:34
if (workflow.anchor) {
  // 构建迷你工作流：Start→AttachSession→AnchorPoint→End
  const anchorWorkflow = buildAnchorCheckWorkflow(anchor);
  const result = await runAnchorWorkflow(anchorWorkflow);
  if (!result.success) throw new Error("anchor check failed");
}
```

#### AnchorPointNode核心实现
```javascript
// workflows/engine/nodes/AnchorPointNode.js:34
async function waitForAnchor(config) {
  const { hostFilter, urlPattern, frameSelector, selectors } = config;
  
  // 1. 页签选择
  const page = selectPageByHost(hostFilter, urlPattern);
  
  // 2. Frame定位
  const frame = await page.frameSelector(frameSelector);
  
  // 3. 锚点轮询（最长10分钟，1.5s间隔）
  const anchor = await pollForAnchor(frame, selectors, {
    timeout: 10 * 60 * 1000,
    interval: 1500,
    textMatch: config.textMatch,
    visible: config.visible
  });
  
  return { success: true, anchorSettled: true };
}
```

### 5.2 锚点配置结构

#### 集中化配置文件
```json
// config/anchors/1688-anchors.json
{
  "login": {
    "hostFilter": "login.1688.com",
    "selectors": [".password-login", ".login-btn"],
    "textMatch": "登录",
    "visible": true
  },
  "search": {
    "hostFilter": "www.1688.com", 
    "urlPattern": "/offerlist/",
    "selectors": [".search-input", ".search-btn"],
    "highlight": true
  },
  "chat": {
    "hostFilter": "air.1688.com",
    "frameSelector": "#chatFrame",
    "selectors": [".chat-input", ".send-btn"],
    "persistHighlight": true
  }
}
```

#### 工作流中的锚点引用
```json
// workflows/1688/relay/1688-search-wangwang-chat-compose.json
{
  "anchor": {
    "hostFilter": "air.1688.com",
    "frameSelector": "#chatFrame", 
    "selectors": [".chat-input-area"],
    "textMatch": "输入消息",
    "timeout": 300000,
    "highlight": {
      "enabled": true,
      "color": "#ff0000",
      "label": "聊天输入区",
      "persist": true
    }
  }
}
```

### 5.3 锚点高亮与调试

#### 可视化高亮实现
```javascript
// AnchorPointNode.js:104
function highlightAnchor(element, config) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute;
    border: 2px solid ${config.highlightColor};
    background: rgba(255,0,0,0.1);
    z-index: 9999;
  `;
  
  const label = document.createElement('div');
  label.textContent = config.label;
  label.style.cssText = `
    position: absolute;
    top: -25px;
    background: ${config.highlightColor};
    color: white;
    padding: 2px 6px;
    font-size: 12px;
  `;
  
  element.appendChild(overlay);
  element.appendChild(label);
}
```

## 6. 会话与锚点协作机制

### 6.1 标准协作流程
```
1. AttachSessionNode → 接入Preflow会话
2. AttachHostPageNode → 切换到目标页签
3. AnchorPointNode → 验证页面锚点
4. 业务节点 → 在验证的DOM上执行操作
```

### 6.2 错误处理策略

#### 锚点超时处理
```javascript
if (anchorTimeout) {
  engine.recordBehavior('anchor_timeout', {
    config: anchorConfig,
    elapsedTime: Date.now() - startTime
  });
  
  if (config.error === 'halt') {
    throw new Error(`锚点等待超时: ${selectors.join(', ')}`);
  } else {
    return { success: false, reason: 'anchor_timeout' };
  }
}
```

#### 会话异常恢复
```javascript
// 检查握手文件状态
const handshake = readHandshakeFile(sessionId);
if (handshake.status !== 'success') {
  // 触发重新登录或报警
  await triggerRelogin();
}
```

### 6.3 动态配置更新

#### 热更新机制
- 修改 `config/anchors/1688-anchors.json` 无需编译
- 下次执行自动加载新配置
- 通过高亮功能快速验证

#### 跨流程配置传递
```javascript
// workflows/SequenceRunner.js:23
const nextWorkflowParams = {
  ...currentVariables,
  handshakeSignalPath: `${sessionDir}/login.json`,
  contextExportPath: `${sessionDir}/context.json`,
  anchorConfig: updatedAnchorConfig
};
```

## 7. 关键配置参数

### 7.1 全局配置 (`globalConfig`)
- 超时时间控制
- 日志等级设置
- 关键词变量驱动

### 7.2 节点级配置
- **事件点击**: 文本匹配、轮询节奏、鼠标行为
- **弹窗捕获**: 选择器配置、延迟设置、网页偏好
- **聊天组合**: 消息变体、高亮时长、发送方式

### 7.3 运行时参数
- `--sessionId`: 会话复用
- CLI参数覆盖配置

## 8. 调试与验证工具

### 8.1 分析脚本
- `1688-send-button-finder.js`: 发送按钮定位工具
- `1688-chat-analyzer.js`: 聊天页面分析器
- `highlight-send-button.js`: 按钮高亮工具

### 8.2 测试工作流
- `1688-chat-full-flow-test.json`: 全流程测试
- 行为记录与回放机制
- 截图与倒计时验证

### 8.3 实时调试命令
```bash
# 调试模式运行
node scripts/run-workflow.js workflows/1688/relay/1688-search-wangwang-chat-compose.json --debug

# 检查会话状态
cat ~/.webauto/sessions/<sessionId>/login.json

# 验证锚点配置
node workflows/engine/nodes/AnchorPointNode.js --validate-config
```

## 9. 架构优势

1. **模块化设计**: 节点可复用，易于扩展
2. **分层策略**: 多重保底确保点击成功
3. **会话复用**: 提高效率，减少重复登录
4. **配置驱动**: 灵活调整行为参数
5. **调试友好**: 丰富的分析和验证工具

## 10. 监控指标

- 锚点定位成功率
- 会话接力耗时
- 锚点等待时长
- 错误类型分布

## 11. 后续优化建议

1. **消息多样化**: 扩展 `messageVariants` 配置
2. **错误处理**: 增强异常情况的处理逻辑
3. **性能优化**: 减少不必要的等待和重试
4. **监控告警**: 添加执行状态监控

---

*文档创建时间: 2025-10-22*
*分析工具: Codex MCP*