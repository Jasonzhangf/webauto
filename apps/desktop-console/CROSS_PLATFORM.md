# WebAuto Desktop Console 跨平台兼容性说明

## 依赖管理

### camo CLI (@web-auto/camo)

**根依赖 (`package.json`)**:
```json
{
  "dependencies": {
    "@web-auto/camo": "^0.1.6"
  }
}
```

**安装方式**:
```bash
# 全局安装（推荐）
npm install -g @web-auto/camo

# 或通过项目依赖
npm install
```

**平台差异**:
| 平台 | 命令 | 自动检测 |
|------|------|---------|
| Windows | `where camo` | ✅ |
| macOS | `which camo` | ✅ |
| Linux | `which camo` | ✅ |

**注意**: `@web-auto/camo` 是根 `package.json` 的依赖，打包时会自动包含。但 CLI 工具需要全局安装才能通过 `PATH` 访问。

## 路径处理

所有文件路径使用 Node.js `path` 模块自动适配：

```typescript
import path from 'node:path';

// 自动使用正确的路径分隔符
const configPath = path.join(homeDir, '.webauto', 'config.json');
// Windows: C:\Users\xxx\.webauto\config.json
// macOS:   /Users/xxx/.webauto/config.json
```

**已实现**:
- `pathJoin(...parts)` - 跨平台路径拼接
- `pathNormalize(p)` - 路径标准化
- `pathSep` - 路径分隔符 (`\` 或 `/`)
- `osHomedir()` - 用户主目录

## 文件编码

### 配置文件导出

**Windows**: UTF-8 with BOM (兼容记事本)
```typescript
if (process.platform === 'win32') {
  const BOM = '\uFEFF';
  await fs.writeFile(filePath, BOM + content, 'utf8');
} else {
  await fs.writeFile(filePath, content, 'utf8');
}
```

**macOS/Linux**: UTF-8 (无 BOM)

### 配置文件导入

自动检测并去除 BOM：
```typescript
const content = await fs.readFile(filePath, 'utf8');
const cleanContent = content.replace(/^\uFEFF/, '');
const config = JSON.parse(cleanContent);
```

## Electron 打包

**跨平台构建**:
```bash
# macOS
npm --prefix apps/desktop-console run build
npx electron-builder --mac

# Windows
npm --prefix apps/desktop-console run build
npx electron-builder --win

# Linux
npm --prefix apps/desktop-console run build
npx electron-builder --linux
```

**注意事项**:
1. Electron 自动处理平台差异
2. 需要分别为各平台构建
3. 预构建脚本 (`check-untracked-sources.mjs`) 在所有平台运行

## 测试验证

```bash
# 环境检查（所有平台）
webauto ui test env-check

# 配置测试（验证编码）
webauto ui test config-save --output ./report.json

# 完整流程（dry-run）
webauto ui test crawl-run --keyword "测试" --target 10
```

## Windows 特定问题

### 1. 路径长度限制
Windows 默认路径长度限制为 260 字符。解决方案：
- 使用 `\\?\` 前缀
- 启用长路径支持（Windows 10 1607+）

### 2. 进程终止
```typescript
// Windows 使用 taskkill
if (process.platform === 'win32') {
  spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
} else {
  spawn('pkill', ['-TERM', '-P', String(pid)]);
}
```

### 3. 环境变量
```typescript
// Windows 使用 USERPROFILE
const homeDir = process.platform === 'win32'
  ? process.env.USERPROFILE
  : process.env.HOME;
```

## 检查清单

部署前验证：
- [ ] `@web-auto/camo` 已全局安装
- [ ] `webauto ui test env-check` 通过
- [ ] 配置文件可以导入/导出
- [ ] 路径处理正确（无 `/` 或 `\` 硬编码）
- [ ] 中文编码正确（无乱码）
