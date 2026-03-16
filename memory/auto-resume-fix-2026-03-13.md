# Auto-Resume Fix 2026-03-13

## Problem
Auto-resume 检测逻辑在用户指定 `--output-root` 时失��：
- `collectCompletedNoteIds` 使用 `baseOutputRoot`（可能是临时目录如 `./.tmp/...`）
- 已完成的笔记存储在持久化目录 `~/.webauto/download/`
- 导致检测失败，auto-resume 不触发

## Solution
在 `xhs-unified-runner.mjs` 中：
1. 新增 `persistentDownloadRoot` 变量：指向 `~/.webauto/download`
2. 修改 `collectCompletedNoteIds` 调用：使用 `persistentDownloadRoot` 而非 `baseOutputRoot`

## Verification
测试命令：
```bash
node bin/webauto.mjs xhs unified --profile xhs-qa-1 --keyword "unknown" --max-notes 100 --do-comments false --do-likes true --like-keywords "unknown" --env debug --output-root ./.tmp/auto-resume-test-unknown-100
```

结果：
- ✅ `xhs.unified.auto_resume` 事件正确触发
- ✅ 检测到 59 个已完成的笔记
- ✅ Auto-resume 逻辑启用

## Files Changed
- `apps/webauto/entry/lib/xhs-unified-runner.mjs`
  - 新增 `persistentDownloadRoot` 变量
  - 修改 `collectCompletedNoteIds` 调用

## Tags
#auto-resume #fix #xhs-unified #output-root #persistent-storage
