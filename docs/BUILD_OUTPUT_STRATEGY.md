# 构建产物统一策略

> 最后更新：2026-01-31

## 目标

**运行态只允许从根 `dist/` 加载编译产物**，禁止直接引用源码或子目录 `dist/`。

## 当前状态

### 编译配置

- **主配置**: `tsconfig.services.json`
- **构建脚本**: `npm run build:services`（对应 `scripts/build/run-services-build.mjs`）
- **产物路径**: `dist/`

### 产物结构

```
dist/
├── services/          # services/ 编译产物
│   ├── unified-api/
│   ├── browser-service/
│   └── engines/
├── modules/           # modules/ 编译产物
│   ├── config/
│   ├── workflow/
│   └── ...
├── libs/              # libs/ 编译产物
│   └── operations-framework/
└── sharedmodule/      # sharedmodule/ 编译产物（legacy）
```

### 当前问题

**子目录独立 `dist/`**（违反规则）：
- `libs/browser/dist/` - 存在独立编译产物
- `libs/operations-framework/dist/` - 存在独立编译产物
- `modules/workflow-builder/dist/` - 存在独立编译产物

**风险**：
- 运行时可能引用子目录 `dist/` 而非根 `dist/`
- 构建不一致：子目录可能使用独立的 `tsconfig.json`
- 难以统一管理编译产物版本

## 规则

### 1. 运行时只从根 dist/ 加载

**正确**：
```typescript
// ✅ 从根 dist/ 加载
import { EventBus } from '../../../dist/libs/operations-framework/src/event-driven/EventBus.js';
```

**错误**：
```typescript
// ❌ 从子目录 dist/ 加载
import { EventBus } from '../../../libs/operations-framework/dist/src/event-driven/EventBus.js';

// ❌ 直接加载源码
import { EventBus } from '../../../libs/operations-framework/src/event-driven/EventBus.ts';
```

### 2. 禁止子目录独立编译

**禁止在子目录运行**：
- `npx tsc -p libs/browser/tsconfig.json`
- `npx tsc -p libs/operations-framework/tsconfig.json`

**唯一编译入口**：
- `npm run build:services`（编译所有服务和模块到根 `dist/`）

### 3. 子目录 package.json 不包含独立构建脚本

**允许**：
```json
{
  "name": "@webauto/operations-framework",
  "version": "1.0.0",
  "type": "module"
}
```

**禁止**：
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json"  // ❌ 禁止独立构建
  }
}
```

## 迁移计划

### 阶段1: 审查子目录 dist/

**任务**：检查 `libs/browser/dist`、`libs/operations-framework/dist`、`modules/workflow-builder/dist` 是否被运行时引用

**方法**：
```bash
# 检查是否有引用子目录 dist/
rg "libs/browser/dist" -g '*.{ts,js,mts,mjs}'
rg "libs/operations-framework/dist" -g '*.{ts,js,mts,mjs}'
rg "modules/workflow-builder/dist" -g '*.{ts,js,mts,mjs}'
```

**决策**：
- 若有引用：修改为引用根 `dist/` 路径
- 若无引用：可安全删除子目录 `dist/`

### 阶段2: 统一编译配置

**任务**：确保所有子模块通过根 `tsconfig.services.json` 编译

**检查**：
- `libs/browser/tsconfig.json` - 检查是否独立配置
- `libs/operations-framework/tsconfig.json` - 检查是否独立配置
- `modules/workflow-builder/tsconfig.json` - 检查是否独立配置

**统一**：
- 删除或标记为 legacy
- 所有编译通过根 `tsconfig.services.json`

### 阶段3: 清理子目录 dist/

**任务**：删除所有子目录 `dist/`

```bash
rm -rf libs/browser/dist
rm -rf libs/operations-framework/dist
rm -rf modules/workflow-builder/dist
```

**验证**：
- `npm run build:services` 成功
- `npm test` 通过
- 主要启动命令仍可用（`npm run service:browser:start`、`npm start` 等）

### 阶段4: 增加自检

**任务**：防止未来再次创建子目录 `dist/`

**自检脚本**：`scripts/check-sub-dist.mjs`

```javascript
#!/usr/bin/env node
// 检查子目录是否存在 dist/
import { existsSync } from 'fs';

const SUB_DIRS = [
  'libs/browser/dist',
  'libs/operations-framework/dist',
  'modules/workflow-builder/dist'
];

let hasSubDist = false;
for (const dir of SUB_DIRS) {
  if (existsSync(dir)) {
    console.error(`❌ 发现子目录 dist/: ${dir}`);
    hasSubDist = true;
  }
}

if (hasSubDist) {
  console.error('\n🚫 禁止子目录独立 dist/，请使用根 dist/');
  process.exit(1);
}

console.log('✅ 未发现子目录 dist/');
```

**接入点**：
- `prebuild`
- CI

## 验收标准

- [ ] 子目录 `dist/` 已全部删除
- [ ] 所有运行时引用指向根 `dist/`
- [ ] `npm run build:services` 后主要命令仍可用
- [ ] 自检脚本已接入 `prebuild` 和 CI

---

**最后更新**: 2026-01-31  
**维护者**: WebAuto Team
