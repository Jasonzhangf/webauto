# WebAuto DOM Picker 修复任务 - 当前状态

## 核心问题分析

### 问题1：picker捕获时点击被截获 ✅
- runtime.js 中已经有 `preventDefault()` 和 `stopPropagation()`
- 应该是工作的，需要验证

### 问题2：DOM元素没有被绘制和连线 ❌ 
**现象**：
- 建议的子容器（橙色虚线框）显示了 ✅
- DOM元素（橙色虚线框）没有显示 ❌
- 两者之间没有连线 ❌

**根本原因**：
1. `ensureDomPathLoaded` 成功加载了DOM分支（有日志证明）✅
2. `mergeDomBranch` 成功合并了分支到 domData ✅
3. `expandDomPath` 展开了路径到 expandedNodes ✅
4. **但是** `renderDomNodeRecursive` 在渲染时，新加载的深层节点可能没有被渲染，因为：
   - 初始 DOM tree 只有浅层节点（depth=8）
   - `mergeDomBranch` 只是替换了 targetNode.children
   - 但如果 targetNode 本身在初始 tree 中不存在，就无法合并
   - 需要检查 `findDomNodeByPath` 是否能找到目标节点

**解决方案**：
1. 在 `handlePickerResult` 中添加详细日志，确认：
   - DOM分支加载是否成功
   - DOM节点是否被合并到 domData
   - DOM节点是否在 domNodePositions 中注册
2. 检查 `renderDomNodeRecursive` 是否正确遍历了新合并的节点
3. 添加橙色虚线高亮到选中的DOM节点
4. 在 `drawAllConnections` 中添加建议节点到DOM节点的连线

## 修复步骤

### 步骤1：添加详细日志
```javascript
// 在 handlePickerResult 中
console.log('[handlePickerResult] domPath:', domPath);
console.log('[handlePickerResult] After ensureDomPathLoaded, domData:', domData);
console.log('[handlePickerResult] After renderGraph, domNodePositions.has(domPath):', domNodePositions.has(domPath));
console.log('[handlePickerResult] domNodePositions.get(domPath):', domNodePositions.get(domPath));
```

### 步骤2：检查 mergeDomBranch
```javascript
// 在 mergeDomBranch 中添加日志
console.log('[mergeDomBranch] Looking for path:', branchNode.path);
console.log('[mergeDomBranch] Found targetNode:', !!targetNode);
console.log('[mergeDomBranch] targetNode.children before:', targetNode?.children?.length || 0);
console.log('[mergeDomBranch] branchNode.children:', branchNode.children?.length || 0);
```

### 步骤3：在 drawAllConnections 中添加建议节点连线
```javascript
// 在 drawAllConnections 的末尾
if (suggestedNode) {
  const containerPos = containerNodePositions.get(suggestedNode.parentId);
  const domPos = domNodePositions.get(suggestedNode.domPath);
  
  if (containerPos && domPos) {
    // 绘制橙色虚线从建议容器到DOM节点
    drawConnectionToDom(parent, containerPos.x, containerPos.y, domPos.indicatorX, domPos.indicatorY, '#fbbc05');
  }
}
```

### 步骤4：修改 drawConnectionToDom 支持自定义颜色
```javascript
function drawConnectionToDom(parent, startX, startY, endX, endY, color = '#4CAF50') {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midX = (startX + endX) / 2;
  path.setAttribute('d', `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-dasharray', '4,2');
  path.setAttribute('opacity', '0.7');
  parent.appendChild(path);
}
```

## 待办事项
- [ ] 添加详细日志到 handlePickerResult
- [ ] 添加日志到 mergeDomBranch
- [ ] 修改 drawConnectionToDom 支持颜色参数
- [ ] 在 drawAllConnections 中添加建议节点连线
- [ ] 重启服务测试
- [ ] 检查浏览器控制台日志
- [ ] 确认DOM节点和建议节点都被正确绘制
- [ ] 确认连线正确绘制
