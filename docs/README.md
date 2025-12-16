# Documentation Directory

Comprehensive documentation for the web automation platform, including architecture guides, API references, and implementation details.

## Structure

- **actions-system/** - Actions system documentation
- **APIS/** - API reference documentation
- **architecture/** - System architecture documentation
- **picker/** - UI picker component documentation

## Key Documentation

### Architecture Documents
- **ARCHITECTURE.md** - High-level system overview
- **architecture-summary.md** - Architecture summary and key concepts
- **CONTAINER_ARCHITECTURE_DESIGN.md** - Container system design
- **CONTAINER_WORKFLOW_INTEGRATION_DESIGN.md** - Container workflow integration
- **browser-service-architecture.md** - Browser service architecture
- **SELF_REFRESHING_CONTAINER_DESIGN.md** - Self-refreshing containers

### Framework Documentation
- **workflow-framework-architecture.md** - Workflow framework design
- **operations-framework-architecture.md** - Operations framework architecture
- **task-orchestration-architecture.md** - Task orchestration system
- **implementation-roadmap.md** - Development roadmap and milestones

## 高亮闭环实现计划（UI/Runtime/服务）

1. **前端事件流（Floating Panel）**
   - 模块：`apps/floating-panel/renderer/modules/actions/highlight-actions.js`
   - 功能：将 UI 按钮点击转成 `ui.action.highlight` / `ui.action.clearHighlight` / `ui.action.togglePersistent` 事件；通过 `highlight-service` 发布 `dom:highlight_request`。
   - 状态：已拆分自 `app.js`，并绑定在 `modules/boot.js` 入口。

2. **消息与服务层**
   - `apps/floating-panel/renderer/modules/services/highlight-service.js`：监听 DOM 事件，统一发布 `dom:highlight_*`；转发后端反馈为 `ui.highlight.*`。
   - `services/browser-service/ws-server.ts`：新增 `highlight_element`/`clear_highlight` 实际逻辑，调用 Runtime 的 `window.__webautoRuntime.highlight`。

3. **浏览器 Runtime 注入**
   - `runtime/browser/page-runtime/runtime.js`：负责 DOM picker + 高亮脚本；暴露 `__domPicker`、`__webautoRuntime.highlight`，支持选择器/鼠标 hover 高亮与清除。

4. **测试与验证**
   - `scripts/ui/send-highlight-cli.mjs`：通过 WebSocket 8765 下发 `highlight_element`/`clear_highlight`。
   - `scripts/ui/highlight-smoke.mjs`：自动执行高亮→清除→校验日志。
   - `docs/testing/ui-loop.md`：记录 `npm run ui:test` 中的高亮回环测试流程。

5. **文档与扩展**
   - 后续在 `docs/architecture/ui-modularization.md` 与 `docs/architecture/floating-panel-refactor.md` 中补充高亮/DOM 拾取模块的独立说明。

### Platform-Specific Guides
- **1688-workflow-architecture-analysis.md** - 1688 platform analysis
- **1688-workflow-optimization-report.md** - 1688 optimization strategies
- **1688-anti-wind-control-solution.md** - Anti-detection mechanisms
- **1688-stable-cookie-solution.md** - Cookie management
- **1688-chat-implementation-guide.md** - Chat implementation guide
- **1688-chat-relay-runbook.md** - Chat relay operations
- **weibo-container-design.md** - Weibo platform container design

### Technical Guides
- **MCP框架和模块开发指南.md** - MCP framework development guide (Chinese)
- **MCP_BROWSER_SETUP.md** - Browser setup for MCP
- **PORTS.md** - Port allocation and configuration

### API Documentation
- **APIS/** - Complete API reference including:
  - REST API endpoints
  - WebSocket interfaces
  - Internal service APIs
  - Data schemas
  - Authentication methods

### Component Documentation
- **actions-system/** - Actions system component docs
- **picker/** - UI picker component documentation

## Documentation Standards

### Format Guidelines
- Use Markdown for all documentation
- Include code examples and usage patterns
- Provide diagrams for complex architectures
- Maintain version compatibility information
- Include troubleshooting sections

### Content Structure
1. **Overview** - Purpose and scope
2. **Architecture** - System design and components
3. **Usage** - How to use the feature/system
4. **Configuration** - Setup and configuration options
5. **Examples** - Practical usage examples
6. **Troubleshooting** - Common issues and solutions
7. **Reference** - Detailed API/reference information

## Contributing to Documentation

When adding new documentation:
- Follow the established structure and format
- Include practical examples
- Update related documentation
- Add appropriate cross-references
- Review for clarity and accuracy

## Viewing Documentation

- Use a Markdown viewer for local viewing
- Many IDEs have built-in Markdown preview
- Consider setting up a documentation site for better navigation
