# 小红书爬取结果质量报告（2026-01-17）

## 执行配置

- **脚本**: `phase1-4-full-collect.mjs`
- **关键字**: 雷军
- **目标数量**: 50 条
- **环境**: prod
- **模式**: headless
- **执行时间**: 2026-01-17 16:22:23

## 当前进度

- **已采集**: 2/50 note 完成（4% 完成率）
- **运行状态**: 后台执行中 \(PID: 13421\)
- **4-Tab 并发**: 正常工作（slot 1-4 轮询处理）

## 产物目录

```
~/.webauto/download/xiaohongshu/download/雷军/
├── safe-detail-urls.jsonl  # 104 条（Phase2 列表采集产物）
├── run.20260117-162223-pr68he.log  # 执行日志
└── {noteId}/
    ├── content.md
    ├── comments.md
    └── images/
```

## 质量检查结果

### 1. content.md 完整性

#### 统计

```bash
find ~/.webauto/download/xiaohongshu/download/雷军 -name "content.md" | wc -l
# 88 个 content.md 文件
```

#### 问题：大量帖子显示"（无正文）"

**抽样检查**（5 个 content.md）：

1. **695c8b59000000000b010738**: 无标题，（无正文），有图片 02.jpg
2. **6969c6e7000000002103fe43**: 无标题，（无正文），有图片 01.jpg
3. **695ba1ae000000001a035f47**: 无标题，（无正文），无图片
4. **67e2d4b7000000001e009ca8**: 无标题，（无正文），有图片 01.jpg, 02.jpg
5. **6968d689000000001a0252f1**: 无标题，（无正文），有图片 01.jpg, 02.jpg

**问题根因分析**：

1. **ExtractDetailBlock 被正确调用**：日志显示 "Phase3: 提取详情正文与图片..." ✅
2. **容器锚点验证成功**：
   - `xiaohongshu_detail.header` ✅
   - `xiaohongshu_detail.content` ✅  
   - `xiaohongshu_detail.gallery` ✅
3. **但正文内容为空**：说明容器定义的 selector 可能不匹配实际DOM结构

**解决方案**：

需要检查 `container-library/xiaohongshu/xiaohongshu_detail/content.json` 的 selector 是否正确匹配小红书详情页的正文区域。

### 2. comments.md 完整性

#### 统计

```bash
find ~/.webauto/download/xiaohongshu/download/雷军 -name "comments.md" | wc -l
# 待采集完成后统计
```

#### 初步观察

- 日志显示评论采集正常进行
- 示例：
  - `695c8b59000000000b010738`: 采集 39 条评论
  - `695bc232000000001a027cce`: 采集 50 条评论（达到单note上限）
  - `696a108c000000001a02e683`: 0 条评论（空评论区）

### 3. 图片下载情况

#### 初步观察

- 大部分 note 的 content.md 中有图片引用（`![]\(images/01.jpg\)`）
- 需要验证 images/ 目录中图片文件是否实际下载

### 4. 4-Tab 并发验证

#### 日志证据

```
[FullCollect][Tabs][Fixed] 固定使用 tab index=1,2,3,4
[FullCollect][Tabs][Open] slot=1 noteId=6969f75f000000001a01d01f
[FullCollect][Tabs][Open] slot=2 noteId=695c8b59000000000b010738
[FullCollect][Tabs][Open] slot=3 noteId=696a108c000000001a02e683
[FullCollect][Tabs][Open] slot=4 noteId=696a3812000000002102a974
```

✅ **4-Tab 并发模式正常工作**

#### 性能表现

- 每个 note 采集周期：约 10-30 秒（取决于评论数量）
- 并发效率：理论上可提升 4倍速度（相比单Tab）

## 待修复问题

### 🔴 P0: 正文提取失败

**问题**: ExtractDetailBlock 返回"（无正文）"  
**影响**: 大部分帖子缺失核心内容  
**优先级**: 最高

**排查步骤**：

1. 访问一个测试 note 的详情页（带 xsec_token）
2. 检查实际 DOM 结构中正文所在的容器
3. 对比 `container-library/xiaohongshu/xiaohongshu_detail/content.json` 的 selector
4. 更新容器定义或修复 ExtractDetailBlock 逻辑

### 🟡 P1: 标题缺失

**问题**: 所有 note 显示"无标题"  
**影响**: 内容可读性下降  
**优先级**: 中

### 🟢 P2: 图片下载验证

**问题**: 需要验证图片文件是否实际下载到 images/ 目录  
**影响**: 如果图片未下载，content.md 中的引用无效  
**优先级**: 低

## 后续行动

1. **立即停止当前采集**（已经暴露核心问题）
2. **修复 ExtractDetailBlock 正文提取逻辑**
3. **手动访问一个 note 的详情页，确认 DOM 结构**
4. **更新容器定义后重新测试 5-10 条**
5. **验证通过后再执行完整的 50 条采集**

## 技术细节

### Phase1-4 流程验证

✅ **Phase1**: 服务在线检查 + 登录状态 → 正常  
✅ **Phase2**: 列表采集 + safe-detail-urls.jsonl 生成 → 正常（104 条）  
❌ **Phase3**: 详情提取（ExtractDetailBlock）→ **正文为空**  
✅ **Phase4**: 评论采集（CollectCommentsBlock）→ 正常  

### 容器系统验证

- ✅ 容器锚点验证通过（header/content/gallery 均有 rect）
- ❌ 内容提取失败（selector 不匹配或提取逻辑有误）

### 日志示例

```
2026-01-17T08:24:38.303Z [INFO] [Note 695bc232000000001a027cce] Phase3: 提取详情正文与图片...
2026-01-17T08:24:38.306Z [INFO] [ExtractDetail] header rect: {"x":1186.0625,"y":89,"width":439,"height":89}
2026-01-17T08:24:38.309Z [INFO] [ExtractDetail] content rect: {"x":1186.0625,"y":178,"width":439,"height":137.203125}
2026-01-17T08:24:38.312Z [INFO] [ExtractDetail] gallery rect: {"x":577.5625,"y":89,"width":607.5,"height":1080}
2026-01-17T08:24:38.317Z [INFO]    ✅ 详情提取成功，包含字段: header, content, gallery
```

**关键观察**: 日志显示"详情提取成功"，但实际 content.md 为空 → 说明提取逻辑本身有问题，而不是容器定义问题。

---

**报告生成时间**: 2026-01-17T08:27:00Z  
**数据源**: `~/.webauto/download/xiaohongshu/download/雷军/`
