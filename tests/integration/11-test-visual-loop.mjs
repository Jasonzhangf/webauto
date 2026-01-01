#!/usr/bin/env node
/**
 * 视觉回环测试
 * 流程：
 * 1) 选择已知目标元素并标记（data-wa-target）
 * 2) 获取目标元素的边界框并绘制标记框
 * 3) 根据坐标反查 DOM（elementFromPoint）
 * 4) 高亮反查的 DOM
 * 5) 验证反查结果与原目标一致
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(msg) {
  console.log(`[visual-loop-test] ${msg}`);
}

async function httpPost(pathname, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${UNIFIED_API}${pathname}`,
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

async function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get(`${UNIFIED_API}${pathname}`, (res) => {
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

async function execBrowser(script) {
  const result = await httpPost('/v1/controller/action', {
    action: 'browser:execute',
    payload: { profile: PROFILE, script }
  });

  if (!result.success) {
    throw new Error(`browser:execute failed: ${JSON.stringify(result)}`);
  }

  return result.data;
}

async function highlightSelector(selector, label) {
  await httpPost('/v1/controller/action', {
    action: 'browser:highlight',
    payload: {
      profile: PROFILE,
      selector,
      options: {
        style: '3px solid #00C853',
        duration: 2000,
        sticky: false,
        label
      }
    }
  });
}

async function main() {
  try {
    log('========================================');
    log('视觉回环测试（标记->坐标->DOM）');
    log('========================================\n');

    // 健康检查
    const health = await httpGet('/health');
    if (!health.ok) {
      throw new Error('服务不健康，请先启动: node scripts/start-headful.mjs');
    }
    log('✓ 服务正常');

    // Step 1: 标记目标元素并获取边界框
    log('Step 1: 标记目标元素并获取边界框');
    const targets = await execBrowser(`
      (function() {
        window.scrollTo(0, 0);

        const candidates = [
          { name: 'feed-list', selector: "main[class*='Main_wrap_'] div[class*='Home_feed_']" },
          { name: 'first-post', selector: "article[class*='Feed_wrap_']" },
          { name: 'author-link', selector: "header a[href*='weibo.com']" }
        ];

        const targets = [];

        candidates.forEach((c, idx) => {
          const el = document.querySelector(c.selector);
          if (!el) return;
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.setAttribute('data-wa-target', c.name);

          const rect = el.getBoundingClientRect();
          targets.push({
            name: c.name,
            selector: c.selector,
            tagName: el.tagName.toLowerCase(),
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
          });
        });

        return targets;
      })();
    `);

    if (!Array.isArray(targets) || targets.length === 0) {
      throw new Error('未找到任何目标元素');
    }

    targets.forEach(t => {
      log(`  - ${t.name}: ${t.selector} @ (${t.center.x}, ${t.center.y})`);
    });

    // Step 2: 绘制标记框
    log('Step 2: 绘制标记框');
    await execBrowser(`
      (function() {
        document.querySelectorAll('.wa-visual-loop-box').forEach(el => el.remove());
        const targets = ${JSON.stringify(targets)};
        targets.forEach(t => {
          const div = document.createElement('div');
          div.className = 'wa-visual-loop-box';
          div.style.cssText = 
            'position: fixed;' +
            'left: ' + t.bounds.x + 'px;' +
            'top: ' + t.bounds.y + 'px;' +
            'width: ' + t.bounds.width + 'px;' +
            'height: ' + t.bounds.height + 'px;' +
            'border:3px dashed #FF6B35;' +
            'background: rgba(255,107,53,0.08);' +
            'pointer-events: none;' +
            'z-index: 999999;' +
            'box-sizing: border-box;';
          const label = document.createElement('div');
          label.textContent = t.name;
          label.style.cssText =
            'position: absolute;' +
            'top: -22px;' +
            'left: 0;' +
            'background: #FF6B35;' +
            'color: #fff;' +
            'padding: 2px 6px;' +
            'font-size: 12px;' +
            'border-radius: 3px;' +
            'font-family: monospace;';
          div.appendChild(label);
          document.body.appendChild(div);
        });
        return { marked: targets.length };
      })();
    `);

    log(`  ✓ 标记了 ${targets.length} 个目标`);

    // Step 3: 坐标反查 DOM
    log('Step 3: 坐标反查 DOM');
    const results = [];
    
    for (const t of targets) {
      const found = await execBrowser(`
        (function() {
          const el = document.elementFromPoint(${t.center.x}, ${t.center.y});
          if (!el) return null;
          
          const target = el.closest('[data-wa-target]');
          const tagName = el.tagName.toLowerCase();
          const targetName = target ? target.getAttribute('data-wa-target') : null;
          
          function getSelector(node) {
            if (node.id) return '#' + node.id;
            let sel = node.tagName.toLowerCase();
            if (node.className && typeof node.className === 'string') {
              const classes = node.className.split(' ').filter(Boolean);
              if (classes.length > 0) {
                const stable = classes[0].replace(/[_-][A-Z0-9]+$/, '');
                sel += '[class*="' + stable + '"]';
              }
            }
            return sel;
          }

          return {
            tagName,
            selector: getSelector(el),
            targetName,
            textContent: (el.textContent || '').substring(0, 80)
          };
        })();
      `);

      if (!found) {
        log(`  ✗ 坐标 (${t.center.x}, ${t.center.y}) 未找到元素`);
        results.push({ target: t, found: null, matched: false });
        continue;
      }

      const matched = found.targetName === t.name;
      log(`  ${matched ? '✓' : '✗'} ${t.name} -> ${found.tagName} (${found.selector})`);
      log(`    反查目标: ${found.targetName || 'null'}`);

      // 高亮反查的 DOM
      await highlightSelector(found.selector, `found:${t.name}`);

      results.push({ target: t, found, matched });
    }

    // Step 4: 统计
    log('\n========================================');
    log('测试结果统计');
    log('========================================');

    const matchedCount = results.filter(r => r.matched).length;
    const totalCount = results.length;
    const accuracy = totalCount > 0 ? (matchedCount / totalCount * 100).toFixed(1) : '0';

    log(`总测试数: ${totalCount}`);
    log(`匹配成功: ${matchedCount}`);
    log(`匹配失败: ${totalCount - matchedCount}`);
    log(`准确率: ${accuracy}%`);

    if (Number(accuracy) >= 80) {
      log('✅ 坐标定位反查 DOM 的方式可靠');
    } else {
      log('❌ 坐标定位反查 DOM 的方式不够可靠');
    }

    process.exit(Number(accuracy) >= 80 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
