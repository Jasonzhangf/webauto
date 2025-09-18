# OpenAI Compatible Providers Framework Makefile
# 标准构建和发布工具

.PHONY: help install build test lint clean publish release dev-setup version-check format

# 默认目标
help:
	@echo "🚀 OpenAI Compatible Providers Framework 构建工具"
	@echo "=================================================="
	@echo ""
	@echo "📦 构建:"
	@echo "  install    - 安装依赖"
	@echo "  build      - 构建项目"
	@echo "  clean      - 清理构建文件"
	@echo "  dev-setup  - 开发环境设置"
	@echo ""
	@echo "🧪 测试:"
	@echo "  test       - 运行测试"
	@echo "  test:watch - 监听模式运行测试"
	@echo "  test:cover - 运行测试覆盖率"
	@echo ""
	@echo "🔍 代码质量:"
	@echo "  lint       - 运行代码检查"
	@echo "  lint:fix   - 自动修复代码问题"
	@echo "  format     - 格式化代码"
	@echo "  format:check - 检查代码格式"
	@echo ""
	@echo "📤 发布:"
	@echo "  publish    - 发布到 npm"
	@echo "  release    - 完整发布流程"
	@echo "  release:patch - 补丁版本发布"
	@echo "  release:minor - 次要版本发布"
	@echo "  release:major - 主要版本发布"
	@echo ""
	@echo "📋 其他:"
	@echo "  version    - 显示版本信息"
	@echo "  docs       - 生成文档"
	@echo "  setup-hooks - 设置 Git hooks"

# 安装依赖
install:
	npm install

# 构建项目
build: clean
	node scripts/build.js

# 开发环境设置
dev-setup: install
	npm install --save-dev typescript @types/node jest eslint prettier
	npx tsc --init

# 清理构建文件
clean:
	rm -rf dist/
	rm -rf node_modules/.cache/
	find . -name "*.log" -delete
	find . -name "*.tmp" -delete

# 运行测试
test:
	npm test

# 监听模式运行测试
test:watch:
	npm run test:watch

# 运行测试覆盖率
test:cover:
	npm run test:coverage

# 运行代码检查
lint:
	npm run lint

# 自动修复代码问题
lint:fix:
	npm run lint:fix

# 格式化代码
format:
	npm run format

# 检查代码格式
format:check:
	npm run format:check

# 快速发布 (跳过一些检查)
publish: build test lint
	npm publish

# 完整发布流程
release:
	node scripts/publish.js

# 补丁版本发布
release:patch:
	npm version patch && npm run build && npm publish

# 次要版本发布
release:minor:
	npm version minor && npm run build && npm publish

# 主要版本发布
release:major:
	npm version major && npm run build && npm publish

# 显示版本信息
version:
	@node -e "console.log('📦 Version:', require('./package.json').version)"
	@node -e "console.log('🏷️  Name:', require('./package.json').name)"
	@node -e "console.log('📝 Description:', require('./package.json').description)"

# 生成文档
docs:
	npx typedoc src/index.ts --out docs/

# 设置 Git hooks
setup-hooks:
	npx husky install
	npx husky add .husky/pre-commit "npm run lint"
	npx husky add .husky/pre-push "npm test"

# 检查项目状态
check: lint test format:check
	@echo "✅ 项目状态检查完成"

# 快速开发构建
dev: build
	@echo "🚀 开发构建完成"

# 生产构建
prod: clean lint test build
	@echo "🎯 生产构建完成"

# 创建新版本
version-bump:
	@read -p "输入新版本 (当前: $(shell node -e "console.log(require('./package.json').version)")): " version; \
	npm version $$version

# 检查依赖更新
check-deps:
	npm outdated

# 更新依赖
update-deps:
	npm update

# 安全检查
security-audit:
	npm audit

# 修复安全漏洞
security-fix:
	npm audit fix

# 清理并重新安装
reinstall: clean install
	@echo "🔄 重新安装完成"

# 构建并测试所有
all: clean install lint test build
	@echo "🎉 完整构建流程完成"