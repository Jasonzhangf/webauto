#!/bin/bash
# 设置3个定时巡检任务，确保连续覆盖

# 任务1：立即开始
cat > /tmp/clock-task-1.json << 'JSON1'
{
  "action": "schedule",
  "items": [{
    "dueAt": "2026-03-16T15:40:00+08:00",
    "task": "巡检 deepseekAI 200 条压力测试 #1",
    "clockMdSection": "## 巡检记录",
    "recurrence": {"kind": "interval", "everyMinutes": 10, "maxRuns": 3}
  }],
  "taskId": "inspection-1"
}
JSON1

# 任务2：5分钟后开始
cat > /tmp/clock-task-2.json << 'JSON2'
{
  "action": "schedule",
  "items": [{
    "dueAt": "2026-03-16T15:45:00+08:00",
    "task": "巡检 deepseekAI 200 条压力测试 #2",
    "clockMdSection": "## 巡检记录",
    "recurrence": {"kind": "interval", "everyMinutes": 10, "maxRuns": 3}
  }],
  "taskId": "inspection-2"
}
JSON2

# 任务3：10分钟后开始
cat > /tmp/clock-task-3.json << 'JSON3'
{
  "action": "schedule",
  "items": [{
    "dueAt": "2026-03-16T15:50:00+08:00",
    "task": "巡检 deepseekAI 200 条压力测试 #3",
    "clockMdSection": "## 巡检记录",
    "recurrence": {"kind": "interval", "everyMinutes": 10, "maxRuns": 3}
  }],
  "taskId": "inspection-3"
}
JSON3

echo "定时任务配置文件已生成"
echo "任务1: 15:40:00 CST"
echo "任务2: 15:45:00 CST"
echo "任务3: 15:50:00 CST"
echo ""
echo "注意：这些是配置文件，实际需要通过 clock 工具激活"
