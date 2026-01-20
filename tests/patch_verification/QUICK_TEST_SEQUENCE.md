# Apply Patch 工具快速验证序列

## 测试方法
通过实际应用补丁来验证工具功能，每个测试按顺序执行

---

## TEST-01: 创建新文件并添加内容

### 步骤1: 创建空文件
```bash
touch tests/patch_verification/temp_test_files/test01.txt
```

### 步骤2: 应用补丁添加内容
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test01.txt
@@ -0,0 +1,3 @@
+Line 1
+Line 2
+Line 3
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test01.txt
# 期望输出:
# Line 1
# Line 2
# Line 3
```

---

## TEST-02: 简单文本替换

### 步骤1: 准备测试文件
```bash
mkdir -p tests/patch_verification/temp_test_files
echo "hello world" > tests/patch_verification/temp_test_files/test02.txt
```

### 步骤2: 应用补丁
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test02.txt
hello world
---
goodbye world
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test02.txt
# 期望输出: goodbye world
```

---

## TEST-03: 多行替换

### 步骤1: 准备测试文件
```bash
cat > tests/patch_verification/temp_test_files/test03.txt << 'TESTFILE'
line 1
line 2
line 3
line 4
line 5
TESTFILE
```

### 步骤2: 应用补丁（替换中间3行）
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test03.txt
line 2
line 3
line 4
---
new line 2
new line 3
new line 4
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test03.txt
# 期望输出:
# line 1
# new line 2
# new line 3
# new line 4
# line 5
```

---

## TEST-04: 代码函数替换

### 步骤1: 准备测试文件
```bash
cat > tests/patch_verification/temp_test_files/test04.ts << 'TESTFILE'
function greet(name: string) {
  console.log("Hello, " + name);
  return name;
}
TESTFILE
```

### 步骤2: 应用补丁
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test04.ts
function greet(name: string) {
  console.log("Hello, " + name);
  return name;
}
---
function greet(name: string) {
  const message = `Hello, ${name}`;
  console.log(message);
  return message;
}
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test04.ts
# 期望看到新版本的函数实现
```

---

## TEST-05: 添加import语句

### 步骤1: 准备测试文件
```bash
cat > tests/patch_verification/temp_test_files/test05.ts << 'TESTFILE'
import { foo } from './foo';

const x = foo();
TESTFILE
```

### 步骤2: 应用补丁（在第一个import后添加新import）
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test05.ts
import { foo } from './foo';
---
import { foo } from './foo';
import { bar } from './bar';
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test05.ts
# 期望输出:
# import { foo } from './foo';
# import { bar } from './bar';
# 
# const x = foo();
```

---

## TEST-06: 特殊字符处理

### 步骤1: 准备测试文件
```bash
cat > tests/patch_verification/temp_test_files/test06.txt << 'TESTFILE'
path: /usr/bin
quote: "hello"
backslash: \
TESTFILE
```

### 步骤2: 应用补丁
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test06.txt
path: /usr/bin
---
path: /usr/local/bin
*** End Patch
```

### 步骤3: 验证
```bash
cat tests/patch_verification/temp_test_files/test06.txt
# 期望看到 path 被正确更新，其他特殊字符保持不变
```

---

## TEST-07: 错误处理 - 文件不存在

### 步骤: 尝试对不存在的文件应用补丁
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/nonexistent.txt
something
---
something else
*** End Patch
```

### 期望结果
应该返回清晰的错误信息，提示文件不存在

---

## TEST-08: 错误处理 - 内容不匹配

### 步骤1: 准备测试文件
```bash
echo "actual content" > tests/patch_verification/temp_test_files/test08.txt
```

### 步骤2: 尝试替换不存在的内容
补丁内容：
```
*** Begin Patch
*** Update File: tests/patch_verification/temp_test_files/test08.txt
nonexistent content
---
new content
*** End Patch
```

### 期望结果
应该返回清晰的错误信息，提示找不到待替换的内容

---

## 执行建议

1. 按顺序执行 TEST-01 到 TEST-08
2. 每个测试独立验证
3. 如果某个测试失败，记录失败原因
4. 优先修复基础测试（TEST-01 到 TEST-05）
5. 完成所有测试后清理临时文件

## 清理命令
```bash
rm -rf tests/patch_verification/temp_test_files
```

