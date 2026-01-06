# 小红书容器库

容器库按照“根容器对应单独页面、子容器紧贴 DOM 层级”组织，当前根容器包括：

- `xiaohongshu_home`：主页/推荐流（URL：`xiaohongshu.com`）。
- `xiaohongshu_search`：搜索结果页。
- `xiaohongshu_detail`：笔记详情页。
- `xiaohongshu_login`：登录页。

所有根容器彼此平行，每个根目录下的 `container.json` 负责匹配页面入口，其余子容器递归挂载。

## 子容器目录命名

```
xiaohongshu/
├── home/
│   ├── container.json
│   └── feed_list/
│       ├── container.json
│       └── feed_item/
│           └── container.json
├── search/
│   ├── container.json
│   ├── search_bar/
│   │   └── container.json
│   └── search_result_list/
│       └── search_result_item/
├── detail/
│   ├── container.json
│   ├── modal_shell/
│   │   └── container.json
│   ├── header/
│   ├── content/
│   ├── gallery/
│   └── comment_section/
│       ├── container.json
│       ├── show_more_button/
│       ├── comment_item/
│       ├── end_marker/
│       └── empty_state/
└── login/
    ├── container.json
    └── login_guard/
```

每个目录只包含一个 `container.json` 和可选的子目录。容器 ID 按 `xiaohongshu_<root>.<child>...` 命名，与 `find-child` 的 `container_id` 保持一致。若需要检测登录，则在对应根目录下添加 `login_anchor` 子容器。

## 根容器与结构规范

1. **根容器 = 页面入口**：`home/container.json`、`search/container.json`、`detail/container.json`、`login/container.json` 均匹配页面的最大可视区域（通常是 `<body>` 下的主容器）。根容器 selector 必须稳定，禁止用 `.note-item` 等局部元素充当根容器。
2. **子目录遵循 DOM 层级**：目录结构与 DOM 结构一一对应，只能在父目录下继续拆分子容器，禁止跨层或跨页面引用（例如 `search` 下的容器不能直接引用 `detail` 的节点）。
3. **搜索页要求**：`search/search_result_list/container.json` 对应列表根节点，`search/search_result_item` 负责单条笔记的抽取、自动导航；两者必须成对存在。
4. **详情页要求**：`detail/modal_shell` 捕捉模态/详情主区域，必须包含 `header`（作者信息）、`content`（正文）、`gallery`（图片/视频）、`comment_section` 等子容器，确保工作流可以独立驱动各区块。
5. **评论完备性**：`comment_section` 下固定包含 `comment_item`、`show_more_button`、`end_marker`、`empty_state` 四类子容器，用于自动滚动、展开、读取 “THE END”/空状态文案。
6. **自动点击/滚动**：所有需要自动点击的容器（如 `show_more_button`）在 `metadata.auto_click = true` 并在 `operations` 中绑定 `click`；滚动节点使用 `list` 类型容器 + `scroll` operation。
7. **登录守卫**：每个页面可选 `login_anchor` 子容器用于检查登录态；统一高亮/等待逻辑在脚本中复用。

## 自动点击/滚动约定

- 自动展开按钮：在子容器 `metadata.auto_click = true`，并在 `operations` 中配置 `click`。
- 评论滚动：在 `comment_section` 中配置 `scroll` operation 并挂载 `show_more_button`、`comment_item`。
- 登录锚点：各页面无需重复校验，统一由 `xiaohongshu_login` 根容器负责。
- 列表跳转：`search_result_list` + `search_result_item` 组合负责结果列表与帖子容器；`search_result_item` 通过 `navigate` operation 直接读取 `a[href*='/explore/']` 并执行 `window.location.href`，同时抽取 `noteId + xsec_token`。
- 详情模态：`detail.modal_shell` 匹配 `.note-detail-mask`，其子容器覆盖正文、图片、评论等各区块。
- 评论末端：`comment_section.end_marker` 用于检测 “THE END” 等尾部标记；`comment_section.empty_state` 捕捉无评论的提示文案。

更多示例可参考 `container-library/weibo` 的目录结构。

---

## 登录锚点约定（2025-01-06）

### 核心原则

**登录状态判定完全基于容器匹配，禁止在 workflow/脚本中硬编码 DOM 逻辑。**

