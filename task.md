# 浏览器 DOM Picker / 高亮 自动化任务板

## 基础能力验证

1. **Runtime 注入完整性**  
   - [ ] 1.1 `runtimeInjector` 注入 `runtime.js` + `domPicker.test.js`。  
   - [ ] 1.2 `ensurePageRuntime` / `BrowserSession` / 一键脚本均调用统一注入。  
   - [ ] 1.3 验证 `window.__webautoRuntime`、`window.__domPicker`、`window.__domPickerTest` 在新会话自动可用。

2. **高亮服务链路**  
   - [ ] 2.1 Runtime `highlightSelector/clear` 渲染真实 overlay。  
   - [ ] 2.2 `ws-server` 的 `highlight_element`/`clear_highlight` 调用 Runtime API 并返回命中统计。  
   - [ ] 2.3 浮窗 `highlight-service`/`highlight-actions` 通过总线触发 CLI，并接收反馈更新 UI。

3. **DOM Picker Loopback 自测**  
   - [ ] 3.1 `domPicker.test.js` 提供 `hoverLoopCheck` 并自动绣对（path/rect）。  
   - [ ] 3.2 `scripts/ui/dom-picker-loopback-cli.mjs` 只依赖统一注入，生成含高亮截图。  
   - [ ] 3.3 基于 CLI 输出校验 screenshot path + 最新状态日志。

## 闭环任务

4. **浮窗模块广播**  
   - [ ] 4.1 DOM 模块收到 `dom:highlight_feedback` 后更新状态栏。  
   - [ ] 4.2 事件总线日志（`messaging/test-driver`）可以回放 `dom:*` / `ui:*`。

5. **一键脚本统一入口**  
   - [ ] 5.1 Weibo / 1688 等脚本复用 `runtimeInjector`，移除手动 addScriptTag mock。  
   - [ ] 5.2 一键脚本完成后能直接运行 loopback CLI，自带高亮截图。

