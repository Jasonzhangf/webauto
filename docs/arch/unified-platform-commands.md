# 统一社交平台命令格式

> 日期: 2026-03-29
> 状态: Approved

## 1. 目标

统一 `webauto` CLI 的平台命令格式，使每个社交平台（xhs / weibo / douyin 等）遵循相同的命令结构，便于扩展和维护。

## 2. 统一格式

```bash
webauto <platform> <action> [options]
```

- `platform`: 社交平台命名空间（xhs / weibo / douyin）
- `action`: 操作类型（unified / collect / like / status / install 等）
- `options`: 操作参数

## 3. 平台命名空间

| 平台 | 命名空间 | 状态 |
|---|---|---|
| 小红书 | `xhs` | ✅ 已实现 |
| 微博 | `weibo` | ⚠️ 入口文件已丢失，当前 stub |
| 抖音 | `douyin` | 🔜 未来 |

## 4. XHS 子命令

| action | 说明 | 入口文件 | daemon 巡检 |
|---|---|---|---|
| `unified` | 搜索+评论+点赞（全功能） | `xhs-unified.mjs` | ✅ |
| `collect` | 仅采集链接 | `xhs-collect.mjs` | ✅ |
| `like` | 仅点赞（新增） | `xhs-like.mjs` → `runUnified --stage like` | ✅ |
| `feed-like` | 首页 Feed 点赞（新增） | `xhs-feed-like.mjs` → `runUnified --stage feed-like` | ✅ |
| `deps` | 依赖管理（新增） | 复用 `xhs-install.mjs` | ❌ |
| `status` | 查看任务状态 | `xhs-status.mjs` | ❌ |
| `install` | 资源管理 | `xhs-install.mjs` | ❌ |
| `gate` | 流控参数管理 | `flow-gate.mjs` | ❌ |
| `orchestrate` | 编排入口（兼容） | `xhs-orchestrate.mjs` | ✅ |

## 5. 废弃/兼容

| 旧命令 | 新命令 | 策略 |
|---|---|---|
| `xhs run` | `xhs unified` | 保留别名 + deprecated 警告 |
| `webauto deps` | `webauto xhs deps` | 顶层保留兼容，推荐 xhs 命名空间 |
| `webauto weibo` | N/A | 当前输出 stub 提示 |

## 6. 路由与帮助文本更新点

- `bin/webauto.mjs`
  - 新增 `xhs like`、`xhs feed-like`、`xhs deps` 路由
  - `xhs run` 增加 deprecated 警告
  - `weibo` 改为 stub（不再指向缺失入口文件）
  - `printXhsHelp()` 更新为 9 个子命令

## 7. daemon 巡检适配

- `daemon.mjs` 中 `isXhsResumeEligible` 已放宽为所有 `xhs` 子命令
- `inspection-scheduler.mjs` 的 `_buildResumeArgs` 已覆盖 `like` / `feed-like`

## 8. 实施顺序

1. 更新设计文档和记忆
2. 新建 `xhs-like.mjs` / `xhs-feed-like.mjs`
3. 更新 `bin/webauto.mjs` 路由与 help
4. 语法检查 + 单测验证