### 容器定义

#### 已登录标识：`*.login_anchor`

- **选择器**：`a.link-wrapper[title="我"]`（小红书"我"入口）
- **位置**：每个根容器下都挂载一个 `login_anchor` 子容器
- **容器 ID**：
  - `xiaohongshu_home.login_anchor`
  - `xiaohongshu_search.login_anchor`
  - `xiaohongshu_detail.login_anchor`
- **判定规则**：只要匹配到任意 `*.login_anchor`，视为已登录

#### 未登录标识：`xiaohongshu_login.login_guard`

- **选择器**：登录页的核心控件（登录按钮/验证码输入框）
- **位置**：`xiaohongshu_login` 根容器下
- **容器 ID**：`xiaohongshu_login.login_guard`
- **判定规则**：匹配到此容器，视为未登录，需人工介入

#### 不确定状态

- **条件**：两类容器都匹配不到
- **处理**：由 workflow 决定下一步（通常跳转到登录页或提示错误）

### Workflow 使用规范

#### ✅ 正确做法：基于容器 ID

```typescript
// EnsureLoginBlock 示例
async function ensureLogin() {
  const result = await controllerAction('containers:match', { profile, url });
  
  // 检查已登录容器
  const loginAnchor = findContainer(result, /\.login_anchor$/);
  if (loginAnchor) {
    emit('login:ok');
    return { logged: true };
  }
  
  // 检查未登录容器
  const loginGuard = findContainer(result, /xiaohongshu_login\.login_guard$/);
  if (loginGuard) {
    emit('login:required');
    await waitForLogin(); // 等待人工登录
    return ensureLogin(); // 重试
  }
  
  // 不确定状态
  throw new Error('无法判定登录状态');
}
```

#### ❌ 错误做法：硬编码 DOM

```javascript
// 禁止这样写
if (url.includes('xiaohongshu.com')) {
  const avatar = await page.$('a[title="我"]');
  if (avatar) return true;
}
```

### 事件驱动

#### 登录相关事件

| 事件 | 触发条件 | 下一步 |
|------|----------|--------|
| `login:required` | 匹配到 `login_guard` | 停止并等待人工登录 |
| `login:ok` | 匹配到 `login_anchor` | 继续 workflow |
| `login:uncertain` | 两类容器都不匹配 | 跳转登录页或报错 |

#### 订阅示例

```javascript
messageBus.subscribe('login:required', async (event) => {
  console.log('⚠️  需要登录，等待人工操作...');
  // 高亮 login_guard 容器
  await highlight(event.containerId);
});

messageBus.subscribe('login:ok', async (event) => {
  console.log('✅ 已登录，继续执行');
  // 开启自动保存 Cookie
  await autoCookies.start();
});
```

### 平台扩展

同一套登录锚点模型可应用于其他平台：

```
weibo/
├── home/login_anchor/      # 微博"我"入口
├── search/login_anchor/
└── login/login_guard/

douyin/
├── home/login_anchor/      # 抖音头像
└── login/login_guard/
```

Workflow 只需传入不同的 `siteKey`，容器 ID 映射自动切换。

### 调试工具

#### 检查登录状态

```bash
# 使用 status 脚本（基于容器）
node scripts/xiaohongshu/tests/status.mjs

# 手动匹配容器
curl -X POST http://127.0.0.1:7701/v1/controller/action \
  -d '{"action":"containers:match","payload":{"profile":"xiaohongshu_fresh"}}'
```

#### 高亮登录锚点

```bash
# 高亮已登录标识
curl -X POST http://127.0.0.1:7701/v1/container/xiaohongshu_search.login_anchor/execute \
  -d '{"operation":"highlight"}'

# 高亮未登录标识
curl -X POST http://127.0.0.1:7701/v1/container/xiaohongshu_login.login_guard/execute \
  -d '{"operation":"highlight"}'
```

### 参考实现

- `scripts/xiaohongshu/tests/status.mjs` - 基于容器的状态检查（待更新）
- `scripts/xiaohongshu/tests/phase1-session-login.mjs` - 登录守护逻辑（待更新）
- `modules/workflow/blocks/EnsureLoginBlock.ts` - 通用登录块（待创建）
