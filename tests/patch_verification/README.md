# Apply Patch 工具完整测试方案

## 概述

本测试方案旨在全面验证 `apply_patch` 工具的正确性和鲁棒性，覆盖从基础操作到复杂边界场景的所有情况。

## 文档结构

- `TEST_PLAN.md` - 详细的测试计划文档
- `test_cases_registry.mjs` - 所有测试用例的结构化定义
- `test_runner.mjs` - 自动化测试执行器
- `test_files/` - 测试输入文件
- `expected/` - 预期输出文件
- `actual/` - 实际执行结果
- `reports/` - 测试报告

## 快速开始

### 1. 查看测试计划
```bash
cat tests/patch_verification/TEST_PLAN.md
```

### 2. 查看所有测试用例
```bash
node tests/patch_verification/test_cases_registry.mjs list
```

### 3. 执行特定分类的测试
```bash
# 执行基础功能测试（阶段1）
node tests/patch_verification/test_runner.mjs --category=basic

# 执行代码编辑测试（阶段2）
node tests/patch_verification/test_runner.mjs --category=code_editing

# 执行边界条件测试（阶段3）
node tests/patch_verification/test_runner.mjs --category=edge_cases

# 执行复杂场景测试（阶段4）
node tests/patch_verification/test_runner.mjs --category=complex

# 执行错误处理测试（阶段5）
node tests/patch_verification/test_runner.mjs --category=error_handling
```

### 4. 执行所有测试
```bash
node tests/patch_verification/test_runner.mjs --all
```

### 5. 执行单个测试用例
```bash
node tests/patch_verification/test_runner.mjs --test=T1.1
```

## 测试用例分类

### 阶段 1：基础功能测试 (6个用例)
- T1.1 - 简单文本替换
- T1.2 - 多行文本替换
- T1.3 - 单行插入（行首）
- T1.4 - 单行插入（行尾）
- T1.5 - 单行插入（中间）
- T1.6 - 单行删除

### 阶段 2：代码编辑测试 (5个用例)
- T2.1 - 函数内容替换
- T2.2 - 添加新函数
- T2.3 - 修改配置文件
- T2.4 - 导入语句添加
- T2.5 - 注释修改

### 阶段 3：边界条件测试 (6个用例)
- T3.1 - 空文件操作
- T3.2 - 大文件操作
- T3.3 - 特殊字符处理
- T3.4 - 重复文本处理
- T3.5 - 缩进处理
- T3.6 - 换行符处理

### 阶段 4：复杂场景测试 (5个用例)
- T4.1 - 多处修改
- T4.2 - 跨行块操作
- T4.3 - 代码重构场景
- T4.4 - 文档字符串修改
- T4.5 - 条件编译指令

### 阶段 5：错误处理测试 (5个用例)
- T5.1 - 文件不存在
- T5.2 - 内容不匹配
- T5.3 - 权限错误
- T5.4 - 语法破坏
- T5.5 - 并发修改

**总计：27 个测试用例**

## 执行顺序建议

1. **第一轮**：执行阶段1（基础功能测试）
   - 目标：100% 通过
   - 如有失败，优先修复

2. **第二轮**：执行阶段2（代码编辑测试）
   - 目标：100% 通过

3. **第三轮**：执行阶段3（边界条件测试）
   - 目标：≥90% 通过
   - 记录失败用例及原因

4. **第四轮**：执行阶段4（复杂场景测试）
   - 目标：≥80% 通过
   - 记录性能数据

5. **第五轮**：执行阶段5（错误处理测试）
   - 目标：正确识别和报告所有错误

6. **最终轮**：完整回归测试
   - 执行所有测试用例
   - 生成最终报告

## 成功标准

- ✅ 阶段1 + 阶段2：100% 通过
- ✅ 阶段3：≥90% 通过
- ✅ 阶段4：≥80% 通过
- ✅ 阶段5：所有错误都被正确识别

## 报告格式

测试完成后会生成：
- `reports/summary.md` - 整体摘要
- `reports/detailed_YYYYMMDD_HHMMSS.md` - 详细报告
- `reports/failures_YYYYMMDD_HHMMSS.md` - 失败用例详情
- `reports/performance.json` - 性能数据

## 下一步

1. 实现 `test_cases_registry.mjs`
2. 实现 `test_runner.mjs`
3. 准备测试数据文件
4. 按阶段执行测试
5. 分析结果并修复问题
