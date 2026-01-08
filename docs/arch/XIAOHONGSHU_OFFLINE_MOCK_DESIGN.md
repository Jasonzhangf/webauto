# 小红书采集持久化节点与离线仿真测试设计

> 目标：在不依赖线上页面和 URL 跳转的前提下，完整验证「详情提取 + 评论采集 + 持久化写盘」链路，为后续量产采集提供稳定闭环。

## 1. 持久化节点：PersistXhsNoteBlock

### 1.1 职责

- 单一职责：将当前 Note 的结构化内容（详情 + 评论）写入本地目录结构；
- 不做 DOM 访问、不做容器操作，只处理纯数据与文件系统；
- 所有落盘路径统一落在 `~/.webauto/download/xiaohongshu/{env}/`。

### 1.2 输入

由上游 Workflow 上下文提供（通常来自 ExtractDetailBlock / CollectCommentsBlock）：

- `sessionId: string`
- `env: string`：环境标记，例如 `debug` / `prod`
- `platform?: string`：默认 `'xiaohongshu'`
- `keyword: string`
- `noteId: string`
- `detailUrl?: string`：当前详情页 URL（带 xsec token，只用于展示，不参与导航）
- `detail: { ... }`：
  - 至少包含：`title`, `contentText`, `gallery: { images: string[] }`
  - 具体字段沿用 ExtractDetailBlock 的输出结构
- `commentsResult: { ... }`：
  - 至少包含：
    - `comments: Array<{ user_name?, user_id?, timestamp?, text? }>`
    - `totalFromHeader?: number`
    - `reachedEnd?: boolean`
    - `emptyState?: boolean`

### 1.3 输出

```ts
interface PersistXhsNoteOutput {
  success: boolean;
  error?: string;
  outputDir?: string;     // 实际写盘的帖子目录
  contentPath?: string;   // content.md 路径
  imagesDir?: string;     // images 目录路径
}
```

### 1.4 目录结构

- 根目录：`~/.webauto/download/xiaohongshu/{env}/`
- 关键字目录：`{root}/{sanitize(keyword)}/`
- 单条 Note 目录：`{root}/{sanitize(keyword)}/{noteId}/`
  - `content.md`：帖子+评论 Markdown
  - `images/`：图片文件

`sanitize(keyword)`：沿用现有实现，替换 `\/:*?"<>|` 等字符为 `_`，并 trim。

### 1.5 写盘逻辑

1. **目录创建**
   - 依次确保 `root/keywordDir/postDir/imagesDir` 存在；
   - 使用 Node ESM FS API：`fs.promises.mkdir(dir, { recursive: true })`。

2. **图片下载**
   - 来源：`detail.gallery.images: string[]`；
   - 预处理：
     - 去除空值，两端 trim；
     - `//` 开头补 `https:`；
     - 仅保留 `http/https` 协议；
   - 下载策略：
     - 使用 `fetch(url)` 获取响应，`arrayBuffer()` → `Buffer`；
     - 文件名：`images/{index}.jpg`（`01.jpg`、`02.jpg`...，保留顺序即可）；
     - 对单张失败情况：跳过该 URL，打印告警但不使整个 Block 失败；
   - 返回：
     - 本地相对路径列表，例如：`['images/01.jpg', 'images/02.jpg', ...]`。

3. **content.md 结构**

示例结构（与现有 `collect-100-workflow-v2.mjs` 一致，但文件名统一为 `content.md`）：

```markdown
# {title || '无标题'}

- Note ID: {noteId}
- 关键词: {keyword}
- 链接: {detailUrl}
- 作者: {author}
- 评论统计: 抓取={comments.length}, header={totalFromHeader|未知}（reachedEnd={是/否}, empty={是/否}）

## 正文

{contentText 或占位 "（无正文）"}

## 图片

![](images/01.jpg)
![](images/02.jpg)
...

## 评论

- **用户名**(user_id) [时间]：评论文本
...
```

字段选择策略：

- `title`：优先 detail.header/content 中的标题字段，其次回退到列表 item 的标题；
- `author`：从 detail.header 中的 `author/user_name/nickname` 选取；
- `contentText`：从 detail.content 中组合正文文本字段；
- `评论统计`：使用 `commentsResult.comments/totalFromHeader/reachedEnd/emptyState` 填充。

评论渲染规则：

- 遍历 `commentsResult.comments`：
  - `user = user_name || username || '未知用户'`
  - `uid = user_id || ''`
  - `ts = timestamp || ''`
  - `text = text || ''`
  - 生成：`- **{user}**({uid}) [ts]：{text}`
- 当 `comments.length === 0` 时写入：`（无评论）`。

---

## 2. 在线数据 → 本地 fixture JSON

> 一次在线采集，多次离线复用。

### 2.1 录制位置

- 在真实阶段（在线运行）中，在以下 Block 后增加 debug 输出（仅在 `DEBUG` 或特定环境下打开）：
  - `ExtractDetailBlock` 完成后；
  - `CollectCommentsBlock` 完成后。
- 将两者输出聚合成一份结构体：

```ts
interface XhsNoteFixture {
  noteId: string;
  keyword: string;
  detailUrl: string;
  detail: any;          // ExtractDetailBlock 完整输出
  commentsResult: any;  // CollectCommentsBlock 完整输出
  capturedAt: string;   // ISO 时间
}
```

### 2.2 落盘路径

- 路径统一放在用户目录，不进仓库：
  - `~/.webauto/fixtures/xiaohongshu/{noteId}.json`
- 由一个小的工具函数或 Block 内部调试逻辑写入：
  - 非强制步骤，只在调试/回放模式下写，避免常态任务产生太多 fixture。

