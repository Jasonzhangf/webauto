# WebAuto 参数传递唯一真源协议

**版本**: v2026-03-14  
**状态**: 设计中  
**Epic**: webauto-9988

---

## 1. 问题定义

当前参数传递存在以下问题：

1. **参数漂移**: `--do-likes true` 和 `--like-keywords "整理"` 在 WebAuto 层设置，但到 Runtime 层丢失
2. **多源推导**: `doLikes` / `likeKeywords` 在多处计算，没有唯一真源
3. **不可追溯**: 运行时无法验证参数是否正确传递
4. **无统一 Schema**: 参数定义分散，无标准约束

---

## 2. 唯一真源层级

```
CLI argv / UI input
   ↓ (parse + normalize)
WebAuto UnifiedOptions  ← 【唯一真源】
   ↓ (pass-through, no recompute)
Camo Runtime Options
   ↓ (autoscript normalize)
Autoscript Operations
```

### 核心原则

1. **WebAuto UnifiedOptions 是唯一真源**
   - 所有参数的计算、默认值应用、意图推导都在此完成
   - Runtime 和 Autoscript **只传递，不推导**

2. **零漂移传递**
   - 每层只能读取上游参数，不能修改或重新计算
   - 禁止在 Runtime 层推导 `doLikes` / `stageLikeEnabled`

3. **可验证**
   - 运行时落盘 `options.json` 到 `~/.webauto/download/.../profiles/`
   - 与 CLI argv 对照一致

---

## 3. 标准 Schema 定义

### 3.1 Schema 结构

所有参数定义使用 **Zod Schema**（或 JSON Schema），包含：

```typescript
{
  fieldName: z({
    type: z.enum(['boolean', 'string', 'number', 'array']),
    default: any,
    description: string,
    scope: z.enum(['cli', 'runtime', 'autoscript']),
    source: z.enum(['argv', 'computed', 'derived']),
  })
}
```

### 3.2 字段唯一真源表

| 字段 | 标准来源 | 允许修改层 | 禁止操作 |
|------|-----------|-----------|---------|
| `doLikes` | WebAuto UnifiedOptions | ❌ Runtime 不可重算 | 禁止在 Runtime 推导 |
| `doComments` | WebAuto UnifiedOptions | ❌ Runtime 不可重算 | 禁止在 Runtime 推导 |
| `likeKeywords` | WebAuto UnifiedOptions | ❌ Runtime 不可推导 | 禁止用 keyword 替代 |
| `stageLikeEnabled` | WebAuto UnifiedOptions | ❌ Runtime 不可重算 | 禁止重新计算 |
| `maxNotes` | WebAuto | ❌ Runtime 不可改 | 禁止覆盖 |
| `sharedHarvestPath` | WebAuto | ✅ Runtime 仅读取 | 只读 |
| `resume` | WebAuto | ❌ Runtime 不可改 | 禁止重新推导 |

---

## 4. 参数传递协议

### 4.1 WebAuto 层（唯一真源）

**文件**: `apps/webauto/entry/lib/xhs-unified-options.mjs`

**职责**:
1. 解析 CLI argv
2. 应用默认值
3. 计算意图（如 `stageLikeEnabled`）
4. 输出完整的 `UnifiedOptions`

**输出示例**:
```json
{
  "doLikes": true,
  "likeKeywords": ["整理"],
  "stageLikeEnabled": true,
  "maxNotes": 50,
  "resume": true
}
```

### 4.2 Runtime 层（只传递）

**文件**: `modules/camo-runtime/src/autoscript/xhs-unified-options.mjs`

**职责**:
1. 接收 `UnifiedOptions`
2. 归一化字段（如 `toBoolean`, `toTrimmedString`）
3. **禁止**: 重新计算 `doLikes` / `stageLikeEnabled`

**修改前**（错误）:
```javascript
const doLikes = toBoolean(rawOptions.doLikes, false);
const likeKeywords = likeKeywordsSeed.length > 0 ? likeKeywordsSeed : matchKeywords; // ❌ 推导
```

**修改后**（正确）:
```javascript
const doLikes = toBoolean(rawOptions.doLikes, false);
const likeKeywords = toTrimmedString(rawOptions.likeKeywords, '');
```

### 4.3 Autoscript 层（只使用）

**文件**: `modules/camo-runtime/src/autoscript/xhs-autoscript-base.mjs`

**职责**:
1. 接收 Runtime Options
2. 生成 Autoscript Operations
3. **禁止**: 合并 `overrides` 时���盖 `rawOptions`

