# 视觉分析器工作流程详解

## 核心思路

**使用截图 + Vision AI 识别元素位置，再通过坐标查找对应的 DOM 元素**

这种方法完全避免了 HTML 过大的问题，因为：
1. 截图大小固定（通常 < 1MB Base64）
2. Vision AI 直接识别视觉元素，不需要分析 HTML
3. 通过坐标反查 DOM，精确定位

## 工作原理

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                 用户（命令行交互）                             │
│          "找到微博的 Feed 列表容器"                            │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ 1. 用户描述
               ▼
┌─────────────────────────────────────────────────────────────┐
│            VisualAnalyzer（视觉分析器）                       │
└──────────┬────────────────────────┬─────────────────────────┘
           │                        │
           │ 2. 截图请求             │ 3. 视觉分析请求
           ▼                        ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   Unified API        │  │   Vision AI Provider             │
│  (Browser Service)   │  │  (支持图片输入的 AI)               │
│                      │  │                                  │
│  - 截取页面          │  │  - 分析截图                       │
│  - 返回 Base64       │  │  - 识别目标元素                   │
└──────────────────────┘  │  - 返回边界框坐标                 │
           │              └──────────────────────────────────┘
           │ 4. 截图数据            │ 5. 边界框 [{x,y,w,h}]
           ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│           VisualAnalyzer（坐标转DOM）                        │
│  - 在浏览器中通过坐标查找元素                                  │
│  - document.elementFromPoint(x, y)                          │
│  - 生成CSS选择器                                             │
└─────────────────────────────────────────────────────────────┘
           │
           │ 6. 选择器列表
           ▼
┌─────────────────────────────────────────────────────────────┐
│          用户确认并保存                                       │
└─────────────────────────────────────────────────────────────┘
```

## 详细执行流程

### Phase 1: 截取页面截图

```typescript
// 用户选择视觉分析模式
选择分析模式 (1=HTML分析, 2=视觉分析): 2

// 系统截取页面
const screenshot = await visualAnalyzer.captureScreenshot('weibo_fresh');
```

**实际执行的浏览器脚本:**
```javascript
// 通过 Unified API 调用
{
  action: 'browser:screenshot',
  payload: {
    profile: 'weibo_fresh',
    fullPage: false,  // 只截取可见区域
    format: 'png'
  }
}

