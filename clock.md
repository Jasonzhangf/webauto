
## 背景
CLI 重构 Phase 2：UI 代码已清理，daemon guard 已移除，daemon 设计文档已创建

## 当前阻塞点
无阻塞

## 下次提醒要做的第一步
补充单元测试（schedule-daemon、schedule-retry、CLI help 输出）

## 不能忘的检查项
- bin/webauto.mjs 已无 UI/electron 依赖（983行，原1314行）
- xhs-unified.mjs 支持 CLI 直接执行（无 daemon guard）
- docs/daemon-design.md 已创建（重试/退避/错误分类设计）
- docs/cli-design.md 已更新（移除 relay 引用）
- 单元测试待补充
