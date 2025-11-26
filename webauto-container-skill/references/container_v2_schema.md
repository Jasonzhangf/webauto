# ContainerDefV2 Schema 参考

## 核心字段

### 必需字段
- `id` (string): 容器唯一标识符
- `selectors` (array): 选择器数组，至少包含一个元素

### 可选字段
- `name` (string): 容器名称
- `type` (string): 容器类型
- `scope` (string): 容器作用域
- `pagePatterns` (array): 页面匹配模式
- `children` (array): 子容器ID列表
- `dependsOn` (array): 依赖的容器ID
- `capabilities` (array): 容器能力列表
- `runMode` (enum): 运行模式，可选值: "sequential", "parallel"
- `operations` (array): 操作配置数组
- `pagination` (object): 分页配置
- `version` (string): 容器版本
- `replacedBy` (string): 替换此容器的容器ID
- `reliability` (number): 可靠性评分 (0-1)

## 选择器结构 (SelectorByClass)

```json
{
  "classes": ["class1", "class2"],
  "variant": "primary",
  "score": 1.0
}
```

### 字段说明
- `classes`: CSS类名数组
- `variant`: 选择器变体，可选值: "primary", "backup"
- `score`: 选择器置信度 (0-1)

## 操作配置 (OperationConfig)

```json
{
  "type": "click",
  "config": {
    "scroll_to_view": true,
    "wait_before": 0.1,
    "wait_after": 0.3
  }
}
```

### 支持的操作类型
- `find-child`: 查找子元素
- `click`: 点击元素
- `type`: 输入文本
- `scroll`: 滚动元素
- `waitFor`: 等待条件
- `highlight`: 高亮显示
- `custom`: 自定义操作

### 操作类型配置说明

#### click 操作
```json
{
  "type": "click",
  "config": {
    "scroll_to_view": true,        // 滚动到元素可见
    "wait_before": 0.1,         // 点击前等待时间（秒）
    "wait_after": 0.2           // 点击后等待时间（秒）
  }
}
```

#### type 操作
```json
{
  "type": "type",
  "config": {
    "text": "输入的文本",
    "clear_first": false,          // 先清空输入框
    "human_typing": true          // 模拟人类打字
  }
}
```

#### scroll 操作
```json
{
  "type": "scroll",
  "config": {
    "direction": "down",          // 滚动方向: up, down, left, right
    "distance": 300              // 滚动距离（像素）
  }
}
```

#### highlight 操作
```json
{
  "type": "highlight",
  "config": {
    "style": "2px solid #ff0000",  // 高亮样式
    "duration": 3000               // 高亮持续时间（毫秒）
  }
}
```

## 分页配置 (PaginationConfig)

```json
{
  "mode": "scroll",
  "targetSelector": {
    "classes": ["load-more"],
    "variant": "primary",
    "score": 1.0
  },
  "maxSteps": 10,
  "delayMs": 1000
}
```

### 分页模式
- `scroll`: 滚动加载更多
- `click`: 点击加载更多

## 容器能力 (Capabilities)

常见的容器能力：
- `click`: 可点击
- `input`: 可输入
- `scroll`: 可滚动
- `find-child`: 包含子元素
- `highlight`: 可高亮显示
- `navigate`: 可导航
- `extract`: 可提取数据

## 运行模式 (RunMode)

- `sequential`: 顺序执行（默认）
- `parallel`: 并行执行子容器

## 使用示例

### 基础容器
```json
{
  "id": "login_button",
  "name": "登录按钮",
  "type": "button",
  "selectors": [
    {
      "classes": ["btn", "btn-primary", "login"],
      "variant": "primary",
      "score": 1.0
    }
  ],
  "operations": [
    {
      "type": "click",
      "config": {
        "scroll_to_view": true,
        "wait_before": 0.2
      }
    }
  ]
}
```

### 输入容器
```json
{
  "id": "username_input",
  "name": "用户名输入框",
  "type": "input",
  "capabilities": ["input", "highlight"],
  "selectors": [
    {
      "classes": ["form-control", "username"],
      "variant": "primary",
      "score": 1.0
    }
  ],
  "operations": [
    {
      "type": "highlight",
      "config": {
        "duration": 2000
      }
    },
    {
      "type": "type",
      "config": {
        "clear_first": true,
        "human_typing": true
      }
    }
  ]
}
```

### 容器层级
```json
{
  "id": "login_form",
  "name": "登录表单",
  "type": "form",
  "children": ["username_input", "password_input", "login_button"],
  "operations": [
    {
      "type": "find-child",
      "config": {
        "container_id": "username_input"
      }
    },
    {
      "type": "find-child",
      "config": {
        "container_id": "password_input"
      }
    }
  ]
}
```