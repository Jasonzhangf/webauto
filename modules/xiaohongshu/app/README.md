# 小红书采集 App Block 架构

## 概述

本文档描述小红书采集系统的 **App Block 架构**，包括各 Phase 的功能拆分、流程设计和实现规范。

---

## Phase 1: 会话启动与登录

### 功能
- 确保 Unified API 和 Browser Service 运行中
- 启动浏览器会话（复用 `xiaohongshu_fresh` profile）
- 确认登录状态（通过容器 `login_anchor` 检测）
- 启动 SearchGate 节流服务

### Block 拆分
| Block | 职责 |
|-------|------|
| `Phase1EnsureServicesBlock` | 健康检查 + 服务启动 |
| `Phase1StartProfileBlock` | 创建/复用浏览器会话 |
| `Phase1EnsureLoginBlock` | 容器驱动登录检测 |
| `Phase1MonitorCookieBlock` | Cookie 稳定性监控 |

### 执行流程
```
1. 检查 Unified API (7701) 和 Browser Service (7704)
2. 创建 xiaohongshu_fresh profile（headful 模式）
3. 通过容器匹配检测登录锚点
4. 若未登录，提示用户手动扫码
5. 启动 SearchGate (默认端口 7790)
6. Cookie 稳定后保存状态
```

### 入口脚本
```bash
node scripts/xiaohongshu/phase1-start.mjs
```

---

## Phase 2: 搜索与链接采集

### 功能
- 向 SearchGate 申请搜索许可（节流）
- 执行关键字搜索（输入框交互，禁止 URL 跳转）
- 滚动搜索结果页，采集指定数量的安全链接
- 校验链接有效性（`xsec_token` + 关键字匹配）
- 保存到 `~/.webauto/download/xiaohongshu/{env}/{keyword}/phase2-links.jsonl`

### Block 拆分
| Block | 职责 |
|-------|------|
| `WaitSearchPermitBlock` | SearchGate 许可申请 |
| `Phase2SearchBlock` | 容器驱动搜索（输入 + 回车） |
| `Phase2CollectLinksBlock` | 滚动列表 + 点击采集安全链接 |

### 执行流程
```
1. 申请 SearchGate 许可（60s 内最多 2 次）
2. 高亮验证搜索框容器（home/search_result）
3. 容器操作 type 输入关键字
4. 容器操作 key(Enter) 或 click(搜索按钮)
5. 等待搜索结果页加载完成
6. 循环采集：
   a. 获取视口可见卡片索引
   b. 容器操作 click 打开详情
   c. 等待详情页加载，提取 safeUrl（含 xsec_token）
   d. 校验 searchUrl 是否包含关键字
   e. 提取 noteId，去重
   f. ESC 返回搜索页（系统键盘）
   g. 滚动加载更多
7. 保存结果到 phase2-links.jsonl
```

### 入口脚本
```bash
node scripts/xiaohongshu/phase2-collect.mjs --keyword "手机膜" --target 50 --env debug
```

### 输出格式
```jsonl
{"noteId":"abc123","safeUrl":"https://...?xsec_token=...","searchUrl":"https://...?keyword=...","ts":"2025-01-19T..."}
```

---

## Phase 3-4: 多 Tab 并发采集（详情 + 评论）

### 功能
- 前置校验：确认在搜索结果页 + 链接有效性
- 打开 4 个 Tab 并发采集
- 每个 Tab 循环执行：
  - 打开详情页（使用 safeUrl，校验 xsec_token）
  - 提取详情内容（标题、正文、作者、图片）
  - 批量采集评论（每 50 条切换下一个 Tab）
  - 评论采集完成后，重定向到新链接
- 所有采集完成后关闭 4 个 Tab
- 持久化结果到 `~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/`

