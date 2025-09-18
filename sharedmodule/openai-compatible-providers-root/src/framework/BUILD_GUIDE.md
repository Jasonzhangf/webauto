# OpenAI Compatible Providers Framework 构建指南

## 🚀 快速开始

### 环境要求
- Node.js >= 16.0.0
- npm >= 6.0.0

### 安装和构建
```bash
# 克隆项目
git clone <repository-url>
cd openai-compatible-providers-framework

# 安装依赖
npm install

# 开发环境设置
npm run dev:setup

# 构建项目
npm run build
```

## 📦 构建脚本

### 标准构建
```bash
# 完整构建 (清理 + 编译 + 测试 + 检查)
npm run build

# 生产构建 (跳过测试)
npm run build:prod

# 监听模式构建
npm run build:watch
```

### 使用 Node.js 脚本
```bash
# 使用自定义构建脚本
node scripts/build.js

# 清理并重新构建
node scripts/build.js --clean-deps

# 跳过测试
node scripts/build.js --skip-tests

# 跳过代码检查
node scripts/build.js --skip-lint
```

### 使用 Makefile (推荐)
```bash
# 查看所有可用命令
make help

# 基本构建
make build

# 完整开发环境设置
make dev-setup

# 快速检查
make check
```

## 🧪 测试

### 运行测试
```bash
# 所有测试
npm test

# 监听模式
npm run test:watch

# 测试覆盖率
npm run test:coverage

# CI 模式
npm run test:ci
```

### 使用 Makefile
```bash
make test
make test:watch
make test:cover
```

## 🔍 代码质量

### 代码检查和格式化
```bash
# 运行 ESLint
npm run lint

# 自动修复问题
npm run lint:fix

# 格式化代码
npm run format

# 检查格式
npm run format:check
```

### 安全检查
```bash
# 安全审计
npm run security

# 自动修复安全问题
npm run security:fix
```

## 📤 发布流程

### 安全发布 (推荐)
```bash
# 完整发布流程
npm run publish:safe

# 预演发布 (不实际发布)
npm run release:dry
```

### 快速发布
```bash
# 快速发布 (跳过一些检查)
npm run publish:quick

# 发布特定版本
npm run release:patch    # 补丁版本 (0.0.1 -> 0.0.2)
npm run release:minor    # 次要版本 (0.1.0 -> 0.2.0)
npm run release:major    # 主要版本 (1.0.0 -> 2.0.0)
```

### 使用发布脚本
```bash
# 完整发布流程
node scripts/publish.js

# 干运行 (测试发布流程)
node scripts/publish.js --dry-run

# 跳过推送
node scripts/publish.js --no-push

# 跳过 GitHub Release
node scripts/publish.js --no-release

# 强制发布 (不确认)
node scripts/publish.js --force
```

### 使用 Makefile
```bash
# 发布
make publish

# 完整发布流程
make release

# 版本发布
make release:patch
make release:minor
make release:major
```

## 🛠️ 开发工作流

### 日常开发
```bash
# 1. 安装依赖
make install

# 2. 启动监听模式
make build:watch &

# 3. 运行测试
make test:watch

# 4. 代码检查
make lint:fix
make format
```

### 提交前检查
```bash
# 完整检查
make check

# 或分别运行
make lint
make test
make format:check
```

### 版本发布流程
```bash
# 1. 更新版本
make version-bump

# 2. 完整发布
make release

# 3. 或使用 npm
npm version patch && npm publish
```

## 📁 项目结构

```
openai-compatible-providers-framework/
├── src/                    # 源代码
│   ├── framework/         # 框架核心
│   ├── compatibility/     # 兼容性模块
│   └── config/           # 配置文件
├── scripts/              # 构建脚本
│   ├── build.js         # 构建脚本
│   └── publish.js       # 发布脚本
├── config/              # 示例配置
├── dist/                 # 构建输出
├── docs/                # 文档
├── tests/               # 测试
├── Makefile             # 构建工具
├── package.json         # 项目配置
└── README.md            # 项目说明
```

## ⚙️ 配置选项

### TypeScript 配置 (tsconfig.json)
- 目标: ES2020
- 模块: CommonJS
- 严格模式: 启用
- 声明文件: 生成

### Jest 配置 (jest.config.js)
- 测试环境: Node.js
- 覆盖率报告: text, lcov, html
- 超时时间: 10秒

### ESLint 配置 (.eslintrc.js)
- 规则集: ESLint 推荐规则 + Prettier
- 环境支持: Node.js, Jest, ES2021
- 自动修复: 启用

## 🎯 最佳实践

### 1. 代码提交前
```bash
# 运行完整检查
make check

# 或使用 Git hooks
make setup-hooks
```

### 2. 版本管理
- 使用语义化版本号
- 发布前更新 CHANGELOG.md
- 创建 Git 标签

### 3. 安全实践
```bash
# 定期检查依赖安全
npm audit

# 更新依赖
npm update
```

### 4. 文档维护
- 保持 README.md 更新
- 使用 Typedoc 生成 API 文档
- 维护 CHANGELOG.md

## 🔧 故障排除

### 常见问题

**构建失败**
```bash
# 清理并重新安装
make reinstall

# 检查 Node.js 版本
node --version  # 需要 >= 16.0.0
```

**测试失败**
```bash
# 重新安装依赖
npm ci

# 清理缓存
npm run clean
```

**发布失败**
```bash
# 检查 Git 状态
git status

# 检查 npm 登录
npm whoami
```

**ESLint 错误**
```bash
# 自动修复
npm run lint:fix

# 格式化代码
npm run format
```

## 📚 更多资源

- [npm 文档](https://docs.npmjs.com/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Jest 文档](https://jestjs.io/docs/getting-started)
- [ESLint 文档](https://eslint.org/docs/latest/)

---

🎉 **Happy Coding!**