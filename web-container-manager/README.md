# Web Container Manager - 使用指南

## 概述

Web Container Manager 是一个完全本地化的网页容器管理技能，支持为任意网页创建、管理和维护DOM元素的容器映射关系。

## 核心特性

### ✅ 完全本地操作
- **容器存储**: 使用本地JSON文件存储容器数据
- **持久化**: 数据自动保存到本地文件
- **无外部依赖**: 除浏览器操作外，所有功能都在本地运行
- **任意页面支持**: 支持任何网站和页面URL

### ✅ 容器管理功能
- **创建容器**: 支持根容器和子容器创建
- **CRUD操作**: 完整的创建、读取、更新、删除功能
- **层次关系**: 维护容器间的父子关系
- **搜索过滤**: 支持按选择器、操作类型、页面URL搜索

### ✅ 交互式操作
- **命令行界面**: 通过交互式命令管理容器
- **选择模式**: 支持可视化选择页面元素
- **智能建议**: 自动建议父容器和操作类型

## 使用方法

### 1. 初始化技能

```python
from scripts.interaction_handler import InteractionHandler

# 创建交互处理器
handler = InteractionHandler()
```

### 2. 打开网页

```python
# 打开任意网页
result = handler.process_command('open_page', url='https://1688.com')
print(f"页面状态: {result['success']}")
```

### 3. 创建根容器

```python
# 创建根容器
result = handler.process_command(
    'create_container',
    selector='#main-content',
    page_url='https://1688.com',
    operation='monitor'
)

if result['success']:
    container_id = result['container_id']
    print(f"根容器ID: {container_id}")
```

### 4. 创建子容器

```python
# 在指定父容器下创建子容器
result = handler.process_command(
    'create_container',
    selector='.product-item',
    page_url='https://1688.com',
    operation='extract',
    parent_id=parent_container_id
)
```

### 5. 列出容器

```python
# 列出所有容器
result = handler.process_command('list_containers')
print(f"容器数量: {result['root_count']}")

# 列出特定容器的层次结构
result = handler.process_command('list_container_hierarchy', container_id=container_id)
```

### 6. 搜索容器

```python
# 按选择器搜索
result = handler.process_command('search_containers', query='main', search_type='selector')

# 按操作类型搜索
result = handler.process_command('search_containers', query='extract', search_type='operation')
```

### 7. 更新容器

```python
# 更新容器操作
result = handler.process_command(
    'update_container',
    container_id=container_id,
    updates={'operation': 'validate'}
)
```

### 8. 删除容器

```python
# 删除单个容器
result = handler.process_command('delete_container', container_id=container_id)

# 级联删除（包括子容器）
result = handler.process_command('delete_container', container_id=container_id, cascade=True)
```

## 支持的操作类型

1. **monitor** - 监控元素变化
2. **interact** - 与元素交互
3. **extract** - 提取数据
4. **validate** - 验证元素状态
5. **transform** - 转换元素
6. **observe** - 观察事件

## 本地存储

### 存储位置
- 默认文件: `containers.json`
- 可自定义存储路径

### 数据结构
```json
{
  "containers": {
    "container_id": {
      "container_id": "uuid",
      "selector": "css_selector",
      "page_url": "page_url",
      "operation": "operation_type",
      "parent_id": "parent_uuid_or_null",
      "children": ["child_uuids"],
      "metadata": {
        "created_at": "timestamp",
        "last_updated": "timestamp",
        "status": "active"
      }
    }
  },
  "root_containers": ["root_container_ids"],
  "last_updated": "timestamp"
}
```

## 交互式命令

### 基本命令
- `open_page <url>` - 打开网页
- `list_containers` - 列出所有容器
- `list_container_hierarchy <container_id>` - 列出容器层次
- `search_containers <query> <search_type>` - 搜索容器
- `create_container <selector> <page_url> <operation> [parent_id]` - 创建容器
- `update_container <container_id> <updates>` - 更新容器
- `delete_container <container_id> [cascade]` - 删除容器
- `validate_selector <selector>` - 验证选择器
- `get_container_info <container_id>` - 获取容器信息

### 选择模式命令
- `enter_selection_mode` - 进入选择模式
- `exit_selection_mode` - 退出选择模式
- `get_selected_element` - 获取当前选中元素

## 使用示例

### 1688.com 商品监控
```python
# 1. 打开1688网站
handler.process_command('open_page', url='https://1688.com')

# 2. 创建商品列表根容器
result = handler.process_command(
    'create_container',
    selector='.product-list',
    page_url='https://1688.com',
    operation='monitor'
)

if result['success']:
    root_id = result['container_id']
    
    # 3. 创建商品子容器
    handler.process_command(
        'create_container',
        selector='.product-item',
        page_url='https://1688.com',
        operation='extract',
        parent_id=root_id
    )
    
    # 4. 创建价格容器
    handler.process_command(
        'create_container',
        selector='.product-price',
        page_url='https://1688.com',
        operation='extract',
        parent_id=root_id
    )
```

### 通用网站操作
```python
# 支持任何网站
websites = [
    'https://taobao.com',
    'https://jd.com',
    'https://amazon.com',
    'https://ebay.com'
]

for site in websites:
    handler.process_command('open_page', url=site)
    # 根据实际页面结构创建相应的容器
```

## 注意事项

1. **本地存储**: 所有数据都存储在本地JSON文件中
2. **任意页面**: 技能不硬编码任何特定网站，支持任意URL
3. **持久化**: 容器数据会自动保存和加载
4. **层次关系**: 支持最多10层嵌套的容器层次
5. **选择器验证**: 内置CSS选择器语法检查
6. **容错处理**: 在MCP不可用时自动切换到备用模式

## 故障排除

### MCP不可用
如果Chrome DevTools MCP不可用，技能会自动切换到备用模式：
- 容器管理功能完全正常
- 浏览器操作使用模拟数据
- 选择器验证使用本地语法检查

### 存储文件问题
- 检查文件权限
- 确保目录存在
- JSON格式必须正确

## 技能架构

```
web-container-manager/
├── SKILL.md                    # 技能定义文档
├── containers.json             # 本地容器存储
├── scripts/
│   ├── browser_manager.py      # 浏览器操作管理
│   ├── container_manager.py    # 容器数据管理
│   ├── interaction_handler.py # 交互式命令处理
│   └── selection_mode.py     # 选择模式实现
├── references/
│   ├── container_schema.md     # 容器数据结构规范
│   └── operations_list.md     # 操作类型说明
└── assets/
    └── selection_styles.css    # 选择模式样式
```

该技能完全基于本地组件实现，支持任意网页的容器管理需求。