### Block 拆分
| Block | 职责 |
|-------|------|
| `Phase34ValidateLinksBlock` | 前置校验（当前页 + 链接有效性） |
| `Phase34OpenTabsBlock` | 打开 N 个 Tab（默认 4） |
| `Phase34ProcessDetailBlock` | 单个详情采集（Phase3 逻辑） |
| `Phase34CollectCommentsBlock` | 批量评论采集（Phase4 逻辑） |
| `Phase34PersistNoteBlock` | 持久化单条结果（详情 + 评论） |
| `Phase34CloseTabsBlock` | 关闭所有 Tab |

### 执行流程

#### 前置校验
```
1. 确认当前在搜索结果页（URL 包含 /search_result）
2. 读取 phase2-links.jsonl
3. 过滤有效链接：
   - safeUrl 包含 xsec_token
   - searchUrl 包含目标关键字
4. 记录有效链接数量
```

#### 多 Tab 并发
```
1. 打开 4 个 Tab（Tab 0/1/2/3）
2. 循环分配链接到 Tab：
   for (i = 0; i < validLinks.length; i++) {
     tabIndex = i % 4
     tab = tabs[tabIndex]
     link = validLinks[i]

     // 切换到目标 Tab
     switchToTab(tabIndex)

     // 打开详情页
     openDetailInTab(tab, link.safeUrl)

     // 提取详情（Phase3）
     detail = extractDetail(link.noteId)
     downloadImages(detail.images, link.noteId)

     // 采集评论（Phase4）
     comments = []
     while (hasMoreComments) {
       batch = collectNextBatch(50)  // 每 50 条
       comments.push(...batch)

       // 切换到下一个 Tab
       nextTab = tabs[(tabIndex + 1) % 4]
       switchToTab(nextTab.index)
     }

     // 持久化
     persistNote({
       noteId: link.noteId,
       detail,
       comments,
       keyword,
       env
     })
   }

3. 关闭所有 4 个 Tab
```

#### Phase3 详情提取
```
1. 容器匹配：xiaohongshu_detail.content_anchor
2. 高亮验证内容区域可见
3. 容器操作 extract 提取：
   - 标题（title）
   - 正文（content/description）
   - 作者（authorName, authorId）
   - 发布时间（publishTime）
   - 图片 URL 列表（images）
4. 下载图片到 {noteId}/images/ 目录
5. 生成 README.md（含相对路径引用）
```

#### Phase4 评论采集
```
1. 容器匹配：xiaohongshu_detail.comment_trigger
2. 高亮验证评论按钮可见
3. 容器操作 click 展开评论区
4. 容器匹配：xiaohongshu_detail.comment_list
5. 循环采集（每批 50 条）：
   a. 容器匹配 xiaohongshu_detail.comment_item
   b. 遍历所有可见评论项
   c. 容器操作 extract 提取：
      - 用户名（userName）
      - 用户 ID（userId）
      - 评论内容（content）
      - 发布时间（time）
      - 点赞数（likeCount）
   d. 容器操作 scroll 滚动加载更多
   e. 等待新评论加载
6. 去重合并（基于 userId + content）
7. 返回评论数组
```

### 入口脚本
```bash
node scripts/xiaohongshu/phase3-4-collect.mjs --keyword "手机膜" --env debug
```

### 输出结构
```
~/.webauto/download/xiaohongshu/{env}/{keyword}/
├── {noteId_1}/
│   ├── README.md          # 详情内容（标题、正文、作者）
│   ├── images/            # 图片文件
│   │   ├── 0.jpg
│   │   └── 1.jpg
│   └── comments.md        # 评论列表
├── {noteId_2}/
│   └── ...
└── phase2-links.jsonl     # 原始链接索引
```

---

## 容器依赖

### Phase 2 容器
| 容器 ID | 用途 |
|---------|------|
| `xiaohongshu_home.search_input` | 主页搜索框 |
| `xiaohongshu_home.search_button` | 主页搜索按钮 |
| `xiaohongshu_search.search_bar` | 搜索页搜索框 |
| `xiaohongshu_search.search_result_item` | 搜索结果卡片 |
| `xiaohongshu_search.search_result_list` | 搜索结果列表 |