### 2.3 用途

- PersistXhsNoteBlock 的单元/集成测试直接以 fixture 为输入，不依赖浏览器或 DOM；
- 也作为生成离线 HTML 仿真页的原始数据源。

---

## 3. fixture JSON → 仿真 HTML 详情页

> 目标：构造一个“结构类似小红书详情页”的本地 HTML，使容器系统与 Block 可以在本地跑完整链路。

### 3.1 生成脚本

- 新增脚本：`scripts/xiaohongshu/tests/generate-detail-mock-page.mjs`
- 输入：
  - `--noteId <id>`：从 `~/.webauto/fixtures/xiaohongshu/{noteId}.json` 读数据；
  - `--output <path>`（可选）：默认写到 `~/.webauto/fixtures/xiaohongshu/detail-{noteId}.html`。
- 输出：
  - 一份完整 HTML，模拟线上详情页的布局和 class 结构。

### 3.2 DOM 结构设计（按容器对齐）

仿真 DOM 需对齐以下容器 ID/selector：

- 详情容器：
  - `xiaohongshu_detail.modal_shell` / `xiaohongshu_detail`：最外层模态框容器；
  - `xiaohongshu_detail.header`：标题、作者信息区域；
  - `xiaohongshu_detail.content`：正文文本区域；
  - `xiaohongshu_detail.gallery`：图片区域。
- 评论容器：
  - `xiaohongshu_detail.comment_section`：评论区根容器；
  - `xiaohongshu_detail.comment_section.comment_item`：单条评论节点；
  - `xiaohongshu_detail.comment_section.show_more_button`：展开更多按钮；
  - `xiaohongshu_detail.comment_section.end_marker`：末尾 marker（可选）。

布局要点：

- 使用与容器 JSON 中 selector 对齐的 class / DOM 层级；
- 每条评论生成一段 `.comment-item`，内部包含：
  - 用户名元素（如 `.user-name`）；
  - 用户链接/ID（放在 `data-user-id` 或 `<a href="/user">` 中）；
  - 时间元素；
  - 文本元素。

### 3.3 “展开更多评论”仿真

- 插入若干 `.show-more` 按钮与折叠块：
  - 初始部分评论（例如前 N 条）直接可见；
  - 后续评论包在一个 `div` 里，`style="display:none"`；
  - 在其前插入一个 `.show-more` 元素。
- 在页面底部插入一段简单的 inline JS：

```js
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.show-more');
  if (!btn) return;
  const block = btn.nextElementSibling;
  if (block) {
    block.style.display = 'block';
    btn.remove();
  }
});
```

- 目的：让 `WarmupCommentsBlock` + `CollectCommentsBlock` 在本地也能通过容器 click 自动展开评论，行为上与线上一致。

### 3.4 图片区域仿真

- 使用 fixture 中的 `detail.gallery.images`：
  - 在 gallery 容器下生成 `<img>` 列表，class 对齐容器定义，例如：
    - `.note-img img`、`.note-scroller img` 等；
  - `src` 直接使用线上 URL（下载由 PersistXhsNoteBlock 负责）。

---

## 4. 基于仿真页的测试策略

### 4.1 PersistXhsNoteBlock 单块测试

1. 使用 fixture JSON 作为直接输入，不依赖 HTML/浏览器；
2. 调用 `PersistXhsNoteBlock.execute()`；
3. 断言：
   - 目录结构：`~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/` 存在；
   - `content.md` 内容完整（标题、元信息、正文、图片引用、评论）；
   - `images/` 下图片数量与 `gallery.images` 数量基本一致（允许部分下载失败但有告警）。

### 4.2 单 Note Workflow 离线 E2E

1. 启动 Browser Service，但导航到本地生成的仿真 HTML：
   - 例如：`http://127.0.0.1:port/xhs-mock/detail-{noteId}.html`；
   - URL 不包含任何线上域名，也不构造 xsec-less 链接。
2. 通过 `runWorkflowById('xiaohongshu-note-collect', { sessionId, keyword, env, noteId, detailUrl: mockUrl })` 执行：
   - 内部仍然使用容器系统进行 anchor 定位、滚动、展开评论；
   - CollectCommentsBlock 与 ExtractDetailBlock 均在本地仿真 DOM 上运行。
3. 验证：
   - WorkflowExecutionResult 中各步骤 success；
   - 持久化结果与 fixture 内容一致（评论条数、标题、正文等）。

### 4.3 整链路集成（可选）

- 在 debug 模式下，将搜索阶段替换为「直接跳本地仿真详情页」的简化 Workflow，用于验证：
  - 顶层 Workflow + CallWorkflowBlock 串联；
  - note-collect 节点可被反复调用且写盘正确；
  - 不再依赖真实搜索页和线上滚动。

---

## 5. 对现有代码的影响范围（规划）

1. 新增 Block：`PersistXhsNoteBlock`（仅依赖 Node FS 与 fetch，不依赖容器或浏览器上下文）；
2. 新增脚本：`scripts/xiaohongshu/tests/generate-detail-mock-page.mjs`；
3. 适度修改：
   - 在在线调试脚本 / Workflow 中增加 fixture 录制逻辑（可由 DEBUG 开关控制）；
   - 在 `xiaohongshu-note-collect` Workflow 定义中插入 `PersistXhsNoteBlock`。

通过本设计，我们可以在本地稳定重放“小红书详情+评论”的复杂场景，用真实数据驱动的仿真 DOM 来验证容器、Block 与持久化逻辑，而不再依赖线上页面与 URL 导航，从而显著降低调试成本与风控风险。 

