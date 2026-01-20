/**
 * 主页容器操作
 *
 * 提供主页（xiaohongshu.com）相关的高频容器操作：
 * - 验证主页锚点
 * - 聚焦搜索框
 * - 输入搜索关键词
 * - 提交搜索
 */

import { PROFILE } from '../env.mjs';
import { controllerAction, delay } from '../browser/commands.mjs';
import { systemKeyPress, systemTypeText } from '../browser/keyboard.mjs';

const SEARCH_INPUT_CONTAINER = 'xiaohongshu_home.search_input';

export async function verifyHomePageAnchor() {
  console.log('[Home] verifying anchor...');
  try {
    await controllerAction('container:operation', {
      containerId: SEARCH_INPUT_CONTAINER,
      operationId: 'highlight',
      config: { style: '2px solid #44ff44', duration: 200 },
      sessionId: PROFILE,
    });
    return true;
  } catch {
    return false;
  }
}

export async function verifySearchInputFocused() {
  try {
    const result = await controllerAction('container:operation', {
      containerId: SEARCH_INPUT_CONTAINER,
      operationId: 'extract',
      sessionId: PROFILE,
    });
    const focused = result?.data?.focused === true;
    console.log(`[Home] focus verified: ${focused}`);
    return focused;
  } catch {
    return false;
  }
}

export async function focusSearchInput() {
  console.log('[Home] focusing search input...');
  await controllerAction('container:operation', {
    containerId: SEARCH_INPUT_CONTAINER,
    operationId: 'click',
    sessionId: PROFILE,
  });

  for (let i = 0; i < 3; i++) {
    await delay(500);
    if (await verifySearchInputFocused()) {
      console.log('[Home] focus confirmed');
      return true;
    }
  }

  throw new Error('[Home] 聚焦失败，请检查容器定义');
}

export async function inputSearchKeyword(keyword) {
  console.log(`[Home] input keyword: ${keyword}`);

  // 1. 系统级输入（全选 + 删除）
  // 先清空（全选 + 删除）
  await systemKeyPress('A', ['Meta']);
  await systemKeyPress('A', ['Control']);
  await delay(100);
  await systemKeyPress('Backspace');
  await delay(200);

  await systemTypeText(keyword);
  await delay(300);

  // 输入后无验证，信任系统操作
  console.log('[Home] system input completed');
}

export async function submitSearch() {
  console.log('[Home] submitting search...');
  // 统一使用容器点击触发搜索
  await controllerAction('container:operation', {
    containerId: 'xiaohongshu_home.search_button',
    operationId: 'click',
    sessionId: PROFILE,
  });
  await delay(2000);
}

export async function performFullSearch(keyword) {
  await focusSearchInput();
  
  // 验证聚焦（可选，目前先增加延时）
  await delay(800);
  
  await inputSearchKeyword(keyword);
  
  // 输入后等待
  await delay(1000);
  
  await submitSearch();
  
  // 提交后等待跳转
  await delay(3000);
}
