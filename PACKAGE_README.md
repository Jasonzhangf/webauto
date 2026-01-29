# 小红书采集工具 - 打包说明

## 快速打包

### 一键打包（推荐）
```bash
npm run package
```

这将：
1. 构建所有服务 (`npm run build:services`)
2. 生成跨平台安装包 (`npm run build:package`)

### 仅生成安装包
```bash
npm run build:package
```

前提：已执行过 `npm run build:services`

---

## 输出位置

打包完成后，安装包将生成在 `dist/` 目录：

- **macOS**: `dist/xiaohongshu-collector-macos-{arch}.tar.gz`
- **Linux**: `dist/xiaohongshu-collector-linux-{arch}.tar.gz`  
- **Windows**: `dist/xiaohongshu-collector-win-{arch}.zip`

**`{arch}`** 会根据当前系统自动确定：
- macOS: `arm64` 或 `x64`
- Linux: `x64`
- Windows: `x64`

---

## 安装包内容

```
xiaohongshu-collector/
├── bin/
│   ├── xhs-cli              # Unix/Linux 可执行文件
│   └── xhs-cli.bat          # Windows 批处理文件
├── dist/                    # 编译后的代码
├── scripts/                 # 脚本文件（包括 v3）
├── container-library/       # 容器配置
├── package.json             # 精简的依赖配置
├── install.sh               # Unix 安装脚本
├── install.bat              # Windows 安装脚本
└── README.md                # 用户使用说明
```

---

## 用户使用流程

### macOS/Linux

```bash
# 1. 解压
tar -xzf xiaohongshu-collector-macos-arm64.tar.gz
cd xiaohongshu-collector

# 2. 安装依赖
./install.sh

# 3. 运行 v3
./bin/xhs-cli v3 --keyword "手机壳" --count 50 --env prod

# 4. 查看帮助
./bin/xhs-cli v3 --help
```

### Windows

```powershell
# 1. 解压
# 使用 Windows 资源管理器或 7-Zip 解压

# 2. 进入目录
cd xiaohongshu-collector

# 3. 安装依赖
install.bat

# 4. 运行 v3
bin\xhs-cli.bat v3 --keyword "手机壳" --count 50 --env prod

# 5. 查看帮助
bin\xhs-cli.bat v3 --help
```

---

## v3 统一入口

v3 整合了所有阶段（Phase1 + Phase2 + Phase34），使用更简单：

### 完整运行
```bash
./bin/xhs-cli v3 --keyword "手机壳" --count 50 --env prod
```

### 分阶段执行

**仅登录**：
```bash
./bin/xhs-cli v3 --keyword "测试" --stopAfter phase1
```

**跳过登录，从搜索开始**：
```bash
./bin/xhs-cli v3 --keyword "测试" --startAt phase2
```

**跳过搜索，从详情采集开始**：
```bash
./bin/xhs-cli v3 --keyword "测试" --startAt phase34 --count 20
```

---

## 系统要求

- **Node.js**: >= 22.0.0
- **操作系统**: 
  - macOS 12+ (Monterey)
  - Windows 10+
  - Linux (Ubuntu 20.04+)

---

## 文档索引

- **v3 详细使用指南**: [docs/USAGE_V3.md](docs/USAGE_V3.md)
- **实施报告**: [docs/IMPLEMENTATION_PLAN1.md](docs/IMPLEMENTATION_PLAN1.md)
- **原始文档**: [README.md](README.md)

---

## 故障排除

### 打包失败

**错误**: `产物缺失: dist/sharedmodule/...`

**解决**:
```bash
npm run build:services
npm run build:package
```

### Node.js 版本问题

**错误**: `❌ Node.js 版本过低`

**解决**:
```bash
# 查看版本
node -v

# 升级 Node.js
# macOS: brew install node
# Windows: 访问 https://nodejs.org/
# Linux: nvm install 22
```

---

## 版本信息

- **当前版本**: v3.0.0
- **发布日期**: 2026-01-22
- **支持平台**: macOS, Linux, Windows
