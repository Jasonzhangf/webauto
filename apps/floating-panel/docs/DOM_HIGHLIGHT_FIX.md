# DOM 高亮功能修复总结

## 问题描述

在浮窗 UI 中点击 DOM 节点时，高亮功能无法工作，虽然可以看到调用日志，但浏览器中没有高亮效果。

## 根本原因

**UI 调用高亮 API 时缺少必需的 `profile` 参数。**

## 修复方案

### 修改的文件

1. **graph.mjs** - 传递 currentProfile (3 处)
2. **preload.mjs** - 接受 profile 参数
3. **index.mts (主进程)** - 接受并验证 profile
4. **index.mts (渲染进程)** - 移除默认值

### 核心修改

```javascript
// graph.mjs - 传递 profile
window.api.highlightElement(selector, 'blue', { channel: 'dom' }, currentProfile)

// preload.mjs - 接受 profile
highlightElement: (selector, color, options, profile) => {
  return ipcRenderer.invoke("ui:highlight", { selector, color, options, profile });
}

// index.mts (主进程) - 验证 profile
ipcMain.handle('ui:highlight', async (_evt, { selector, color, options, profile }) => {
  if (!profile) {
    throw new Error('缺少会话/ profile 信息');
  }
  // ...
});
```

## 验证测试

测试脚本: `apps/floating-panel/scripts/test-highlight-loop.mjs`

**测试结果:**
```
通过: 4/4
✅ 容器高亮（带 profile）
✅ DOM 高亮（带 profile）
✅ 正确拒绝无 profile 请求
```

## 构建

```bash
cd apps/floating-panel && npm run build
# Version: 0.1.432
```

## 启动

```bash
node scripts/start-headful.mjs
```

**状态**: ✅ 所有测试通过，功能正常
