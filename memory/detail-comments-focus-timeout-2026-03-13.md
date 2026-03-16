# Detail 评论采集 Focus 阶段卡住问题（2026-03-13）

## 问题描述

**runId**: `2ffc1117-23e9-4be0-b4e7-11638187a10b`

**卡住位置**: `focus_comment_context_before_focus_click`

**现象**:
1. 评论采集操作启动后，在 focus 阶段卡住
2. `highlightStep('focus')` 调用 `highlightVisualTarget`，然后调用 `runEvaluateScript`
3. `runEvaluateScript` 调用 `callAPI('evaluate', ...)` 但没有返回
4. 没有超时错误，也没有后续日志

**根本原因**:
1. `highlightVisualTarget` 没有配置超时参数
2. `runEvaluateScript` 调用 `callAPI` 时没有明确的超时配置
3. `callAPI` 的默认超时可能不够或不生效
4. 缺少 try-catch 错误处理机制

**日志证据**:
```
xhs_comments_harvest:
- focus_comment_context_start ✅
- focus_comment_context_targets_read ✅
- focus_comment_context_target_resolved ✅
- focus_comment_context_before_focus_click ✅ (卡在这里)
- 后续没有任何操作完成或错误事件
```

## 修复方案

### 1. 为 `highlightVisualTarget` 添加超时配置

**文件**: `modules/camo-runtime/src/autoscript/action-providers/xhs/dom-ops.mjs`

**修改**:
```javascript
export async function highlightVisualTarget(profileId, target, options = {}) {
  // 添加默认超时配置
  const timeoutMs = Math.max(5000, Number(options.timeoutMs ?? 10000) || 10000);
  
  const style = resolveHighlightStyle(options.state || 'focus');
  // ... 现有代码 ...
  
  await runEvaluateScript({
    profileId,
    script: buildVisualHighlightScript({...}),
    highlight: false,
    allowUnsafeJs: true,
    timeoutMs, // 添加超时配置
  });
}
```

### 2. 为 `runEvaluateScript` 添加超时配置传递

**文件**: `modules/camo-runtime/src/autoscript/action-providers/xhs/common.mjs`

**修改**:
```javascript
export async function runEvaluateScript({
  profileId,
  script,
  highlight = true,
  allowUnsafeJs = false,
  timeoutMs, // 添加超时参数
}) {
  const sourceScript = String(script || '');
  if (!allowUnsafeJs) {
    assertNoForbiddenJsAction(sourceScript, 'xhs provider evaluate');
  }
  const wrappedScript = highlight && allowUnsafeJs ? withOperationHighlight(sourceScript) : sourceScript;
  return callAPI('evaluate', { 
    profileId, 
    script: wrappedScript,
    timeoutMs, // 传递超时配置
  });
}
```

### 3. 为 `highlightStep` 添加超时配置

**文件**: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`

**修改**:
```javascript
const highlightStep = async (channel, target, stateName, label, duration = 2400) => {
  if (!target?.center) return;
  
  // 添加超时配置
  const timeoutMs = Math.max(5000, duration * 2);
  
  try {
    await highlightVisualTargetImpl(profileId, target, {
      channel,
      state: stateName,
      label,
      duration,
      timeoutMs, // 添加超时
    });
  } catch (error) {
    // 添加错误处理
    const errorCode = String(error?.code || '').toUpperCase();
    progress('highlight_step_failed', {
      channel,
      stateName,
      label,
      error: error?.message || String(error),
      errorCode: errorCode || null,
    });
    
    // 如果是超时错误，记录但不中断流程
    if (!errorCode.includes('TIMEOUT')) {
      throw error;
    }
  }
};
```

### 4. 为 focus 阶段添加降级策略

**文件**: `modules/camo-runtime/src/autoscript/action-providers/xhs/harvest-ops.mjs`

**修改**: 在 `focus_comment_context_before_focus_click` 后添加 try-catch

```javascript
progress('focus_comment_context_before_focus_click', {
  mode,
  selector: commentScroll.selector || null,
  focusSource: clickableTarget?.source || null,
  focusSelector: clickableTarget?.selector || null,
});

if (clickableTarget && clickableTarget.center) {
  try {
    await highlightStep(focusChannel, clickableTarget, 'focus', focusLabel);
    await clickPointImpl(profileId, clickableTarget.center, { steps: 2, timeoutMs: focusClickTimeoutMs });
    didFocusClick = true;
  } catch (error) {
    const message = error?.message || String(error);
    const errorCode = String(error?.code || '').toUpperCase();
    
    progress('focus_comment_context_focus_failed', {
      mode,
      selector: commentScroll.selector || null,
      focusSource: clickableTarget?.source || null,
      focusSelector: clickableTarget?.selector || null,
      error: message,
      errorCode: errorCode || null,
    });
    
    // 如果是超时错误，尝试跳过 highlight 直接点击
    if (errorCode.includes('TIMEOUT')) {
      try {
        await clickPointImpl(profileId, clickableTarget.center, { steps: 2, timeoutMs: focusClickTimeoutMs });
        didFocusClick = true;
      } catch (clickError) {
        progress('focus_comment_context_click_failed', {
          mode,
          error: clickError?.message || String(clickError),
          errorCode: String(clickError?.code || '').toUpperCase(),
        });
        return {
          ok: false,
          code: 'COMMENTS_CONTEXT_FOCUS_AND_CLICK_FAILED',
          message: 'comment focus and click both failed',
          data: { mode, error: message, errorCode },
        };
      }
    } else {
      return {
        ok: false,
        code: 'COMMENTS_CONTEXT_FOCUS_FAILED',
        message: 'comment focus failed',
        data: { mode, error: message, errorCode },
      };
    }
  }
}
```

## 验证计划

1. 应用修复后重新运行 detail 测试
2. 检查 focus 阶段是否能够正常完成或超时降级
3. 确认评论采集能够继续进行
4. 验证错误处理是否正确记录