### Phase 3 容器
| 容器 ID | 用途 |
|---------|------|
| `xiaohongshu_detail.content_anchor` | 详情页内容区域 |
| `xiaohongshu_detail.title` | 标题 |
| `xiaohongshu_detail.content` | 正文 |
| `xiaohongshu_detail.author` | 作者信息 |
| `xiaohongshu_detail.images` | 图片列表 |

### Phase 4 容器
| 容器 ID | 用途 |
|---------|------|
| `xiaohongshu_detail.comment_trigger` | 评论展开按钮 |
| `xiaohongshu_detail.comment_list` | 评论列表容器 |
| `xiaohongshu_detail.comment_item` | 单条评论项 |
| `xiaohongshu_detail.comment_user` | 评论用户名 |
| `xiaohongshu_detail.comment_content` | 评论内容 |

---

## 设计原则

### 1. 容器驱动
- ✅ 所有 DOM 查询通过容器 ID
- ✅ 所有操作通过 `container:operation`
- ❌ 禁止 `querySelector` / `getAttribute('href')`

### 2. 系统级操作
- ✅ 点击使用 `container:operation click`（内部系统级）
- ✅ 滚动使用 `container:operation scroll`
- ✅ 输入使用 `container:operation type`
- ❌ 禁止 `element.click()` / `scrollIntoView()`

### 3. 安全链接
- ✅ 详情页必须使用带 `xsec_token` 的 safeUrl
- ✅ 校验 searchUrl 包含目标关键字
- ❌ 禁止构造无 token 的 URL 直接访问

### 4. 视口验证
- ✅ 每次操作前高亮验证元素可见
- ✅ 返回 anchor.rect 用于调试
- ❌ 禁止操作离屏元素

### 5. 多 Tab 管理
- ✅ 使用 Unified API 的 Tab 管理接口
- ✅ 明确记录当前活跃 Tab
- ✅ 最终关闭所有打开的 Tab
- ❌ 禁止泄漏 Tab 资源

---

## 开发规范

### Block 命名
- 文件名：`Phase{N}{Action}Block.ts`（如 `Phase2SearchBlock.ts`）
- 函数名：`execute`
- 接口：`{Action}Input` / `{Action}Output`

### 目录结构
```
modules/xiaohongshu/app/src/blocks/
├── Phase1EnsureServicesBlock.ts
├── Phase1StartProfileBlock.ts
├── Phase1EnsureLoginBlock.ts
├── Phase1MonitorCookieBlock.ts
├── Phase2SearchBlock.ts
├── Phase2CollectLinksBlock.ts
├── Phase34ValidateLinksBlock.ts
├── Phase34OpenTabsBlock.ts
├── Phase34ProcessDetailBlock.ts
├── Phase34CollectCommentsBlock.ts
├── Phase34PersistNoteBlock.ts
└── Phase34CloseTabsBlock.ts
```

### 编译产物
```bash
npm run build:services

# 产物路径
dist/modules/xiaohongshu/app/src/blocks/*.js
```

---

## 变更日志

### 2025-01-19
- ✅ Phase 1 完成（会话启动 + 登录检测）
- ✅ Phase 2 完成（搜索 + 链接采集 + SearchGate 集成）
- 🚧 Phase 3-4 设计完成（多 Tab 并发架构）
- ⬜ 待实现：Phase 3-4 Blocks

---

## 参考文档

- [../../../AGENTS.md](../../../AGENTS.md) - 系统级操作规则
- [../../../container-library/xiaohongshu/README.md](../../../container-library/xiaohongshu/README.md) - 容器定义
- [../../../scripts/xiaohongshu/README.md](../../../scripts/xiaohongshu/README.md) - 脚本使用说明
