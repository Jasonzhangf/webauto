#!/usr/bin/env node
/**
 * 简化视觉回环测试 - 验证坐标定位反查 DOM 的可靠性
 * 
 * 测试流程：
 * 1. 获取页面上的 body 元素边界框（滚动到顶部后）
 * 2. 通过坐标反查 DOM
 * 3. 验证反查结果
 */

import assert from 'node:assert/strict';
import http from 'node:http';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(msg) {
  console.log(`[simple-visual-test] ${msg}`);
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

async function main() {
  try {
    log('========================================');
    log('简化视觉回环测试');
    log('========================================\n');
    
    // 检查服务健康
    log('检查服务健康...');
    const health = await httpGet('/health');
    if (!health.ok) {
      throw new Error('服务不健康，请先启动: node scripts/start-headful.mjs');
    }
    log('  ✓ 服务正常\n');
    
    // 获取 body 元素的边界框（确保页面滚动到顶部）
    log('获取 body 元素的边界框...');
    const boundsResult = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            // 滚动到页面顶部
            window.scrollTo(0, 0);
            
            const body = document.body;
            if (!body) return null;
            
            const rect = body.getBoundingClientRect();
            return {
              tagName: body.tagName.toLowerCase(),
              bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },
              center: {
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2)
              }
            };
          })()
        `
      }
    });
    
    if (!boundsResult.success) {
      throw new Error('无法获取 body 元素边界框');
    }
    
    // 检查返回数据结构
    let bounds = boundsResult.data;
    if (bounds && bounds.result) {
      bounds = bounds.result; // 提取实际的数据
    }
    
    if (!bounds || !bounds.center) {
      log('  ✗ 返回数据结构异常');
      log(`    原始数据: ${JSON.stringify(boundsResult.data)}`);
      throw new Error('返回数据结构异常');
    }
    
    log(`  ✓ body 元素: ${bounds.tagName} @ (${bounds.center.x}, ${bounds.center.y})`);
    log(`    bounds: ${bounds.bounds.width}x${bounds.bounds.height}`);
    
    // 通过坐标反查 DOM（使用视口内坐标）
    log('\n通过坐标反查 DOM...');
    const reverseResult = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const x = ${bounds.center.x};
            const y = ${bounds.center.y};
            
            const element = document.elementFromPoint(x, y);
            if (!element) {
              return {
                tagName: 'NOT_FOUND',
                selector: 'NOT_FOUND',
                className: 'NOT_FOUND',
                id: 'NOT_FOUND',
                textContent: 'Element not found at coordinates (' + x + ', ' + y + ')'
              };
            }
            
            // 生成选择器
            function getSelector(el) {
              if (el.id) return '#' + el.id;
              
              let selector = el.tagName.toLowerCase();
              
              if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ').filter(c => c && c.length > 0);
                if (classes.length > 0) {
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
            
            return {
              tagName: element.tagName.toLowerCase(),
              selector: getSelector(element),
              className: element.className || '',
              id: element.id || '',
              textContent: (element.textContent || '').substring(0, 100)
            };
          })()
        `
      }
    });
    
    if (!reverseResult.success || !reverseResult.data) {
      throw new Error('坐标反查 DOM 失败');
    }
    
    const found = reverseResult.data;
    
    if (found.tagName === 'NOT_FOUND') {
      log('  ✗ 坐标反查失败，未找到元素');
      log(`    位置: (${bounds.center.x}, ${bounds.center.y})`);
      log('❌ 坐标定位反查 DOM 的方式不可靠');
      log('\n========================================');
      log('结论');
      log('========================================');
      log('❌ 测试失败: 坐标定位反查 DOM 方式不可靠');
      process.exit(1);
    }
    
    log(`  ✓ 反查结果: ${found.tagName}`);
    log(`    选择器: ${found.selector}`);
    log(`    类名: ${found.className}`);
    
    // 验证结果
    const matched = found.tagName && bounds.tagName && 
                   found.tagName.toLowerCase() === bounds.tagName.toLowerCase();
    log(`\n匹配结果: ${matched ? '✓' : '✗'}`);
    
    if (matched) {
      log('✅ 坐标定位反查 DOM 的方式可靠');
      log('   可以用于视觉分析器的 DOM 元素识别');
    } else {
      log('❌ 坐标定位反查 DOM 的方式不可靠');
      log(`   期望: ${bounds.tagName}, 实际: ${found.tagName}`);
    }
    
    log('\n========================================');
    log('结论');
    log('========================================');
    
    if (matched) {
      log('✅ 测试通过: 坐标定位反查 DOM 方式可靠');
    } else {
      log('❌ 测试失败: 坐标定位反查 DOM 方式不可靠');
    }
    
    process.exit(matched ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
