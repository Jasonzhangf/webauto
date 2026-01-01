#!/usr/bin/env node
/**
 * 视觉定位可靠性测试 - 调试版本
 */

import assert from 'node:assert/strict';
import http from 'node:http';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(msg) {
  console.log(`[visual-robust] ${msg}`);
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
    log('视觉定位可靠性测试');
    log('========================================\n');
    
    const health = await httpGet('/health');
    if (!health.ok) {
      throw new Error('服务不健康，请先启动: node scripts/start-headful.mjs');
    }
    log('✓ 服务正常\n');
    
    // 一体化测试
    log('执行一体化测试...');
    const result = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            window.scrollTo(0, 0);
            const body = document.body;
            if (!body) return { success: false, error: 'body not found' };
            
            const rect = body.getBoundingClientRect();
            const x = Math.round(rect.x);
            const y = Math.round(rect.y);
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            const centerX = Math.round(x + width / 2);
            const centerY = Math.round(y + height / 2);
            
            const element = document.elementFromPoint(centerX, centerY);
            if (!element) {
              return {
                success: false,
                error: 'elementFromPoint returned null',
                original: {
                  tagName: body.tagName.toLowerCase(),
                  x: centerX,
                  y: centerY,
                  rect: { x, y, width, height }
                }
              };
            }
            
            let selector = element.tagName.toLowerCase();
            if (element.id) {
              selector = '#' + element.id;
            } else if (element.className) {
              const classes = element.className.split(' ').filter(c => c);
              if (classes.length > 0) {
                selector = selector + '.' + classes[0];
              }
            }
            
            return {
              success: true,
              original: {
                tagName: body.tagName.toLowerCase(),
                x: centerX,
                y: centerY,
                rect: { x, y, width, height }
              },
              found: {
                tagName: element.tagName.toLowerCase(),
                selector,
                id: element.id || '',
                className: element.className || ''
              },
              matched: element.tagName.toLowerCase() === body.tagName.toLowerCase()
            };
          })()
        `
      }
    });
    
    log(`  success: ${result.success}`);
    log(`  data: ${JSON.stringify(result.data).substring(0, 500)}`);
    
    if (!result.success) {
      log('✗ 测试失败');
      process.exit(1);
    }
    
    let data = result.data;
    if (data && data.result) {
      data = data.result;
    }
    
    if (!data || !data.original) {
      log('✗ 数据结构异常');
      log(`  完整响应: ${JSON.stringify(result.data)}`);
      process.exit(1);
    }
    
    log('✓ 测试成功');
    log(`  原始元素: ${data.original.tagName} @ (${data.original.x}, ${data.original.y})`);
    log(`  反查元素: ${data.found.tagName}`);
    log(`  生成选择器: ${data.found.selector}`);
    log(`  匹配结果: ${data.matched ? '✓' : '✗'}`);
    
    log('\n========================================');
    log('结论');
    log('========================================');
    
    if (data.matched) {
      log('✅ 坐标定位反查 DOM 的方式可靠');
      log('   可以用于视觉分析器的 DOM 元素识别');
      process.exit(0);
    } else {
      log('❌ 坐标定位反查 DOM 的方式不可靠');
      log(`   期望: ${data.original.tagName}, 实际: ${data.found.tagName}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
