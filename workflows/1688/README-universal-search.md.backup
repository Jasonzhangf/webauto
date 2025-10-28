# 1688通用搜索工作流模板

## 🎯 功能概述

这是一个通用的1688搜索工作流模板，支持：
- 任意商品关键词搜索
- 自定义搜索结果数量
- 可选择是否打开第一条链接
- 支持多种搜索类别（供应、公司、产品）
- 完整的会话管理和结果保存

## 🚀 快速开始

### 基础用法

```bash
# 搜索钢化膜（默认20条结果，打开第一条链接）
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-1688-universal-search.js 钢化膜

# 搜索手机（自定义10条结果）
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-1688-universal-search.js 手机 --max-results=10

# 搜索服装但不打开第一条链接
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-1688-universal-search.js 服装 --no-open-first

# 启用调试模式
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-1688-universal-search.js 钢化膜 --debug
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<搜索关键词>` | 必需，要搜索的商品关键词 | - |
| `--max-results=<数量>` | 最大搜索结果数量 | 20 |
| `--no-open-first` | 不打开第一条链接 | false（会打开） |
| `--category=<类型>` | 搜索类别：selloffer/company/product | selloffer |
| `--debug` | 启用详细调试日志 | false |

### 搜索类别说明

- `selloffer`: 供应信息（默认）
- `company`: 公司信息
- `product`: 产品信息

## 📋 工作流程

1. **登录验证** - 通过预流确保1688登录状态
2. **参数处理** - 将关键词转换为GBK编码
3. **搜索执行** - 导航到1688搜索结果页
4. **结果提取** - 提取商家信息和链接
5. **条件处理** - 根据配置决定是否打开第一条链接
6. **结果保存** - 保存完整的搜索结果到文件

## 📊 输出结果

### 搜索结果数据结构

```json
{
  "merchants": [
    {
      "index": 0,
      "title": "商品标题",
      "merchantName": "商家名称",
      "price": "价格信息",
      "merchantLink": "商家链接",
      "merchantId": "商家ID",
      "contactLink": "联系方式链接",
      "image": "商品图片链接"
    }
  ],
  "totalFound": 100,
  "paginationInfo": {
    "hasPagination": true,
    "currentPage": "1",
    "hasNextPage": true
  }
}
```

### 结果文件位置

结果保存在：`workflows/records/1688-universal-search-{关键词}-{时间戳}.json`

## 🔧 高级配置

### 直接使用工作流模板

如果你想自定义更复杂的参数，可以直接使用模板：

```bash
# 手动生成参数化工作流并执行
node -e "
import UniversalSearchExecutor from './scripts/run-1688-universal-search.js';
const executor = new UniversalSearchExecutor();
const workflow = executor.generateParameterizedWorkflow({
  keyword: '钢化膜',
  maxResults: 15,
  openFirstLink: true,
  searchCategory: 'selloffer'
});
console.log(JSON.stringify(workflow, null, 2));
"
```

### GBK编码支持

模板内置了常用中文词汇的GBK编码映射：

- 钢化膜 → `%B8%DC%BB%AF%C4%AB`
- 服装 → `%B7%FE%D7%B0`
- 手机 → `%CA%D6%BB%FA`
- 电脑 → `%B5%E7%C4%D4`

如果需要其他词汇，可以扩展模板中的GBK编码映射表。

## 🛠️ 故障排除

### 常见问题

1. **登录失败**
   - 确保Camoufox路径正确
   - 检查Cookie文件是否存在：`~/.webauto/cookies/1688-domestic.json`
   - 重新运行登录预流

2. **搜索结果为空**
   - 检查关键词GBK编码是否正确
   - 尝试使用更通用的关键词
   - 检查网络连接

3. **无法打开商家页面**
   - 检查商家链接是否有效
   - 确认没有访问限制
   - 尝试手动访问该链接

### 调试模式

使用 `--debug` 参数可以查看详细的执行过程：

```bash
CAMOUFOX_PATH="/path/to/camoufox" node scripts/run-1688-universal-search.js 钢化膜 --debug
```

调试信息包括：
- 参数配置详情
- 搜索URL构建过程
- 页面加载状态
- 元素提取过程
- 错误详细信息

## 📈 性能优化建议

1. **结果数量控制** - 根据需要设置合理的 `maxResults` 值
2. **链接选择** - 如果只需要数据，使用 `--no-open-first` 跳过页面打开
3. **分类搜索** - 使用合适的搜索类别提高精度
4. **批量处理** - 对于大量搜索，考虑分批执行

## 🔄 扩展功能

### 自定义处理逻辑

可以通过修改模板中的 `extract_results` 节点来自定义数据提取逻辑：

```javascript
// 在模板的 script 中添加自定义提取逻辑
const customExtraction = {
  // 提取更多字段
  location: item.querySelector('[class*=location]')?.textContent.trim(),
  rating: item.querySelector('[class*=rating]')?.textContent.trim(),
  // 添加自定义过滤条件
  isValid: merchantLink && merchantLink.includes('1688.com')
};
```

### 批量搜索脚本

创建批量搜索脚本：

```javascript
// batch-search.js
import UniversalSearchExecutor from './scripts/run-1688-universal-search.js';

const keywords = ['钢化膜', '手机壳', '数据线', '充电器'];
const executor = new UniversalSearchExecutor();

for (const keyword of keywords) {
  console.log(`\n🔍 搜索: ${keyword}`);
  await executor.executeSearch({ keyword, maxResults: 10 });
  // 添加延迟避免频率限制
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

## 📝 更新日志

### v1.0.0
- ✅ 支持任意关键词搜索
- ✅ 参数化配置系统
- ✅ GBK编码自动转换
- ✅ 条件性页面打开
- ✅ 完整的结果保存
- ✅ 命令行友好接口

## 🤝 贡献指南

1. 新增功能请先测试
2. 保持向后兼容性
3. 更新文档说明
4. 遵循代码规范

---

**最后更新**: 2025-10-17
**维护者**: WebAuto Team