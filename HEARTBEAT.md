# HEARTBEAT.md - 小红书采集压力测试

**Last Updated**: 2026-03-16 23:56 CST
**Status**: ❌ 暂停 - submit_search click 超时问题

---

## 🎯 当前任务

200 条压力测试遇到新问题：`submit_search` 操作 click 超时

---

## 🔍 问题定位

### 错误信息
```
mouse:click(retry) (attempt 2/2) timed out after 30000ms
operation: submit_search
runId: 0fd77d3d-b285-4e9c-b4b8-8cc83b26a7cb
```

### DOM 状态（失败时）
- `href`: "https://www.xiaohongshu.com/explore"
- `searchVisible`: true ✅
- `detailVisible`: false
- `activeElement`: search-input ✅

### 根因分析

**问题**: `submit_search` 在 type 前先 click 搜索输入框以获取焦点

**代码位置**: `collect-ops.mjs:550-557`
```javascript
await clickPointImpl(profileId, input.center, { steps: 3 });
pushTrace({ kind: 'click', stage: 'submit_search', target: 'search_input' });
await sleepRandomImpl(actionDelayMinMs, actionDelayMaxMs, pushTrace, 'submit_pre_type');

if (keyword && String(input.value || '') !== keyword) {
  await clearAndTypeImpl(profileId, keyword, Number(params.keyDelayMs ?? 65) || 65);
```

**为什么 click 超时**:
- 搜索输入框���见但 click 操作响应慢或无响应
- 30 秒超时后失败

**解决方案**:
1. `clearAndType` 已经使用键盘操作（Ctrl+A/Cmd+A + Backspace）
2. 键盘操作可以获取焦点，不需要预先 click
3. 移除 submit_search 中的 click 操作

---

## 🔧 修复方案

### 修改文件
`modules/camo-runtime/src/autoscript/action-providers/xhs/collect-ops.mjs`

### 修改内容
移除 submit_search 中 type 前的 click 操作

**Before**:
```javascript
await clickPointImpl(profileId, input.center, { steps: 3 });
pushTrace({ kind: 'click', stage: 'submit_search', target: 'search_input' });
await sleepRandomImpl(actionDelayMinMs, actionDelayMaxMs, pushTrace, 'submit_pre_type');
```

**After**:
```javascript
// Skip click - clearAndType uses keyboard shortcuts (Ctrl+A/Cmd+A) which handle focus
pushTrace({ kind: 'skip_click', stage: 'submit_search', target: 'search_input', reason: 'keyboard_type_handles_focus' });
await sleepRandomImpl(actionDelayMinMs, actionDelayMaxMs, pushTrace, 'submit_pre_type');
```

---

## 📋 问题总结

### 已修复
✅ fill_keyword 的 type 操作 click 超时（已修复，832e2c6e）
✅ sync_window_viewport 卡住（已修复，重启 daemon）

### 当前问题
❌ submit_search 的 type 前置 click 超时
- 原因：同样的 click 超时问题，但在不同位置
- 方案：移除 click，依赖键盘操作

### 模式
所有对 input 元素的 type 操作都应该：
1. **不**预先 click
2. 直接使用键盘操作（Ctrl+A/Cmd+A + Backspace + type）
3. 键盘操作会自动获取焦点

---

## ⏰ 下一步

1. 修改 `collect-ops.mjs` 移除 submit_search 的 click
2. 提交代码
3. 重新���动 200 条测试
4. 验证修复
