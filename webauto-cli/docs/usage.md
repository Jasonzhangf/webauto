# WebAuto CLI 使用指南

## 安装

```bash
npm install -g webauto-cli
```

## 管理态 (Web界面)

1. 启动管理态界面:
   ```bash
   webauto-ui
   ```

2. 在浏览器中打开 `http://localhost:3000`

3. 使用界面配置流水线和规则

## 运行态 (CLI)

### 执行流水线

```bash
webauto run-pipeline <pipeline-name>
```

### 应用规则到网页

```bash
webauto apply-rules <url>
```

## 组件说明

### 规则编辑器
- 定义网页操作规则
- 支持点击、输入、提取等动作
- 基于CSS选择器定位元素

### 流水线配置
- 创建和管理自动化流水线
- 配置步骤和目标网页
- 管理步骤间的依赖关系

### Cookie管理
- 管理网站登录状态
- 自动保存和加载Cookie
- 支持多个网站的Cookie

## 开发指南

### 项目结构
```
webauto-cli/
├── src/
│   ├── components/     # 管理态UI组件
│   ├── __tests__/      # 测试用例
│   ├── cli.js          # 运行态CLI接口
│   ├── pipeline.js     # 流水线执行器
│   ├── step.js         # 步骤定义
│   ├── browser.js      # 浏览器自动化
│   ├── cookieManager.js # Cookie管理
│   ├── ruleEngine.js   # 规则引擎
│   ├── ruleApplier.js  # 规则应用
│   ├── aiExtractor.js  # AI目标提取
│   ├── logger.js       # 日志系统
│   └── debugger.js     # 调试工具
├── docs/
│   ├── architecture.md # 架构设计
│   ├── ui-components.md # UI组件结构
│   └── usage.md        # 使用指南
└── package.json
```

### 扩展功能
1. 添加新的规则动作类型
2. 集成更多AI服务
3. 支持更多浏览器自动化工具
4. 添加数据导出功能