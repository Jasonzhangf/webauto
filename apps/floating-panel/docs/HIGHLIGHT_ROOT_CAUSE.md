# DOM 高亮问题根本原因分析

## 现象

1. **容器高亮**: API 返回 count=0, 但浏览器中**有红色高亮框**
2. **DOM 高亮**: API 返回 count=1, 但浏览器中**无蓝色高亮框**

## 矛盾

- count 表示匹配到的元素数量
- count=1 应该有高亮，count=0 不应该有高亮
- 但实际情况相反

## 可能原因

### 1. Channel 隔离问题
- 容器高亮使用 channel: 'container'
- DOM 高亮使用 channel: 'dom'
- 可能旧的 channel 残留导致显示错误

### 2. 高亮层叠问题
- 新的高亮没有正确覆盖旧的
- overlay 没有正确插入 DOM

### 3. 路径解析问题  
- DOM 路径 'root/0' 能找到元素（count=1）
- 但 overlay 可能没有正确定位

### 4. selector 为 'body' 的特殊情况
- body 元素可能被特殊处理
- count=0 可能是错误统计

## 下一步验证

1. 在浏览器 console 中直接调用 `window.__webautoRuntime.highlight.highlightElements()`
2. 检查是否有 overlay 元素插入 DOM
3. 验证 channel 清理逻辑是否正确

## 临时解决方案

用户应该使用**启动脚本**：
```bash
node scripts/start-headful.mjs
```

这将确保所有服务正确启动并连接。
