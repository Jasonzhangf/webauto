# 测试环境问题诊断

## 现象
多次尝试运行 long-running 测试（200 条）时，进程在初始化后异常终止：
1. 事件日志显示初始化正常
2. 搜索提交后页面状态异常（search_result_item count: 0）
3. 进程终止，无错误日志

## 已排除的原因
- ❌ Auto-resume 逻辑问题（已修复并验证）
- ❌ Idle timeout（已设置为 0）
- ❌ Owner watchdog（正常运行）
- ❌ Session watchdog（idleTimeoutMs: 0）

## 可能的原因
1. **进程环境问题**：可能是系统资源限制或环境配置问题
2. **Camo session 连接问题**：session 与 webauto 进程可能失去连接
3. **页面状态异常**：搜索结果页面加载异常

## 建议
1. **在更稳定的环境中测试**（如独立终端、无其他进程干扰）
2. **使用 daemon 模式运行**（避免会话中断）
3. **监控系统资源**（CPU、内存、文件描述符）

## 验证成功的内容
✅ Auto-resume 检测逻辑修复
�� Auto-resume 事件正确触发
✅ 心跳和自动关闭机制正常

## 标签
#environment #test-failure #diagnosis
