# SelectorByClass 最佳实践

## 选择器设计原则

### 1. 基于CSS类名优先
ContainerDefV2架构专门基于CSS类名进行元素匹配，而不是XPath或其他选择器类型。

**推荐做法:**
```json
{
  "selectors": [
    {
      "classes": ["login", "btn", "primary"],
      "variant": "primary",
      "score": 1.0
    }
  ]
}
```

**避免做法:**
```json
{
  "selectors": [
    {
      "xpath": "//div[@class='login']",
      "variant": "primary"
    }
  ]
}
```

### 2. 语义化CSS类名
使用描述性强的类名，避免使用纯数字或无意义的缩写。

**推荐做法:**
```json
{
  "classes": ["user-login", "submit-button", "primary-action"]
}
```

**避免做法:**
```json
{
  "classes": ["a1", "btn2", "style-123"]
}
```

### 3. 层级化选择器
设计有层级关系的CSS类名，便于建立容器层级。

**推荐做法:**
```json
{
  "selectors": [
    {
      "classes": ["main", "navigation", "search", "container"],
      "variant": "primary"
    }
  ]
}
```

## 选择器稳定性

### 1. 稳定性评分标准
- **1.0**: 最稳定 - ID选择器或唯一性类名组合
- **0.8-0.9**: 较稳定 - 具有语义化的类名组合
- **0.6-0.7**: 一般稳定 - 通用类名组合
- **0.5以下**: 不稳定 - 动态生成的类名

### 2. 避免动态类名
避免使用时间戳、随机数或其他动态生成的类名。

**避免做法:**
```json
{
  "classes": ["component-164123456", "style-abc-xyz", "temp-789"]
}
```

### 3. 使用结构性类名
优先使用结构相关的类名，而不是样式相关的类名。

**推荐做法:**
```json
{
  "classes": ["card", "header", "content", "footer"]
}
```

**避免做法:**
```json
{
  "classes": ["text-red", "bg-blue", "font-bold"]
}
```

## 多选择器策略

### 1. 主备选择器配置
为每个容器提供主选择器和备份选择器，提高匹配成功率。

```json
{
  "selectors": [
    {
      "classes": ["login", "button", "primary"],
      "variant": "primary",
      "score": 1.0
    },
    {
      "classes": ["btn", "btn-login", "btn-primary"],
      "variant": "backup",
      "score": 0.8
    }
  ]
}
```

### 2. 选择器变体使用
- `primary`: 主要选择器，具有最高置信度
- `backup`: 备份选择器，当主选择器失败时使用

## 特定场景选择器

### 1. 表单元素
```json
{
  "selectors": [
    {
      "classes": ["form-control", "input", "text"],
      "variant": "primary"
    }
  ]
}
```

### 2. 按钮元素
```json
{
  "selectors": [
    {
      "classes": ["btn", "button", "action"],
      "variant": "primary"
    }
  ]
}
```

### 3. 导航元素
```json
{
  "selectors": [
    {
      "classes": ["nav", "navigation", "menu"],
      "variant": "primary"
    }
  ]
}
```

### 4. 卡片/容器元素
```json
{
  "selectors": [
    {
      "classes": ["card", "container", "wrapper"],
      "variant": "primary"
    }
  ]
}
```

## 框架特定选择器

### 1. Bootstrap
```json
{
  "selectors": [
    {
      "classes": ["btn", "btn-primary"],
      "variant": "primary"
    }
  ]
}
```

### 2. Material Design
```json
{
  "selectors": [
    {
      "classes": ["mdc-button", "raised"],
      "variant": "primary"
    }
  ]
}
```

### 3. Tailwind CSS
```json
{
  "selectors": [
    {
      "classes": ["bg-blue-500", "text-white", "px-4", "py-2"],
      "variant": "primary"
    }
  ]
}
```

## 测试和验证

### 1. 选择器测试
```python
# 测试选择器匹配
def test_selector_match(element_classes, selector_classes):
    """测试选择器是否匹配元素"""
    element_set = set(element_classes)
    selector_set = set(selector_classes)
    return selector_set.issubset(element_set)

# 验证选择器稳定性
def validate_selector_stability(selector_classes):
    """验证选择器稳定性"""
    # 检查是否包含动态模式
    dynamic_patterns = [r'\d+', r'random', r'\w+']
    for pattern in dynamic_patterns:
        for class_name in selector_classes:
            if pattern.search(class_name):
                return False
    return True
```

### 2. 选择器性能
- 避免过长的类名数组（建议不超过5个类）
- 避免过于复杂的CSS类组合
- 优先使用高频出现的类名

## 常见错误和解决方案

### 错误1: 使用XPath
```json
// 错误
{
  "selectors": [{"xpath": "//div[@class='login']"}]
}

// 正确
{
  "selectors": [{"classes": ["login"]}]
}
```

### 错误2: 缺少必需的类名
```json
// 错误
{
  "selectors": []
}

// 正确
{
  "selectors": [{"classes": ["btn", "primary"]}]
}
```

### 错误3: 使用不稳定的选择器
```json
// 错误
{
  "selectors": [{"classes": ["component-12345", "style-temp"]}]
}

// 正确
{
  "selectors": [{"classes": ["submit-button", "form-control"]}]
}
```

## 最佳实践总结

1. **始终基于CSS类名** - 使用SelectorByClass格式
2. **优先语义化命名** - 使用描述性的类名
3. **建立选择器层级** - 设计有意义的类名层次
4. **配置主备选择器** - 提高匹配稳定性
5. **避免动态类名** - 使用稳定的结构类名
6. **定期测试验证** - 确保选择器有效性
7. **考虑框架差异** - 适配不同CSS框架的模式