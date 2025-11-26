# 1688 批量聊天工作流 - 容器库说明

## 工作流程概述

完整的 1688 批量聊天工作流包含以下步骤：
1. **搜索产品** → 填写搜索框，点击搜索
2. **去重过滤** → 检查是否已联系过该卖家
3. **打开聊天** → 点击旺旺链接
4. **关闭弹窗** → 自动关闭可能出现的引导/促销弹窗
5. **发送消息** → 输入并发送"你好"
6. **关闭标签** → 关闭聊天窗口
7. **标记已发送** → 标记卖家为已联系

## 容器库结构

### 1. 主页容器（Home Page）
| 容器 ID | 选择器 | 操作 | 说明 |
|---------|--------|------|------|
| `home.search.searchbox` | `#alisearch-input` | fill/type | 搜索输入框 |
| `home.search.searchbutton` | `.input-button` | click | 搜索按钮 |

### 2. 搜索结果容器（Search Results）
| 容器 ID | 选择器 | 操作 | 说明 |
|---------|--------|------|------|
| `search.root` | `.search-ui2024` | - | 搜索页根容器 |
| `search.listContainer` | `.space-common-offerlist` | - | 结果列表容器 |
| `search.item` | `.search-offer-item` | - | 单个结果卡片 |
| `search.item.wangwangLink` | `a.ww-link` | click | 旺旺聊天链接 |
| `search.item.shopId` | `[data-shop-id]` | - | 店铺 ID（用于去重） |
| `search.item.sentMarker` | `[data-sent='true']` | - | 已发送标记 |

### 3. 聊天页容器（Chat Page）
| 容器 ID | 选择器 | 操作 | 说明 |
|---------|--------|------|------|
| `chat.root` | `.ww` | - | 聊天页根容器 |
| `chat.inputBox` | `.editBox [contenteditable=true]` | fill/type | 消息输入框 |
| `chat.sendButton` | `.send-btn` | click | 发送按钮 |
| `chat.messageHistory` | `.message-list` | - | 历史消息容器 |
| `chat.messageItem` | `.message-item` | - | 单条消息 |
| `chat.closeTab` | `button[aria-label*='关闭']` | click | 关闭标签按钮 |

### 4. 弹窗容器（Popups）
| 容器 ID | 选择器 | 操作 | 说明 |
|---------|--------|------|------|
| `popup.close` | `.popup-close, [class*='dialog-close']` | click | 通用关闭按钮 |
| `popup.guide` | `.guide-popup` | - | 新手引导弹窗 |
| `popup.promotion` | `.promotion-popup` | - | 促销活动弹窗 |
| `popup.feedback` | `.feedback-dialog` | - | 反馈弹窗 |

## 完整工作流定义

容器库中已添加 `workflow.search_to_chat` 容器，包含完整的工作流步骤：

```json
{
  "workflow": {
    "steps": [
      {"action": "fill", "container": "home.search.searchbox", "value": "{{search_keyword}}"},
      {"action": "click", "container": "home.search.searchbutton"},
      {"action": "wait", "selector": "search.listContainer", "timeout": 5000},
      {"action": "forEach", "container": "search.item", "onEach": [
        {"action": "checkNotSent", "container": "search.item.sentMarker"},
        {"action": "click", "container": "search.item.wangwangLink"},
        {"action": "wait", "selector": "chat.root", "timeout": 5000},
        {"action": "dismissPopups", "containers": ["popup.close"]},
        {"action": "fill", "container": "chat.inputBox", "value": "你好"},
        {"action": "click", "container": "chat.sendButton"},
        {"action": "wait", "duration": 2000},
        {"action": "click", "container": "chat.closeTab"},
        {"action": "markAsSent", "container": "search.item.shopId"}
      ]}
    ]
  }
}
```

## 去重机制说明

### 方案 1：基于 DOM 标记（推荐）
在搜索结果页面，为已发送消息的卖家添加自定义属性：
```javascript
// 标记为已发送
element.setAttribute('data-sent', 'true');
element.classList.add('sent-marker');

// 检查是否已发送
if (element.hasAttribute('data-sent') || element.classList.contains('sent-marker')) {
  // 跳过此卖家
}
```

### 方案 2：基于店铺 ID（持久化）
提取店铺 ID 并存储到本地数据库/文件：
```javascript
// 提取店铺 ID
const shopId = element.getAttribute('data-shop-id') || 
               element.querySelector('[data-seller-id]')?.getAttribute('data-seller-id');

// 存储到已发送列表
const sentShops = JSON.parse(localStorage.getItem('sent_shops') || '[]');
if (sentShops.includes(shopId)) {
  // 跳过
} else {
  sentShops.push(shopId);
  localStorage.setItem('sent_shops', JSON.stringify(sentShops));
}
```

### 方案 3：基于聊天历史
检查聊天窗口中是否已有发送记录：
```javascript
// 打开聊天后，检查历史消息
const hasHistory = document.querySelector('.message-history')?.children.length > 0;
if (hasHistory) {
  // 已有聊天记录，跳过或询问
}
```

## 使用示例

### Python 脚本示例
```python
from browser_interface import ChromiumBrowserWrapper

config = {
    "headless": False,
    "session_name": "1688_batch_chat",
    "anti_bot_detection": True,
    "human_delay_range": (1.0, 2.5)
}

with ChromiumBrowserWrapper(config) as browser:
    page = browser.goto("https://www.1688.com/")
    
    # 1. 搜索产品
    browser.safe_fill(page, "#alisearch-input", "电子产品")
    browser.safe_click(page, ".search-btn")
    browser.safe_wait(page, timeout=3)
    
    # 2. 遍历搜索结果
    items = page._page.locator(".search-offer-item").all()
    
    for item in items[:5]:  # 只处理前 5 个
        # 2.1 检查是否已发送
        if item.get_attribute('data-sent') == 'true':
            print("跳过已发送")
            continue
        
        # 2.2 点击旺旺链接
        ww_link = item.locator("a.ww-link").first
        browser.safe_click(page, ww_link)
        time.sleep(3)
        
        # 2.3 关闭弹窗
        try:
            close_btn = page._page.locator(".popup-close").first
            if close_btn.is_visible():
                browser.safe_click(page, close_btn)
        except:
            pass
        
        # 2.4 发送消息
        browser.safe_fill(page, ".editBox", "你好")
        browser.safe_click(page, ".send-btn")
        time.sleep(2)
        
        # 2.5 关闭标签
        page._page.close()
        
        # 2.6 标记为已发送
        item.evaluate("el => el.setAttribute('data-sent', 'true')")
```

## 注意事项

1. **风控检测**：使用 `safe_click` 和 `safe_fill` 可自动检测验证码
2. **随机延迟**：配置 `human_delay_range` 模拟人类操作
3. **弹窗处理**：每次打开聊天窗口后先检查并关闭弹窗
4. **去重存储**：建议使用 localStorage 或数据库持久化已发送列表
5. **错误处理**：网络波动可能导致页面加载失败，需要添加重试逻辑

## 文件位置

- **容器库**：`/Users/fanzhang/Documents/github/webauto/container-library.json`
- **浏览器包装器**：`/Users/fanzhang/Documents/github/webauto/browser_interface/chromium_browser.py`
