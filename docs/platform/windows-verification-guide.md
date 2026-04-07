# Windows 平台验证指南

Windows Platform Verification Guide

## 1. 环境准备

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| Node.js | `node -v` | v20+ |
| NPM | `npm -v` | v10+ |
| Git | `git --version` | v2.40+ |
| PowerShell | `$PSVersionTable.PSVersion` | 5.1+ or 7.4+ |

## 2. 安装步骤

```powershell
# 克隆仓库
git clone https://github.com/Jasonzhangf/webauto.git
cd webauto

# 安装依赖
npm install

# 初始化 (下载浏览器 + GeoIP)
npx webauto init

# 验证安装
npx webauto --help
```

## 3. 核心功能验证

| # | 测试场景 | 命令 | 预期 |
|---|----------|------|------|
| 3.1 | Daemon 启动 | `npx webauto daemon start` | 启动成功 |
| 3.2 | XHS 搜索 | `npx webauto daemon task submit --detach -- xhs unified --keyword "AI" --max-notes 5` | Job 成功 |
| 3.3 | Weibo 时间线 | `npx webauto daemon task submit --detach -- weibo unified --task-type timeline` | Job 成功 |
| 3.4 | 视频解析 | `npx webauto weibo video http://t.cn/xxx` | 返回 mp4 |
| 3.5 | Always-On Producer | `npx webauto daemon task submit --detach -- xhs-producer --mode hot-search` | 提取热搜 |
| 3.6 | Always-On Consumer | `npx webauto daemon task submit --detach -- xhs-consumer --do-likes true` | 消费队列 |

## 4. Windows 兼容性

### 4.1 通信协议
- ✅ 使用 TCP (127.0.0.1:7701/7704/8765)
- ✅ 不依赖 Unix Socket

### 4.2 进程管理
| Linux | Windows PowerShell |
|-------|-------------------|
| `grep` | `Select-String` |
| `tail -f` | `Get-Content -Wait -Tail` |
| `kill -9` | `Stop-Process -Force` |
| `ps aux` | `Get-Process` |

## 5. 常见问题

### Q1: 浏览器启动失败 (ENOENT)
**解决**: 运行 `npx webauto init` 下载浏览器

### Q2: 中文乱码
**解决**: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`

### Q3: 后台驻留
**建议**: 使用 NSSM 包装为 Windows Service

## 6. 服务化部署 (推荐)

使用 NSSM 安装为 Windows 服务:

```powershell
# 下载 NSSM
# https://nssm.cc/download

# 安装服务
nssm install WebAutoDaemon "node" "C:\path\to\webauto\bin\webauto.mjs daemon start"
nssm set WebAutoDaemon AppDirectory "C:\path\to\webauto"
nssm set WebAutoDaemon DisplayName "WebAuto Daemon"
nssm set WebAutoDaemon Start SERVICE_AUTO_START

# 启动服务
nssm start WebAutoDaemon
```
