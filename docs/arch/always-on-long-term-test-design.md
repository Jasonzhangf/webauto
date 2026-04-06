# Always-On 长期压力测试设计

## 目标

验证 Always-On 模式在**长期无人值守**环境下的稳定性：
- Producer 定时补货，不漏采集
- Consumer 持续处理，不死机
- 健康检查自愈，不降级
- 24 小时+ 持续运行，数据完整

## 测试架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Always-On 压力测试                        │
│                                                             │
│  Producer (定时任务)          Consumer (持久任务)            │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ 每 30 分钟扫描   │          │ 持续运行，不退出 │          │
│  │ 搜索 seedance2.0│ ──────→  │ 从队列取链接处理 │          │
│  │ 去重后入队      │          │ 评论采集 + 点赞 │          │
│  │ 低水位触发补货  │          │ 队列空则等待    │          │
│  └─────────────────┘          └─────────────────┘          │
│          ↓                            ↓                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             Search-Gate 队列 (服务端)                │   │
│  │  claim / complete / release                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  健康检查 (每 5 分钟)                                        │
│  ├─ daemon spawn 能力                                       │
│  ├─ browser-service HTTP                                    │
│  ├─ 输入响应                                                │
│  ├─ spawn 失败率                                            │
│  └─ 不健康 → 告警 + 自动恢复                                │
└─────────────────────────────────────────────────────────────┘
```

## 测试参数

| 参数 | Producer | Consumer |
|------|----------|----------|
| 关键词 | seedance2.0 | seedance2.0 |
| Profile | xhs-qa-1 | xhs-qa-1 |
| 间隔 | 30 分钟 | 持续运行 |
| 单次上限 | 20 条链接 | 无上限 |
| 去重源 | posts.jsonl | — |
| 评论 | — | 开启 |
| 点赞 | — | 开启 (关键词: AI) |
| Tab 数 | — | 4 |
| 预算 | — | 50 条/Tab |

## 监控指标

| 指标 | 阈值 | 告警条件 |
|------|------|----------|
| Producer 入队数 | > 0/次 | 连续 3 次 = 0 |
| Consumer 处理数 | > 0/小时 | 连续 2 小时 = 0 |
| 队列深度 | < 100 | > 100 积压 |
| spawn 失败率 | < 20% | > 50% 告警 |
| 内存占用 | < 1GB | > 1.5GB 告警 |
| 运行时长 | 持续 | 中断即告警 |

## 自动恢复机制

```
健康检查失败
    ↓
判断失败类型
    ├─ spawn 失败 → 重启 daemon
    ├─ browser 挂了 → 重启 camo
    ├─ 内存泄漏 → 重启 consumer
    └─ 其他 → 告警人工介入
    ↓
恢复后继续
```

## 启动命令

### Producer (定时任务)

```bash
# 方式一：通过 schedule 管理
webauto schedule add \
  --name "always-on-producer-seedance" \
  --schedule-type interval \
  --interval-minutes 30 \
  --command-type xhs-producer \
  --keyword seedance2.0 \
  --profile xhs-qa-1 \
  --max-links-per-scan 20

# 方式二：手动启动（测试用）
webauto daemon task submit --detach -- xhs-producer \
  --keyword seedance2.0 \
  --profile xhs-qa-1 \
  --max-links-per-scan 20
```

### Consumer (持久任务)

```bash
# 通过 daemon 启动（持久运行）
webauto daemon task submit --detach -- xhs-consumer \
  --keyword seedance2.0 \
  --profile xhs-qa-1 \
  --do-comments true \
  --do-likes true \
  --like-keywords "AI" \
  --tab-count 4 \
  --comment-budget 50
```

### 健康检查巡检

```bash
# 每 5 分钟检查一次，持续 24 小时
# 通过 clock 工具设置
```

## 验收标准

| 时间 | 验收条件 |
|------|----------|
| 1 小时 | 无崩溃，处理 > 10 条 |
| 6 小时 | 无崩溃，处理 > 50 条 |
| 24 小时 | 无崩溃，处理 > 200 条，spawn 失败率 < 20% |
| 7 天 | 无崩溃，处理 > 1000 条，数据无丢失/重复 |

## 数据验证

```bash
# 检查采集数据
cat ~/.webauto/download/xiaohongshu/debug/seedance2.0/*/posts.jsonl | wc -l
cat ~/.webauto/download/xiaohongshu/debug/seedance2.0/*/comments.jsonl | wc -l

# 检查去重
cat ~/.webauto/download/xiaohongshu/debug/seedance2.0/*/posts.jsonl | \
  jq -r '.noteId' | sort -u | wc -l

# 检查队列状态
curl http://127.0.0.1:7704/health | jq '.queueDepth'
```

## 停止条件

- 人工主动停止：`webauto daemon task stop --job-id <id>`
- 发现严重 bug：立即停止修复
- 数据异常：停止排查

## 日志路径

- Producer: `~/.webauto/logs/daemon-jobs/job_*.log`
- Consumer: `~/.webauto/logs/daemon-jobs/job_*.log`
- 健康检查: `~/.webauto/logs/command-log.jsonl`
