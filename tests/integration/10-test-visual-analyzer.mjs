#!/usr/bin/env node
/**
 * 视觉分析器测试 - 测试坐标定位反查 DOM 的可靠性
 * 
 * 测试流程：
 * 1. 获取页面上已知元素的边界框
 * 2. 通过坐标反查 DOM 元素
 * 3. 验证反查结果是否正确
 */

import assert from 'node:assert/strict';
import http from 'node:http';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(msg) {
  console.log(`[visual-analyzer-test] ${msg}`);
}

async function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${UNIFIED_API}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            resolve({ body, statusCode: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${UNIFIED_API}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          resolve({ body, statusCode: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

/**
 * 测试 1: 获取已知元素的边界框
 */
async function testGetElementBounds() {
  log('Test 1: 获取已知元素的边界框');
  
  const result = await httpPost('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (function() {
          // 获取多个不同类型的元素
          const elements = [
            { name: 'body', selector: 'body' },
            { name: 'main', selector: 'main' },
            { name: 'first-article', selector: 'article:first-of-type' },
            { name: 'first-link', selector: 'a:first-of-type' }
          ];
          
          return elements.map(e => {
            const el = document.querySelector(e.selector);
            if (!el) return null;
            
            const rect = el.getBoundingClientRect();
            return {
              name: e.name,
              selector: e.selector,
              bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              center: {
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2)
              },
              tagName: el.tagName.toLowerCase(),
              className: el.className || '',
              id: el.id || ''
            };
          }).filter(e => e !== null);
        })()
      `
    }
  });
  
  if (!result.success || !result.data) {
    log('  ✗ 获取失败');
    log(`    success: ${result.success}`);
    log(`    data: ${JSON.stringify(result.data)}`);
    throw new Error('Failed to get element bounds');
  }
  
  // 修复：检查返回数据结构
  let elements = result.data;
  if (elements && elements.result) {
    // 如果返回的是 { result: [...] } 结构
    elements = elements.result;
  }
  
  if (!Array.isArray(elements)) {
    log('  ✗ 返回数据不是数组');
    log(`    type: ${typeof elements}`);
    log(`    value: ${JSON.stringify(elements)}`);
    return [];
  }
  
  log(`  ✓ 获取了 ${elements.length} 个元素的边界框`);
  
  elements.forEach(el => {
    log(`  - ${el.name}: ${el.tagName} @ (${el.center.x}, ${el.center.y})`);
    log(`    bounds: ${el.bounds.width}x${el.bounds.height}`);
  });
  
  return elements;
}

/**
 * 测试 2: 通过坐标反查 DOM 元素
 */
async function testFindElementByCoordinates(elements) {
  log('\nTest 2: 通过坐标反查 DOM 元素');
  
  const results = [];
  
  for (const el of elements) {
    const { x, y } = el.center;
    
    const result = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const element = document.elementFromPoint(${x}, ${y});
            if (!element) return null;
            
            // 生成选择器
            function getSelector(el) {
              if (el.id) return '#' + el.id;
              
              let selector = el.tagName.toLowerCase();
              
              // 添加 class
              if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ').filter(c => c && c.length > 0);
                if (classes.length > 0) {
                  // 使用属性选择器匹配动态 class
                  const stableClass = classes.find(c => !(/[A-Z0-9]{5,}/.test(c)));
                  if (stableClass) {
                    selector += '.' + stableClass;
                  } else {
                    const prefix = classes[0].replace(/[_-][A-Z0-9]+$/, '');
                    selector += '[class*="' + prefix + '"]';
                  }
                }
              }
              
              return selector;
            }
            
            // 验证元素是否可见
            function isVisible(el) {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     parseFloat(style.opacity) > 0;
            }
            
            return {
              selector: getSelector(element),
              tagName: element.tagName.toLowerCase(),
              className: element.className || '',
              id: element.id || '',
              textContent: (element.textContent || '').substring(0, 100),
              isVisible: isVisible(element),
              rect: {
                x: Math.round(element.getBoundingClientRect().x),
                y: Math.round(element.getBoundingClientRect().y),
                width: Math.round(element.getBoundingClientRect().width),
                height: Math.round(element.getBoundingClientRect().height)
              }
            };
          })()
        `
      }
    });
    
    if (!result.success || !result.data) {
      log(`  ✗ 坐标 (${x}, ${y}) 反查失败`);
      results.push({ original: el, found: null, matched: false });
      continue;
    }
    
    const found = result.data;
    
    // 验证是否匹配
    const matched = found.tagName === el.tagName;
    
    log(`  ${matched ? '✓' : '✗'} 原始: ${el.name} (${el.tagName})`);
    log(`    坐标: (${x}, ${y})`);
    log(`    反查: ${found.tagName}`);
    log(`    选择器: ${found.selector}`);
    log(`    可见: ${found.isVisible}`);
    
    if (!matched) {
      log(`    ⚠️  标签不匹配！期望 ${el.tagName}，实际 ${found.tagName}`);
    }
    
    results.push({ original: el, found, matched });
  }
  
  return results;
}

async function main() {
  try {
    log('========================================');
    log('视觉分析器可靠性测试');
    log('========================================\n');
    
    // 检查服务健康
    log('检查服务健康...');
    const health = await httpGet('/health');
    if (!health.ok) {
      throw new Error('服务不健康，请先启动: node scripts/start-headful.mjs');
    }
    log('  ✓ 服务正常\n');
    
    // 测试 1: 获取元素边界框
    const elements = await testGetElementBounds();
    
    if (elements.length === 0) {
      log('\n⚠️  无法获取元素，可能页面未完全加载');
      process.exit(1);
    }
    
    // 测试 2: 坐标反查 DOM
    const results = await testFindElementByCoordinates(elements);
    
    // 统计结果
    log('\n========================================');
    log('测试结果统计');
    log('========================================');
    
    const matchedCount = results.filter(r => r.matched).length;
    const totalCount = results.length;
    const accuracy = totalCount > 0 ? (matchedCount / totalCount * 100).toFixed(1) : 0;
    
    log(`总测试数: ${totalCount}`);
    log(`匹配成功: ${matchedCount}`);
    log(`匹配失败: ${totalCount - matchedCount}`);
    log(`准确率: ${accuracy}%`);
    
    if (accuracy < 80) {
      log('\n⚠️  警告: 准确率低于 80%，坐标定位可能不够可靠');
    } else if (accuracy < 100) {
      log('\n✓ 通过: 准确率 >= 80%，基本可靠');
    } else {
      log('\n✅ 完美: 准确率 100%，非常可靠');
    }
    
    log('\n========================================');
    log('结论');
    log('========================================');
    
    if (accuracy >= 80) {
      log('✅ 坐标定位反查 DOM 的方式是可靠的');
      log('   可以用于视觉分析器的 DOM 元素识别');
    } else {
      log('❌ 坐标定位反查 DOM 的方式不够可靠');
      log('   建议优化选择器生成逻辑或使用其他方法');
    }
    
    process.exit(accuracy >= 80 ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
