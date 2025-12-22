
/**
 * 集成的截图和UI识别脚本
 * 直接完成截图并发送到UI识别器，记录完整执行时间
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

async function integratedScreenshotAndUIRecognition(): Promise<any> {
  const startTime = Date.now();
  console.log('🚀 开始集成截图和UI识别流程...');

  try {
    // 1. 通过API获取截图
    console.log('📸 开始截图...');
    const screenshotStart = Date.now();

    const response = await fetch('http://localhost:8001/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`截图API调用失败: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error('截图API返回失败');
    }

    // 解码base64图片
    const base64Data = result.screenshot.replace(/^data:image\/png;base64,/, '');
    const screenshot = Buffer.from(base64Data, 'base64');

    const screenshotTime = Date.now() - screenshotStart;
    console.log(`✅ 截图完成，耗时: ${screenshotTime}ms`);

    // 2. 保存截图文件
    const screenshotPath = '/tmp/current-page-screenshot.png';
    fs.writeFileSync(screenshotPath, screenshot);
    console.log(`💾 截图已保存: ${screenshotPath}`);

    // 3. 发送到UI识别服务
    console.log('🔍 开始UI识别...');
    const uiRecognitionStart = Date.now();

    const uiResult = await sendToUIRecognition(screenshot);

    const uiRecognitionTime = Date.now() - uiRecognitionStart;
    console.log(`✅ UI识别完成，耗时: ${uiRecognitionTime}ms`);

    // 4. 处理识别结果
    console.log('\n📊 UI识别结果:');
    if (uiResult && uiResult.elements) {
      console.log(`🎯 识别到 ${uiResult.elements.length} 个UI元素`);

      // 查找搜索结果容器和第一个商品
      const searchResultsContainer = findSearchResultsContainer(uiResult.elements);
      const firstProduct = findFirstProduct(uiResult.elements);

      if (searchResultsContainer) {
        console.log('📦 找到搜索结果容器:', searchResultsContainer);
      }

      if (firstProduct) {
        console.log('🛍️ 找到第一个商品:', firstProduct);
      }

      // 保存识别结果
      const resultPath = '/tmp/ui-recognition-result.json';
      fs.writeFileSync(resultPath, JSON.stringify(uiResult, null, 2));
      console.log(`💾 识别结果已保存: ${resultPath}`);

    } else {
      console.log('❌ UI识别失败或无结果');
    }

    // 5. 总结报告
    const totalTime = Date.now() - startTime;
    console.log('\n📋 执行报告:');
    console.log(`⏱️ 总执行时间: ${totalTime}ms`);
    console.log(`📸 截图时间: ${screenshotTime}ms (${(screenshotTime/totalTime*100).toFixed(1)}%)`);
    console.log(`🔍 UI识别时间: ${uiRecognitionTime}ms (${(uiRecognitionTime/totalTime*100).toFixed(1)}%)`);
    console.log(`📊 其他操作时间: ${totalTime - screenshotTime - uiRecognitionTime}ms`);

    return {
      success: true,
      screenshotPath,
      uiResult,
      timing: {
        total: totalTime,
        screenshot: screenshotTime,
        uiRecognition: uiRecognitionTime
      }
    };

  } catch (error) {
    console.error('❌ 执行失败:', error);
    throw error;
  }
}

/**
 * 发送截图到UI识别服务
 */
async function sendToUIRecognition(screenshotBuffer): Promise<any> {
  // 转换为base64
  const base64Image = screenshotBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Image}`;

  const requestBody = {
    request_id: Date.now(),
    image: dataUrl,
    query: "识别页面中的搜索结果容器和第一个商品元素，用 bounding box 标出它们的位置",
    scope: "full",
    parameters: {
      max_tokens: 4096,
      temperature: 0.1
    }
  };

  // 尝试本地UI识别服务
  try {
    console.log('🔄 连接本地UI识别服务...');
    const response = await fetch('http://localhost:8898/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ 本地UI识别服务响应成功');
      return result;
    } else {
      console.log('⚠️ 本地UI识别服务响应错误:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('⚠️ 本地UI识别服务不可用:', error.message);
  }

  // 尝试远程UI识别服务
  try {
    console.log('🔄 连接远程UI识别服务...');
    const response = await fetch('http://localhost:8899/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ 远程UI识别服务响应成功');
      return result;
    } else {
      console.log('⚠️ 远程UI识别服务响应错误:', response.status, response.statusText);
    }
  } catch (error) {
    console.log('⚠️ 远程UI识别服务不可用:', error.message);
  }

  throw new Error('所有UI识别服务都不可用');
}

/**
 * 查找搜索结果容器
 */
function findSearchResultsContainer(elements) {
  // 寻找包含多个商品的容器
  const containers = elements.filter(el =>
    el.label && (
      el.label.includes('搜索结果') ||
      el.label.includes('商品列表') ||
      el.label.includes('结果列表') ||
      el.label.includes('container') ||
      el.label.includes('列表')
    )
  );

  if (containers.length > 0) {
    return containers[0];
  }

  // 如果没有找到明确的容器，寻找最大的元素
  const largeElements = elements.filter(el =>
    el.bbox &&
    (el.bbox.x2 - el.bbox.x1) > 500 &&
    (el.bbox.y2 - el.bbox.y1) > 400
  );

  return largeElements.length > 0 ? largeElements[0] : null;
}

/**
 * 查找第一个商品
 */
function findFirstProduct(elements) {
  const products = elements.filter(el =>
    el.label && (
      el.label.includes('商品') ||
      el.label.includes('产品') ||
      el.label.includes('item') ||
      el.label.includes('product')
    )
  );

  if (products.length > 0) {
    return products[0];
  }

  // 如果没有找到明确的商品，寻找符合商品尺寸的元素
  const productSizeElements = elements.filter(el =>
    el.bbox &&
    (el.bbox.x2 - el.bbox.x1) > 150 &&
    (el.bbox.x2 - el.bbox.x1) < 400 &&
    (el.bbox.y2 - el.bbox.y1) > 200 &&
    (el.bbox.y2 - el.bbox.y1) < 500
  );

  return productSizeElements.length > 0 ? productSizeElements[0] : null;
}


// 执行脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  integratedScreenshotAndUIRecognition()
    .then(result => {
      console.log('\n🎉 集成截图和UI识别完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 执行失败:', error);
      process.exit(1);
    });
}

export { integratedScreenshotAndUIRecognition };