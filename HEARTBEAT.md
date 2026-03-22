# HEARTBEAT.md - CLI 去 UI/daemon 精简
Heartbeat-Until: 2026-03-22T06:00:00+08:00

**Last Updated**: 2026-03-22 00:30 CST
**Status**: 🚧 进行中：CLI 去 UI/daemon 精简与调度设计

---

## 📋 当前计划任务列表

1. ✅ **移除 desktop UI 依赖** (2026-03-22)
   - 清理 `bin/webauto.mjs` 中 desktop-console/electron 相关逻辑
   - 移除 uiConsole、ensureUiRuntimeReady、checkDesktopConsoleDeps 等函数
   - 移除 daemon relay 支持
   - 移除 UI CLI 命令 (ui console/restart/cli/test)
   - 清理 build:dev/build:release 中的 desktop-console 构建步骤
   - 文件从 1314 行精简到 983 行

2. ✅ **移除 daemon guard** (2026-03-22)
   - 移除 `xhs-unified.mjs` 中的 daemon worker ID 检查
   - CLI 可直接执行 `webauto xhs unified` 无需 daemon

3. ✅ **daemon 设计文档** (2026-03-22)
   - 创建 `docs/daemon-design.md`
   - 包含：调度模型、租约机制、重试/退避策略、错误分类、断点续传

4. ✅ **更新 cli-design.md** (2026-03-22)
   - 更新 Evidence Matrix（executor 直连 runUnified）
   - 更新当前问题描述
   - 移除 relay 引用

5. ✅ **补充单元测试** (2026-03-22)
   - 更新 `ui-cli-command.test.mjs` → 重写为 CLI 帮助输出测试
   - 新增 `schedule-retry.test.mjs`（错误分类 + 退避计算，18 个用例）
   - 现有 `schedule-cli.test.mjs` 全部通过（11 个用例）

## 📋 待办

1. 将 classifyError/calcBackoffMs 提取为共享模块
2. 实现重试策略到 schedule.mjs
3. 完善 wa CLI 命令（init/run/status/login/stop）
4. E2E smoke test（webauto xhs unified 直接执行）

## 📋 关键文件

- `bin/webauto.mjs` - 主 CLI 入口（已精简）
- `bin/wa.mjs` - 新 CLI 入口
- `cli/` - CLI 模块目录
- `apps/webauto/entry/xhs-unified.mjs` - XHS 统一入口（daemon guard 已移除）
- `apps/webauto/entry/schedule.mjs` - 调度入口
- `apps/webauto/entry/daemon.mjs` - Daemon 入口
- `docs/cli-design.md` - CLI 设计文档
- `docs/daemon-design.md` - Daemon 调度设计文档

## 📋 证据

- `node bin/webauto.mjs --help` → 输出无 UI/electron/relay 引用
- `node bin/webauto.mjs` → 显示帮助而非启动 UI
- `node --test tests/unit/webauto/ui-cli-command.test.mjs` → 5/5 pass
- `node --test tests/unit/webauto/schedule-retry.test.mjs` → 18/18 pass
- `node --test tests/unit/webauto/schedule-cli.test.mjs` → 11/11 pass
