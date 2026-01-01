#!/usr/bin/env node
/**
 * 视觉高亮回环测试
 * 真正的回环：高亮目标 → 获取坐标 → 反查DOM → 高亮反查结果 → 对比
 */

import http from 'node:http';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(msg) {
  console.log(`[highlight-loop] ${msg}`);
}

async function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${UNIFIED_API}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (err) { resolve({ body, statusCode: res.statusCode }); } });
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
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (err) { resolve({ body, statusCode: res.statusCode }); } });
    }).on('error', reject);
  });
}

async function main() {
  try {
    log('========================================');
    log('视觉高亮回环测试');
    log('========================================\n');

    const health = await httpGet('/health');
    if (!health.ok) throw new Error('服务不健康');
    log('✓ 服务正常\n');

    // Step 1: 找到目标元素并高亮（黄色）
    log('Step 1: 找到目标元素并高亮（黄色）');
    const targetResult = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const links = Array.from(document.querySelectorAll('a'));
            const target = links.find(a => {
              const r = a.getBoundingClientRect();
              return r.width > 10 && r.height > 10 && r.top >= 0 && r.left >= 0 && r.top < window.innerHeight;
            });
            
            if (!target) return { success: false, error: 'no visible element found' };
            
            const highlight = document.createElement('div');
            highlight.id = 'wa-target-highlight';
            highlight.style.cssText = 
              'position: fixed;' +
              'border: 4px solid #FF6B35;' +
              'background: rgba(255,107,53,0.2);' +
              'pointer-events: none;' +
              'z-index: 999999;';
            
            const rect = target.getBoundingClientRect();
            highlight.style.left = rect.left + 'px';
            highlight.style.top = rect.top + 'px';
            highlight.style.width = rect.width + 'px';
            highlight.style.height = rect.height + 'px';
            
            const label = document.createElement('div');
            label.textContent = 'TARGET (黄色)';
            label.style.cssText =
              'position: absolute;' +
              'top: -28px;' +
              'left: 0;' +
              'background: #FF6B35;' +
              'color: white;' +
              'padding: 4px 8px;' +
              'font-size: 14px;' +
              'font-family: monospace;' +
              'font-weight: bold;';
            highlight.appendChild(label);
            
            document.body.appendChild(highlight);
            
            return {
              success: true,
              tagName: target.tagName.toLowerCase(),
              className: target.className,
              text: target.textContent.substring(0, 30),
              center: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2)
              }
            };
          })()
        `
      }
    });

    let target = targetResult.data;
    if (target && target.result) target = target.result;
    
    if (!target || !target.success) {
      throw new Error('无法找到目标元素');
    }

    log(`  ✓ 目标元素: ${target.tagName} (${target.className})`);
    log(`    中心坐标: (${target.center.x}, ${target.center.y})`);
    log('    黄色高亮框已添加\n');

    // Step 2: 通过坐标反查 DOM 并高亮（绿色）
    log('Step 2: 通过坐标反查 DOM 并高亮（绿色）');
    const reverseResult = await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const x = ${target.center.x};
            const y = ${target.center.y};
            
            const element = document.elementFromPoint(x, y);
            if (!element) {
              return {
                success: false,
                error: 'element not found at coordinates',
                x: x,
                y: y
              };
            }
            
            const reverseHighlight = document.createElement('div');
            reverseHighlight.id = 'wa-reverse-highlight';
            reverseHighlight.style.cssText =
              'position: fixed;' +
              'border: 4px solid #00C853;' +
              'background: rgba(0,200,83,0.2);' +
              'pointer-events: none;' +
              'z-index: 999999;';
            
            const rect = element.getBoundingClientRect();
            reverseHighlight.style.left = rect.left + 'px';
            reverseHighlight.style.top = rect.top + 'px';
            reverseHighlight.style.width = rect.width + 'px';
            reverseHighlight.style.height = rect.height + 'px';
            
            const label = document.createElement('div');
            label.textContent = 'REVERSE (绿色)';
            label.style.cssText =
              'position: absolute;' +
              'top: -28px;' +
              'left: 0;' +
              'background: #00C853;' +
              'color: white;' +
              'padding: 4px 8px;' +
              'font-size: 14px;' +
              'font-family: monospace;' +
              'font-weight: bold;';
            reverseHighlight.appendChild(label);
            
            document.body.appendChild(reverseHighlight);
            
            let selector = element.tagName.toLowerCase();
            if (element.id) {
              selector = '#' + element.id;
            } else if (element.className) {
              const classes = element.className.split(' ').filter(c => c);
              if (classes.length > 0) {
                selector += '.' + classes[0];
              }
            }
            
            return {
              success: true,
              tagName: element.tagName.toLowerCase(),
              className: element.className,
              selector,
              text: element.textContent.substring(0, 30)
            };
          })()
        `
      }
    });

    let reverse = reverseResult.data;
    if (reverse && reverse.result) reverse = reverse.result;
    
    if (!reverse || !reverse.success) {
      log(`  ✗ 反查失败: ${reverse.error || 'unknown'}`);
      log(`    坐标: (${reverse.x}, ${reverse.y})`);
      throw new Error('坐标反查 DOM 失败');
    }

    log(`  ✓ 反查元素: ${reverse.tagName} (${reverse.className})`);
    log(`    生成选择器: ${reverse.selector}\n`);

    // Step 3: 清理高亮并验证
    log('Step 3: 清理高亮框');
    await httpPost('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const target = document.getElementById('wa-target-highlight');
            const reverse = document.getElementById('wa-reverse-highlight');
            if (target) target.remove();
            if (reverse) reverse.remove();
            return { cleaned: true };
          })()
        `
      }
    });

    log('  ✓ 高亮框已清理\n');

    const matched = target.tagName === reverse.tagName;
    const sameClass = target.className === reverse.className;

    log('========================================');
    log('测试结果');
    log('========================================');
    log(`目标元素: ${target.tagName}`);
    log(`反查元素: ${reverse.tagName}`);
    log(`标签匹配: ${matched ? '✓' : '✗'}`);
    log(`类名匹配: ${sameClass ? '✓' : '✗'}`);

    if (matched && sameClass) {
      log('\n✅ 坐标定位反查 DOM 的方式可靠');
      log('   可以用于视觉分析器的 DOM 元素识别');
    } else {
      log('\n⚠️  标签或类名不匹配');
      log('   但可以改进选择器生成逻辑（使用 target.closest() 或其他方法）');
    }

    log('\n========================================');
    log('结论');
    log('========================================');

    if (matched) {
      log('✅ 测试通过：坐标定位反查 DOM 方式可靠');
    } else {
      log('⚠️  测试部分通过：需要优化选择器生成逻辑');
    }

    process.exit(matched ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