**修改前**（错误）:
```javascript
const options = resolveXhsUnifiedOptions(rawOptions); // ❌ 丢失 overrides
```

**修改后**（正确）:
```javascript
const options = resolveXhsUnifiedOptions({ ...rawOptions, ...overrides }); // ✅ 合并
```

---

## 5. 校验与断言（防漂移）

### 5.1 运行时落盘

**路径**: `~/.webauto/download/xiaohongshu/<env>/<keyword>/merged/run-<timestamp>/profiles/options.json`

**内容**:
```json
{
  "cliArgv": {
    "doLikes": true,
    "likeKeywords": "整理"
  },
  "unifiedOptions": {
    "doLikes": true,
    "likeKeywords": ["整理"],
    "stageLikeEnabled": true
  },
  "runtimeOptions": {
    "doLikes": true,
    "likeKeywords": ["整理"]
  },
  "autoscriptParams": {
    "doLikes": true,
    "likeKeywords": ["整理"]
  }
}
```

### 5.2 断言规则

1. **CLI argv == UnifiedOptions.input**
2. **UnifiedOptions.doLikes == RuntimeOptions.doLikes**
3. **RuntimeOptions.doLikes == AutoscriptParams.doLikes**

**失败时**: 直接 fail，不允许继续执行

---

## 6. 单元测试覆盖

### 6.1 测试链路

```typescript
describe('Parameter Passing', () => {
  test('argv → UnifiedOptions', () => {
    const argv = {
      'do-likes': true,
      'like-keywords': '整理'
    };
    const options = buildUnifiedOptions(argv);
    expect(options.doLikes).toBe(true);
    expect(options.likeKeywords).toEqual(['整理']);
  });

  test('UnifiedOptions → RuntimeOptions', () => {
    const unified = {
      doLikes: true,
      likeKeywords: ['整理']
    };
    const runtime = resolveXhsUnifiedOptions(unified);
    expect(runtime.doLikes).toBe(true);
    expect(runtime.likeKeywords).toEqual(['整理']);
  });

  test('RuntimeOptions → AutoscriptParams', () => {
    const runtime = {
      doLikes: true,
      likeKeywords: ['整理']
    };
    const script = buildXhsUnifiedAutoscript(runtime);
    const commentsOp = script.operations.find(op => op.id === 'comments_harvest');
    expect(commentsOp.params.doLikes).toBe(true);
    expect(commentsOp.params.likeKeywords).toEqual(['整理']);
  });
});
```

### 6.2 回归测试

- `npm test -- tests/unit/webauto/xhs-parameter-passing.test.mjs`

---

## 7. 实施计划

### Phase 1: 设计文档 ✅
- [x] 创建 `docs/arch/webauto-parameter-passing-protocol.md`
- [x] 定义唯一真源层级
- [x] 定义字段唯一真源表
- [x] 定义校验与断言规则

### Phase 2: Schema 定义
- [ ] 创建 Zod Schema 定义所有参数字段
- [ ] 建立 Schema 校验工具
- [ ] 集成到 `buildUnifiedOptions`

### Phase 3: 修复参数传递
- [x] 修复 `buildXhsAutoscriptBase` 参数传递
- [ ] 修复 `resolveXhsUnifiedOptions` 推导逻辑
- [ ] 移除 Runtime 层的参数推导

### Phase 4: 单元测试
- [ ] 建立 `xhs-parameter-passing.test.mjs`
- [ ] 覆盖 argv → UnifiedOptions → Runtime → Autoscript
- [ ] 覆盖 `doLikes` / `likeKeywords` 关键字段

### Phase 5: 运行时验证
- [ ] 落盘 `options.json`
- [ ] 建立断言规则
- [ ] 集成到 CI/CD

---

## 8. 验收标准

1. ✅ 参数传递标准协议文档落盘
2. ✅ Zod Schema 定义所有参数字段
3. ✅ 修复 `buildXhsAutoscriptBase` 参数传递
4. ✅ 单元测试覆盖全链路
5. ✅ 运行时落盘 `options.json`
6. ✅ 回归测试通过
7. ✅ 新的 50 条测试点赞功能正常

---

## 9. 参考文档

- `apps/webauto/entry/lib/xhs-unified-options.mjs`
- `modules/camo-runtime/src/autoscript/xhs-unified-options.mjs`
- `modules/camo-runtime/src/autoscript/xhs-autoscript-base.mjs`
- `AGENTS.md` - 参数传递规则

---

## 10. 版本历史

- **v2026-03-14**: 初始版本，定义唯一真源协议