// 返回 Base64 编码的截图
{
  success: true,
  data: {
    base64: 'iVBORw0KGgoAAAANSUhEUgAA...'
  }
}
```

### Phase 2: Vision AI 分析

**发送给 Vision AI 的请求:**
```typescript
{
  model: 'gpt-4-vision-preview',
  messages: [
    {
      role: 'system',
      content: `你是一个专业的 Web UI 分析专家。
      
      请分析截图，找到符合描述的元素，返回边界框坐标。
      
      JSON 格式:
      {
        "boundingBoxes": [
          {
            "x": 100,
            "y": 200,
            "width": 800,
            "height": 400,
            "label": "Feed列表容器"
          }
        ]
      }`
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '目标描述：微博首页的 Feed 列表容器'
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
          }
        }
      ]
    }
  ]
}
```

**Vision AI 返回的响应:**
```json
{
  "boundingBoxes": [
    {
      "x": 420,
      "y": 80,
      "width": 800,
      "height": 900,
      "label": "微博Feed列表容器"
    },
    {
      "x": 430,
      "y": 100,
      "width": 780,
      "height": 180,
      "label": "第一个帖子"
    },
    {
      "x": 430,
      "y": 300,
      "width": 780,
      "height": 180,
      "label": "第二个帖子"
    }
  ]
}
```

### Phase 3: 在浏览器中高亮边界框

```typescript
await visualAnalyzer.highlightCoordinates(profile, boundingBoxes);
```

**浏览器中执行:**
```javascript
// 创建高亮框
boundingBoxes.forEach(box => {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed;
    left: ${box.x}px;
    top: ${box.y}px;
    width: ${box.width}px;
    height: ${box.height}px;
    border: 3px solid #FF6B35;
    background: rgba(255, 107, 53, 0.1);
    pointer-events: none;
    z-index: 999999;
  `;
  
  // 添加标签
  const label = document.createElement('div');
  label.textContent = box.label;
  label.style.cssText = `
    position: absolute;
    top: -24px;
    background: #FF6B35;
    color: white;
    padding: 2px 8px;
    font-size: 12px;
  `;
  div.appendChild(label);
  
  document.body.appendChild(div);
});
```

**浏览器中的效果:**
```
┌─────────────────────────────────────────┐
│  微博                                     │
│  ┌─────────────────────────────────┐    │
│  │ 🟧 微博Feed列表容器              │    │
│  │  ┌──────────────────────┐       │    │
│  │  │ 🟧 第一个帖子          │       │    │
│  │  └──────────────────────┘       │    │
│  │  ┌──────────────────────┐       │    │
│  │  │ 🟧 第二个帖子          │       │    │
│  │  └──────────────────────┘       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Phase 4: 通过坐标查找 DOM 元素

```typescript
// 对每个边界框，计算中心点坐标
const center = {
  x: box.x + box.width / 2,   // 420 + 400 = 820
  y: box.y + box.height / 2   // 80 + 450 = 530
};

// 在浏览器中通过坐标找元素
const elementInfo = await visualAnalyzer.findElementByCoordinates(
  profile,
  center.x,
  center.y
);
```

**浏览器中执行:**
```javascript
const element = document.elementFromPoint(820, 530);

// 生成选择器
function getSelector(el) {
  if (el.id) return '#' + el.id;
  
  let selector = el.tagName.toLowerCase();
  
  // 添加 class（使用属性选择器匹配动态class）
  if (el.className) {
    const classes = el.className.split(' ').filter(c => c);
    if (classes.length > 0) {
      // 去掉hash部分，只保留稳定的前缀
      const stableClass = classes[0].replace(/[_-][A-Z0-9]+$/, '');
      selector += `[class*="${stableClass}"]`;
    }
  }
  
  // 添加结构位置
  const siblings = Array.from(el.parentElement.children);
  const index = siblings.indexOf(el);
  if (siblings.length > 1) {
    selector += `:nth-child(${index + 1})`;
  }
  
  return selector;
}

return {
  selector: getSelector(element),
  tagName: element.tagName.toLowerCase(),
  className: element.className,
  id: element.id,
  textContent: element.textContent.substring(0, 100)
};
```

**返回结果:**
```json
{
  "selector": "main[class*=\"Main_wrap_\"] div[class*=\"Home_feed_\"]:nth-child(1)",
  "tagName": "div",
  "className": "Home_feed_5L3kP",
  "id": "",
  "textContent": "第一条微博内容..."
}
```

### Phase 5: 用户确认选择器

```
💡 识别了 3 个元素
💡 元素: div -> main[class*="Main_wrap_"] div[class*="Home_feed_"]:nth-child(1)
💡   文本: 第一条微博内容...

💡 识别的元素:
  1. main[class*="Main_wrap_"] div[class*="Home_feed_"]:nth-child(1) (位置: 420,80)
  2. article[class*="Feed_wrap_"]:nth-child(1) (位置: 430,100)
  3. article[class*="Feed_wrap_"]:nth-child(2) (位置: 430,300)

选择元素序号（默认 1）: 1

✅ 主容器选择器确定: main[class*="Main_wrap_"] div[class*="Home_feed_"]:nth-child(1)
```

## 优势对比

### 方法1: HTML分析
- ❌ HTML过大，超过AI上下文限制（通常200k tokens）
- ❌ 需要简化HTML，可能丢失关键信息
- ❌ 动态class名难以匹配
- ✅ 不需要Vision AI支持

### 方法2: 视觉分析（推荐）
- ✅ 截图大小固定（通常< 1MB）
- ✅ Vision AI直接识别视觉元素，准确率高
- ✅ 通过坐标精确定位DOM元素
- ✅ 自动处理动态class名
- ❌ 需要Vision AI支持（如GPT-4 Vision）

## 实际使用

```bash
# 启动交互式构建器
node scripts/build-container.mjs weibo_fresh https://weibo.com

# 选择分析模式
选择分析模式 (1=HTML分析, 2=视觉分析): 2

# 输入描述
容器描述: 微博首页的Feed列表容器

# AI自动分析并高亮
💡 正在截取页面截图...
💡 截图大小: 245678 字符
💡 正在使用 Vision AI 分析...
💡 识别了 3 个元素

# 选择元素
选择元素序号（默认 1）: 1

# 完成
✅ 主容器选择器确定: main[class*="Main_wrap_"] div[class*="Home_feed_"]
```

## 技术要求

1. **Vision AI 支持**
   - 模型需支持图片输入（如 GPT-4 Vision）
   - API 需兼容 OpenAI Vision格式

2. **浏览器截图能力**
   - Unified API 提供 `browser:screenshot` action
   - 返回 Base64 编码的 PNG 图片

3. **坐标查询能力**
   - 使用 `document.elementFromPoint(x, y)`
   - 浏览器环境执行

## 总结

视觉分析方法是解决大型HTML分析问题的最佳方案：
- ✅ 完全避免HTML大小限制
- ✅ 准确率更高（基于视觉识别）
- ✅ 用户体验更好（实时高亮）
- ✅ 自动处理动态class名

**核心价值**: 将"分析HTML"转变为"看图识元素"，更符合人类的认知方式。
