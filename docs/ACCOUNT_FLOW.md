# 账号添加与原子化规则

## 规则（唯一真源）
- **账号唯一真源 = `accountId`**，只有识别到 `accountId` 的账号才会被保存、列出、使用。
- **无效账号不列出、不使用、不保存**：不存在 `accountId` 的记录会被视为无效并在存储层清理。
- **UI/CLI/脚本必须统一走标准流程**：`profile -> login -> sync`。

## 标准账号添加流程（必用）

### 1) 创建 profile
```bash
webauto profilepool add profile --json
```
返回 `profileId`。

### 2) 打开登录窗口
```bash
webauto profilepool login-profile <profileId> --idle-timeout off --wait-sync false
```
用户完成登录后，继续下一步。

### 3) 同步账号（写入有效账号）
```bash
webauto account sync <profileId> --platform xiaohongshu --pending-while-login --json
```
只有当 `accountId` 被识别到，账号才会进入有效列表。

### 4) 查看有效账号列表
```bash
webauto account list --json
```

## 清理无效/孤立 profile
```bash
webauto account cleanup --include-orphans --json
```

## 禁止事项
- 禁止写入 `pending` 或 `accountId` 为空的记录。
- 禁止在 UI/脚本中调用 `webauto account add` 创建无效账号。
- 禁止使用 settings/localStorage 作为账号源。

## 允许场景
- 仅当你**已拿到 accountId**（例如已从平台识别），才允许：
```bash
webauto account add --account-id <id> --platform xiaohongshu --profile <profileId> --alias <alias>
```
