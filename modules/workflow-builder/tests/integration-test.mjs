#!/usr/bin/env node
/**
 * DOM Inspector 和 ContainerManager 集成测试
 * 
 * 测试场景：
 * 1. 启动 DOMInspector 捕获模式
 * 2. 模拟元素选择事件
 * 3. 添加到 ContainerManager
 * 4. 构建层级关系
 * 5. 导出 JSON
 */

import { DOMInspector } from '../src/inspector/DOMInspector.ts';
import { ContainerManager } from '../src/inspector/ContainerManager.ts';
import assert from 'node:assert/strict';

const PROFILE = 'weibo_fresh';
const WS_URL = 'ws://127.0.0.1:7701/ws';

console.log('=== DOM Inspector 集成测试 ===');

async function runTest() {
  // Step 1: 初始化
  console.log('[1] 初始化 DOMInspector 和 ContainerManager');
  const inspector = new DOMInspector(PROFILE);
  const manager = new ContainerManager();

  // 设置 WebSocket（在真实环境中）
  // const ws = new WebSocket(WS_URL);
  // inspector.setWebSocket(ws);

  // Step 2: 启动捕获模式
  console.log('[2] 启动捕获模式');
  const started = await inspector.start();
  assert.equal(started, true, 'Inspector should start successfully');
  console.log('✅ 捕获模式已启动');

  // Step 3: 模拟元素选择（在真实环境中通过 WebSocket 接收）
  console.log('[3] 模拟添加容器');
  
  const mockContainer1 = {
    id: 'container_1',
    name: 'Feed List',
    selector: '.feed-list',
    metadata: {
      tagName: 'div',
      rect: { left: 100, top: 200, width: 800, height: 600 },
      textContent: 'Feed container',
      className: 'feed-list',
      id: ''
    },
    parentId: undefined,
    children: [],
    operations: [],
    messages: []
  };

  const mockContainer2 = {
    id: 'container_2',
    name: 'Feed Item 1',
    selector: '.feed-item:first-child',
    metadata: {
      tagName: 'article',
      rect: { left: 120, top: 220, width: 760, height: 200 },
      textContent: 'First post',
      className: 'feed-item',
      id: ''
    },
    parentId: 'container_1',
    children: [],
    operations: [],
    messages: []
  };

  const mockContainer3 = {
    id: 'container_3',
    name: 'Feed Item 2',
    selector: '.feed-item:nth-child(2)',
    metadata: {
      tagName: 'article',
      rect: { left: 120, top: 430, width: 760, height: 200 },
      textContent: 'Second post',
      className: 'feed-item',
      id: ''
    },
    parentId: 'container_1',
    children: [],
    operations: [],
    messages: []
  };

  manager.addContainer(mockContainer1);
  manager.addContainer(mockContainer2);
  manager.addContainer(mockContainer3);
  console.log('✅ 已添加 3 个容器');

  // Step 4: 构建层级关系
  console.log('[4] 构建容器层级关系');
  const hierarchy = manager.buildHierarchy();
  assert.equal(hierarchy.length, 1, 'Should have 1 root container');
  assert.equal(hierarchy[0].children.length, 2, 'Root should have 2 children');
  console.log('✅ 层级关系构建成功');
  console.log('  Root:', hierarchy[0].name);
  console.log('  Children:', hierarchy[0].children.map(id => manager.getContainer(id)?.name).join(', '));

  // Step 5: 测试容器 CRUD
  console.log('[5] 测试容器更新和删除');
  
  manager.updateContainer('container_2', { name: 'Updated Feed Item 1' });
  const updated = manager.getContainer('container_2');
  assert.equal(updated?.name, 'Updated Feed Item 1', 'Container should be updated');
  console.log('✅ 容器更新成功');

  manager.deleteContainer('container_3');
  const deleted = manager.getContainer('container_3');
  assert.equal(deleted, undefined, 'Container should be deleted');
  console.log('✅ 容器删除成功');

  // Step 6: 导出 JSON
  console.log('[6] 导出容器配置 JSON');
  const exported = manager.exportToJSON();
  const imported = JSON.parse(exported);
  assert.equal(imported.length, 2, 'Should have 2 containers after deletion');
  console.log('✅ JSON 导出成功');
  console.log('  容器数量:', imported.length);

  // Step 7: 测试导入导出回环
  console.log('[7] 测试导入导出回环');
  const manager2 = new ContainerManager();
  manager2.importFromJSON(exported);
  
  const containers1 = manager.getAllContainers();
  const containers2 = manager2.getAllContainers();
  
  assert.equal(containers1.length, containers2.length, 'Imported containers count should match');
  console.log('✅ 导入导出回环成功');

  // Step 8: 停止捕获模式
  console.log('[8] 停止捕获模式');
  const stopped = await inspector.stop();
  assert.equal(stopped, true, 'Inspector should stop successfully');
  console.log('✅ 捕获模式已停止');

  console.log('\n=== 集成测试全部通过 ✅ ===');
}

runTest().catch(err => {
  console.error('\n❌ 集成测试失败:', err);
  process.exit(1);
});
