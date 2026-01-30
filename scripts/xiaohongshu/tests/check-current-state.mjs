#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 小红书当前状态检查与回退脚本
 *
 * 目标：
 * 1. 检查当前页面匹配到的容器
 * 2. 根据当前位置决定如何回到搜索列表
 * 3. 提供安全的回退机制
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function controllerAction(action, payload = {}) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data || data;
}

async function getCurrentPageInfo() {
  const script = `
    (() => {
      return {
        url: window.location.href,
        title: document.title,
        pathname: window.location.pathname
      };
    })()
  `;

  return await controllerAction('browser:execute', { profile: PROFILE, script });
}

async function checkCurrentContainers() {
  console.log('\n🔍 检查当前页面状态...');

  // 尝试匹配所有可能的容器
  const containersToCheck = [
    { id: 'xiaohongshu_home', desc: '首页' },
    { id: 'xiaohongshu_home.feed_list', desc: '首页笔记列表' },
    { id: 'xiaohongshu_search.search_bar', desc: '搜索框' },
    { id: 'xiaohongshu_search.search_result_list', desc: '搜索结果列表' },
    { id: 'xiaohongshu_detail.modal_shell', desc: '详情页模态框' },
    { id: 'xiaohongshu_detail', desc: '详情页' },
    { id: 'xiaohongshu_login.login_guard', desc: '登录页' }
  ];

  const foundContainers = [];

  for (const container of containersToCheck) {
    try {
      const result = await controllerAction('containers:match', {
        url: 'https://www.xiaohongshu.com',
        sessionId: PROFILE,
        selectors: [container.id]
      });

      if (result.matches && result.matches.length > 0) {
        const match = result.matches[0];
        if (match.found) {
          foundContainers.push({
            ...container,
            rect: match.rect,
            confidence: match.confidence || 1.0
          });
        }
      }
    } catch (error) {
      console.error(`检查容器 ${container.id} 失败:`, error.message);
    }
  }

  return foundContainers;
}

async function backToSearchList() {
  console.log('\n🔄 尝试回到搜索列表...');

  // 获取当前URL
  const pageInfo = await getCurrentPageInfo();
  console.log(`当前URL: ${pageInfo.url}`);

  // 尝试通过容器操作关闭详情模态框
  try {
    console.log('尝试关闭详情模态框...');
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_detail.modal_shell',
      operationId: 'close',
      sessionId: PROFILE
    });

    // 等待关闭动画
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检查是否回到搜索页
    const containers = await checkCurrentContainers();
    const hasSearchList = containers.some(c =>
      c.id === 'xiaohongshu_search.search_result_list' ||
      c.id === 'xiaohongshu_home.feed_list'
    );

    if (hasSearchList) {
      console.log('✅ 成功回到搜索列表');
      return true;
    }
  } catch (error) {
    console.log('容器关闭失败，尝试其他方式...');
  }

  // 尝试通过ESC键关闭
  try {
    console.log('尝试ESC键关闭...');
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `
        // 尝试发送ESC键
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        document.dispatchEvent(new KeyboardEvent('keyup', {key: 'Escape'}));
      `
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const containers = await checkCurrentContainers();
    const hasSearchList = containers.some(c =>
      c.id === 'xiaohongshu_search.search_result_list' ||
      c.id === 'xiaohongshu_home.feed_list'
    );

    if (hasSearchList) {
      console.log('✅ ESC键成功回到搜索列表');
      return true;
    }
  } catch (error) {
    console.log('ESC关闭失败，尝试导航回退...');
  }

  // 最后尝试历史记录回退
  try {
    console.log('尝试浏览器历史记录回退...');
    await controllerAction('browser:execute', {
      profile: PROFILE,
      script: 'window.history.back()'
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const containers = await checkCurrentContainers();
    const hasSearchList = containers.some(c =>
      c.id === 'xiaohongshu_search.search_result_list' ||
      c.id === 'xiaohongshu_home.feed_list'
    );

    if (hasSearchList) {
      console.log('✅ 历史记录回退成功');
      return true;
    }
  } catch (error) {
    console.error('所有回退方式均失败');
    return false;
  }

  console.log('❌ 无法回到搜索列表');
  return false;
}

async function main() {
  console.log('检查当前页面状态与回退机制');

  try {
    // 1. 获取当前页面信息
    const pageInfo = await getCurrentPageInfo();
    console.log(`\n当前URL: ${pageInfo.url}`);
    console.log(`页面标题: ${pageInfo.title}`);
    console.log(`路径: ${pageInfo.pathname}`);

    // 2. 检查当前匹配到的容器
    const containers = await checkCurrentContainers();

    if (containers.length === 0) {
      console.log('\n❌ 未匹配到任何容器，需要重新导航');
    } else {
      console.log('\n📍 当前匹配到的容器:');
      containers.forEach(c => {
        console.log(`   - ${c.id}: ${c.desc}`);
        console.log(`     位置: x=${c.rect.x.toFixed(1)}, y=${c.rect.y.toFixed(1)}`);
        console.log(`     大小: w=${c.rect.width.toFixed(1)}, h=${c.rect.height.toFixed(1)}`);
      });
    }

    // 3. 判断当前位置
    const inDetail = containers.some(c =>
      c.id === 'xiaohongshu_detail' || c.id === 'xiaohongshu_detail.modal_shell'
    );

    const inSearch = containers.some(c =>
      c.id === 'xiaohongshu_search.search_result_list' ||
      c.id === 'xiaohongshu_search.search_bar'
    );

    // 4. 执行回退动作
    if (inDetail) {
      console.log('\n🔍 当前在详情页，需要返回搜索列表');
      const success = await backToSearchList();

      if (success) {
        console.log('\n✅ 已成功回到搜索列表');

        // 重新验证
        const newContainers = await checkCurrentContainers();
        console.log('\n回退后匹配到的容器:');
        newContainers.forEach(c => {
          console.log(`   - ${c.id}: ${c.desc}`);
        });
      }
    } else if (inSearch) {
      console.log('\n✅ 当前已在搜索界面，无需回退');
    } else {
      console.log('\n⚠️  当前位置不明确，可能需要手动处理');
    }

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

main();