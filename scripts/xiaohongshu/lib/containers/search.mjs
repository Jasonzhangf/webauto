/**
 * 搜索页容器操作
 */

import { PROFILE } from '../env.mjs';
import { controllerAction, delay } from '../browser/commands.mjs';

const SEARCH_LIST_CONTAINER = 'xiaohongshu_search.search_result_list';

export async function verifySearchListAnchor() {
  try {
    await controllerAction('container:operation', {
      containerId: SEARCH_LIST_CONTAINER,
      operationId: 'highlight',
      config: { style: '2px solid #44ff44', duration: 200 },
      sessionId: PROFILE,
    });
    return true;
  } catch {
    return false;
  }
}

export async function clickSearchItem(index) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const match = await controllerAction('containers:match', {
      profile: PROFILE,
      tree: false,
      filters: [{ containerId: 'xiaohongshu_search.search_result_item' }],
    }).catch(() => null);

    const children = match?.container?.children || [];
    console.log(`[Search] containers:match attempt=${attempt + 1} items=${children.length}`);

    if (children.length === 0) {
      await delay(1000);
      continue;
    }

    const target = children[index];
    if (!target?.id) {
      console.warn(`[Search] item ${index} not found (total=${children.length})`);
      return false;
    }

    console.log(`[Search] clicking item ${index} via container ${target.id}`);
    await controllerAction('container:operation', {
      containerId: target.id,
      operationId: 'click',
      sessionId: PROFILE,
    });
    await delay(1200);
    return true;
  }

  console.warn(`[Search] containers:match returned empty after retries`);
  return false;
}
