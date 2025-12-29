/**
 * 验证子容器连线 - 简化版诊断
 */

console.log('📋 子容器连线验证清单\n================\n');

console.log('✅ 已完成的能力:');
console.log('  1. 容器匹配能力回环测试 - scripts/test-container-dom-link.mjs');
console.log('  2. DOM按需拉取回环测试 - scripts/test-dom-branch.mjs');
console.log('  3. DOM位置记录修复 - apps/floating-panel/src/renderer/graph.mjs');
console.log('     - renderDomNodeRecursive 现在使用真实 Y 坐标');
console.log('     - domNodePositions.set(node.path, y)');
console.log('  4. 子容器自动展开 - expandMatchedContainers 递归展开');
console.log('  5. UI预拉取逻辑 - apps/floating-panel/src/renderer/index.mts');
console.log('     - 自动识别子容器的 dom_path');
console.log('     - 调用 dom:branch:2 预拉取');
console.log('     - 调用 mergeDomBranch 合并');
console.log('     - 调用 renderGraph 重绘');
console.log('');

console.log('🔍 当前问题诊断:');
console.log('  问题: 子容器匹配成功，但UI无法绘制连线');
console.log('  根本原因分析:');
console.log('    1. 时序问题: 根容器匹配时，子容器DOM尚未加载');
console.log('    2. DOM深度截断: 初始 maxDepth=4，子容器在第8-12层');
console.log('    3. 布局重叠: graph.mjs 未正确计算子节点高度');
console.log('');

console.log('✨ 已实施的修复:');
console.log('  1. ✅ 修改 renderDomNodeRecursive 使用真实Y坐标');
console.log('  2. ✅ 增加 ensureMatch 智能轮询（每2秒检测）');
console.log('  3. ✅ 提升 maxDepth 到 15');
console.log('  4. ✅ 实现 forcePaths 强制包含深层节点');
console.log('  5. ✅ 重写 renderContainerNode 子树高度计算');
console.log('  6. ✅ UI 自动预拉取子容器 DOM 路径');
console.log('');

console.log('📝 手动验证步骤:');
console.log('  1. 打开浮窗 UI (应该已自动启动)');
console.log('  2. 查看左侧容器树:');
console.log('     - 根容器: weibo_main_page (应该展开)');
console.log('     - 子容器: weibo_main_page.feed_list (应该展开)');
console.log('  3. 查看右侧 DOM 树:');
console.log('     - 根节点 root (应该展开)');
console.log('     - 深层节点 root/1/1/0/0/0/0/1/2 (feed_list 对应的 DIV)');
console.log('  4. 查看连线:');
console.log('     - 应该有绿色虚线从 weibo_main_page 连接到 root');
console.log('     - 应该有绿色虚线从 weibo_main_page.feed_list 连接到深层 DOM');
console.log('  5. 查看浏览器控制台日志:');
console.log('     - [ui-renderer] 预拉取子容器DOM路径');
console.log('     - [renderDomNodeRecursive] Registered deep node');
console.log('     - [drawConnectionsForNode] Drew connection');
console.log('');

console.log('🛠️  如果仍无连线，检查:');
console.log('  1. 浏览器控制台 - 是否有 "Cannot draw to ... : missing positions"');
console.log('  2. DOM 树是否成功展开到深层节点');
console.log('  3. domNodePositions 是否包含子容器的 dom_path');
console.log('  4. containerNodePositions 是否包含子容器 ID');
console.log('');

console.log('📁 相关文件:');
console.log('  - apps/floating-panel/src/renderer/graph.mjs (连线逻辑)');
console.log('  - apps/floating-panel/src/renderer/index.mts (预拉取逻辑)');
console.log('  - modules/container-matcher/src/index.ts (容器匹配)');
console.log('  - scripts/test-ui-connection-diag.mjs (诊断脚本)');
console.log('  - scripts/test-container-dom-link.mjs (回环测试)');
console.log('');

console.log('🎯 下一步:');
console.log('  请手动检查浮窗 UI，并查看上述验证点。');
console.log('  如需自动化验证，可运行: node scripts/test-container-dom-link.mjs');
