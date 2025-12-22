
/**
 * 高亮页面元素脚本
 * 基于UI识别结果高亮搜索结果容器和第一个商品
 */

import fetch from 'node-fetch';

async function highlightElements(): Promise<any> {
  try {
    console.log('🎨 开始高亮页面元素...');

    // 从UI识别结果获取坐标
    const searchResultsContainer = [0, 584, 1623, 3397];
    const firstProduct = [625, 611, 894, 1561];

    // 高亮数据
    const highlightData = {
      elements: [
        {
          bbox: {
            x1: searchResultsContainer[0],
            y1: searchResultsContainer[1],
            x2: searchResultsContainer[2],
            y2: searchResultsContainer[3]
          },
          color: "#ff0000",
          label: "搜索结果容器",
          strokeWidth: 3
        },
        {
          bbox: {
            x1: firstProduct[0],
            y1: firstProduct[1],
            x2: firstProduct[2],
            y2: firstProduct[3]
          },
          color: "#00ff00",
          label: "第一个商品",
          strokeWidth: 3
        }
      ]
    };

    console.log('📍 高亮坐标:', highlightData);

    // 发送高亮请求到浏览器控制服务
    const response = await fetch('http://localhost:8001/highlight-elements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(highlightData)
    });

    if (!response.ok) {
      throw new Error(`高亮请求失败: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ 高亮完成:', result);

    // 等待2秒让高亮渲染完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 截图证明高亮完成
    console.log('📸 截图证明高亮完成...');
    const screenshotResponse = await fetch('http://localhost:8001/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!screenshotResponse.ok) {
      throw new Error(`截图失败: ${screenshotResponse.statusText}`);
    }

    const screenshotResult = await screenshotResponse.json();

    // 保存证明截图
    const base64Data = screenshotResult.screenshot.replace(/^data:image\/png;base64,/, '');
    const screenshot = Buffer.from(base64Data, 'base64');
    const proofPath = '/tmp/highlighted-elements-proof.png';

    import('fs').then(fs => {
      fs.writeFileSync(proofPath, screenshot);
      console.log(`💾 高亮证明截图已保存: ${proofPath}`);
      console.log('🎉 任务完成！已成功高亮搜索结果容器和第一个商品元素。');
    });

  } catch (error) {
    console.error('❌ 高亮失败:', error);
    throw error;
  }
}

highlightElements();