# 小红书采集工具 v3 - 快速使用指南

## 🚀 版本说明

**v3.0.0** 是统一入口版本，整合了 Phase1、Phase2 和 Phase34 三个阶段，提供更简单的使用体验。

## 📦 安装包结构

```
xiaohongshu-collector/
├── bin/
│   ├── xhs-cli              # Unix/Linux 入口
│   └── xhs-cli.bat          # Windows 入口
├── scripts/
│   └── run-xiaohongshu-phase1-2-34-v3.mjs  # v3 核心脚本
├── README.md
├── install.sh               # Unix 安装脚本
├── install.bat              # Windows 安装脚本
└── package.json
```

## 🎯 快速开始

### 1. 安装依赖

```bash
# macOS/Linux
./install.sh

# Windows
install.bat
```

### 2. 使用 v3 统一入口（推荐）

**一键完整运行：**
```bash
# macOS/Linux
./bin/xhs-cli v3 --keyword "手机壳" --count 50 --env prod

# Windows
bin\xhs-cli.bat v3 --keyword "手机壳" --count 50 --env prod
```

**查看帮助：**
```bash
./bin/xhs-cli v3 --help
```

**查看版本：**
```bash
./bin/xhs-cli v3 --version
```

## 🔧 高级用法

### 分阶段执行

v3 支持灵活的阶段控制：

**仅运行 Phase1（登录）：**
```bash
./bin/xhs-cli v3 --keyword "测试" --stopAfter phase1
```

**从 Phase34 开始（跳过搜索）：**
```bash
./bin/xhs-cli v3 --keyword "测试" --startAt phase34 --count 20
```

**只运行 Phase2（采集链接）：**
```bash
./bin/xhs-cli v3 --keyword "测试" --startAt phase2 --stopAfter phase2
```

### 完整参数列表

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--keyword` | 搜索关键词（必填） | - |
| `--count` | 目标采集数量 | 20 |
| `--sessionId` | 会话ID | xiaohongshu_fresh |
| `--startAt` | 起始阶段 (phase1/phase2/phase34) | phase1 |
| `--stopAfter` | 结束阶段 (phase1/phase2/phase34) | phase34 |
| `--linksCount` | Phase2 链接目标数 | max(count*2, count+30) |
| `--env` | 运行环境 | debug |
| `--version, -v` | 显示版本信息 | - |
| `--help, -h` | 显示帮助信息 | - |

## 📂 数据存储位置

采集结果保存在：
```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
```

例如：
```
~/.webauto/download/xiaohongshu/prod/手机壳/
├── phase2-links.jsonl          # Phase2 采集的链接
├── notes/                      # Phase34 采集的笔记详情
│   ├── note_001.json
│   ├── note_002.json
│   └── ...
└── organized/                  # 整理后的数据
```

## ⚠️ 注意事项

1. **Node.js 版本**：需要 Node.js >= 22.0.0
2. **频率控制**：Phase2 会触发站内搜索，频繁运行可能触发风控
3. **迭代调试建议**：
   - Phase1 运行一次（登录）
   - Phase2 运行一次（采集链接）
   - Phase34 反复运行（采集详情）
4. **端口占用**：确保以下端口未被占用：7701, 7704, 8765, 7790

## 🐛 故障排除

### 问题：Node.js 版本过低
```bash
# 查看当前版本
node -v

# 升级 Node.js
# macOS
brew install node

# Windows
# 访问 https://nodejs.org/ 下载安装
```

### 问题：缺少构建产物
```bash
# 错误信息：❌ 缺少必要的构建产物

# 解决方案：重新安装
./install.sh  # 或 install.bat
```

### 问题：崩溃信息
查看崩溃日志：
```bash
cat ~/.webauto/logs/crash-state.json
```

## 📞 技术支持

- **GitHub**: https://github.com/your-repo/webauto
- **文档**: https://github.com/your-repo/webauto/docs
- **Issues**: https://github.com/your-repo/webauto/issues

## 📝 更新日志

### v3.0.0 (2026-01-22)
- ✨ 统一 Phase1-2-34 入口
- ✨ 添加版本管理和环境检查
- ✨ 增强错误处理和崩溃恢复
- ✨ 支持 Linux 平台
- ✨ 改进帮助文档（中文）
- ✨ 添加 SIGINT/SIGTERM 优雅退出
- 🐛 修复路径检查问题
- 📚 完善使用文档
