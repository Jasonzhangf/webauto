#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * visit-safe-detail-urls.mjs
 *
 * 功能：
 * 1. 从 Phase2-4 生成的 safe-detail-urls.jsonl 中读取带 xsec_token 的详情链接
 * 2. 通过 SearchGate (/permit) 控制访问频率（同一 profile 默认 60s 内最多 2 次）
 * 3. 在获得许可后，以受控速度对每个链接发起一次 HTTP 访问，用于验证是否可正常打开详情页
 *
 * 说明：
 * - 仅做「频率控制 + 可达性验证」，不直接驱动浏览器页面跳转
 * - 期望配合现有的 Phase3/Phase4 逻辑，在确认这些链接整体安全后，再设计基于容器点击的采集流程
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import { parseHTML } from 'linkedom';

const PLATFORM = 'xiaohongshu';
const DEFAULT_ENV = 'debug';
const DEFAULT_PROFILE = 'xiaohongshu_fresh';

const DEFAULT_GATE_PORT = process.env.WEBAUTO_SEARCH_GATE_PORT || '7790';
const DEFAULT_GATE_BASE = `http://127.0.0.1:${DEFAULT_GATE_PORT}`;
const DEFAULT_GATE_URL = process.env.WEBAUTO_SEARCH_GATE_URL || `${DEFAULT_GATE_BASE}/permit`;

function resolveArgs() {
  const argv = minimist(process.argv.slice(2));

  const keywordFromFlag = argv.keyword || argv.k;
  const keywordFromPositional =
    Array.isArray(argv._) && argv._.length > 0 ? argv._[argv._.length - 1] : undefined;
  const keywordCandidate = keywordFromFlag || keywordFromPositional;

  if (!keywordCandidate || typeof keywordCandidate !== 'string' || !keywordCandidate.trim()) {
    console.error('❌ 必须指定 keyword，例如:');
    console.error('   node scripts/xiaohongshu/tests/visit-safe-detail-urls.mjs --keyword "手机膜"');
    process.exit(1);
  }

  const env = typeof argv.env === 'string' && argv.env.trim() ? argv.env.trim() : DEFAULT_ENV;
  const profile =
    typeof argv.profile === 'string' && argv.profile.trim()
      ? argv.profile.trim()
      : DEFAULT_PROFILE;

  const limitRaw = argv.limit ?? argv.max ?? argv.n;
  let limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = undefined;
  } else {
    limit = Math.floor(limit);
  }

  const engineRaw = argv.engine || argv.mode || 'http';
  const engine = typeof engineRaw === 'string' && engineRaw.toLowerCase() === 'camoufox'
    ? 'camoufox'
    : 'http';

  return {
    keyword: keywordCandidate.trim(),
    env,
    profile,
    limit,
    engine,
  };
}

function resolveIndexPath(env, keyword) {
  const home = process.env.HOME || os.homedir();
  return path.join(
    home,
    '.webauto',
    'download',
    PLATFORM,
    env,
    keyword,
    'safe-detail-urls.jsonl',
  );
}

async function loadSafeDetailEntries(indexPath) {
  let content;
  try {
    content = await fs.promises.readFile(indexPath, 'utf8');
  } catch (err) {
    console.error(`❌ 无法读取 safe-detail-urls 文件: ${indexPath}`);
    console.error(`   错误: ${err?.message || String(err)}`);
    console.error('💡 请先运行 Phase2-4 采集脚本生成该文件：');
    console.error('   node scripts/xiaohongshu/tests/legacy/phase2-4-loop.mjs --keyword "<关键词>"');
    process.exit(1);
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const url = obj.safeDetailUrl || obj.detailUrl || '';
      if (typeof url !== 'string' || !url) continue;
      // 只保留包含 xsec_token 的小红书链接（允许相对路径 /search_result/... 或 /explore/...）
      if (!url.includes('xsec_token=')) continue;
      const isXhsPath =
        url.includes('xiaohongshu.com') ||
        url.startsWith('/explore/') ||
        url.startsWith('/search_result/');
      if (!isXhsPath) continue;
      entries.push({
        noteId: obj.noteId || '',
        title: obj.title || '',
        safeDetailUrl: url,
      });
    } catch (err) {
      console.warn('⚠️ 跳过无法解析的行:', err?.message || String(err));
      continue;
    }
  }

  if (entries.length === 0) {
    console.warn('⚠️ safe-detail-urls 文件中未找到任何带 xsec_token 的链接');
  }

  return entries;
}

async function checkSearchGateHealth() {
  const healthUrl = DEFAULT_GATE_URL.replace(/\/permit$/, '/health');
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
    });
    if (!res.ok) {
      console.warn(`⚠️ SearchGate 健康检查失败: HTTP ${res.status}`);
      return false;
    }
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) {
      console.warn('⚠️ SearchGate /health 返回 ok=false');
      return false;
    }
    console.log(`✅ SearchGate 在线: ${healthUrl}`);
    return true;
  } catch (err) {
    console.warn('⚠️ 无法连接 SearchGate:', err?.message || String(err));
    console.warn('💡 请先在另一个终端启动: node scripts/search-gate-server.mjs');
    return false;
  }
}

async function requestPermit(profile, noteId) {
  const body = {
    profileId: profile,
    // 可选：附加当前 noteId 仅用于日志追踪
    noteId,
  };

  const res = await fetch(DEFAULT_GATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`SearchGate 返回错误: ${data.error || 'unknown error'}`);
  }
  return data;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const CAMOUFOX_PROBE_PATH = path.join(
  repoRoot,
  'runtime',
  'browser',
  'scripts',
  'xhs_camoufox_detail_probe.py',
);

async function runCamoufoxProbe(url, noteId) {
  return new Promise((resolve) => {
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const args = [CAMOUFOX_PROBE_PATH, '--url', url];
    if (noteId) {
      args.push('--note-id', String(noteId));
    }
    // 默认使用 headless 模式，避免弹窗干扰
    args.push('--headless');

    const child = spawn(pythonBin, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (stderr.trim()) {
        console.log(`   [camoufox stderr] ${stderr.trim()}`);
      }
      if (code !== 0) {
        console.error(`   ❌ Camoufox 探测器退出码 ${code}`);
        resolve({ ok: false, error: `exit_code_${code}`, raw: stdout.trim() });
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
      if (!line) {
        resolve({ ok: false, error: 'empty_output' });
        return;
      }
      try {
        const parsed = JSON.parse(line);
        resolve(parsed);
      } catch (err) {
        console.error('   ❌ 解析 Camoufox 探测结果失败:', err?.message || String(err));
        resolve({ ok: false, error: 'json_parse_error', raw: line });
      }
    });
  });
}

function analyzeHtmlForAnchors(html, finalUrl) {
  try {
    const { document } = parseHTML(html || '');

    const text = (document.textContent || '').toLowerCase();

    // Phase3 入口锚点：详情页核心区域
    const detailSelector =
      '.note-detail-mask, .note-detail-page, .note-detail-dialog, .note-detail, .detail-container, .media-container';
    const detailEl = document.querySelector(detailSelector);
    const hasDetailAnchor = !!detailEl;

    // Phase4 入口锚点：评论区根容器
    const commentsSelector =
      '.comments-el, .comment-list, .comments-container, [class*="comment-section"]';
    const commentsRoot = document.querySelector(commentsSelector);
    const hasCommentsAnchor = !!commentsRoot;

    // 风控锚点：二维码风控页
    const riskSelector = '.qrcode-box, .qrcode-img, .tip-text';
    const riskEl = document.querySelector(riskSelector);
    const hasRiskDom = !!riskEl;

    const hasRiskKeywords =
      text.includes('风控') ||
      text.includes('验证码') ||
      text.includes('扫码') ||
      text.includes('qrcode') ||
      text.includes('error_code');

    const isRiskControl = hasRiskDom || hasRiskKeywords;

    const urlHasDetailPattern =
      typeof finalUrl === 'string' &&
      /\/explore\/[0-9a-z]+/i.test(finalUrl) &&
      /[?&]xsec_token=/.test(finalUrl);

    return {
      hasDetailAnchor,
      hasCommentsAnchor,
      isRiskControl,
      urlHasDetailPattern,
    };
  } catch (err) {
    console.warn('   ⚠️ HTML 解析失败，无法检测锚点:', err?.message || String(err));
    return {
      hasDetailAnchor: false,
      hasCommentsAnchor: false,
      isRiskControl: false,
      urlHasDetailPattern: false,
    };
  }
}

async function visitDetailUrl(url) {
  const targetUrl =
    typeof url === 'string' && /^https?:\/\//i.test(url)
      ? url
      : `https://www.xiaohongshu.com${url}`;

  console.log(`   🌐 访问: ${targetUrl}`);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      // 只作为连通性验证，超时保持较短
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });

    const finalUrl = res.url || url;
    const status = res.status;

    console.log(
      `   ✅ 响应: HTTP ${status} ${res.statusText || ''} -> 最终 URL: ${finalUrl}`,
    );

    const html = await res.text().catch(() => '');
    const anchorInfo = analyzeHtmlForAnchors(html, finalUrl);

    if (anchorInfo.isRiskControl) {
      console.log('   🚨 检测到可能的风控页面（二维码/验证码）');
    }

    if (!anchorInfo.urlHasDetailPattern) {
      console.log('   ⚠️ 最终 URL 未匹配 /explore/{noteId}?xsec_token=... 模式');
    }

    // Phase3：详情入口锚点检查
    if (anchorInfo.hasDetailAnchor) {
      console.log('   ✅ Phase3 入口锚点命中（详情容器存在）');
    } else {
      console.log('   ⚠️ Phase3 入口锚点未命中（未检测到详情容器），跳过 Phase4 检查');
      return;
    }

    // Phase4：评论入口锚点检查（仅在详情锚点命中时继续）
    if (anchorInfo.hasCommentsAnchor) {
      console.log('   ✅ Phase4 入口锚点命中（评论区容器存在）');
    } else {
      console.log('   ⚠️ Phase4 入口锚点未命中（未检测到评论区容器）');
    }
  } catch (err) {
    console.error(`   ❌ 访问失败: ${err?.message || String(err)}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { keyword, env, profile, limit, engine } = resolveArgs();
  console.log('🔗 visit-safe-detail-urls.mjs');
  console.log(`   平台: ${PLATFORM}`);
  console.log(`   env: ${env}`);
  console.log(`   profile: ${profile}`);
  console.log(`   keyword: ${keyword}`);
  console.log(`   engine: ${engine}`);
  if (limit) {
    console.log(`   limit: ${limit} 条`);
  }
  console.log('');

  const indexPath = resolveIndexPath(env, keyword);
  console.log(`📄 读取 safe-detail-urls 文件: ${indexPath}`);

  const entries = await loadSafeDetailEntries(indexPath);
  if (!entries.length) {
    console.log('⚠️ 没有可用的 safeDetailUrl，脚本结束');
    return;
  }

  const total = limit ? Math.min(limit, entries.length) : entries.length;
  console.log(`✅ 共找到 ${entries.length} 条带 xsec_token 的链接，将尝试访问前 ${total} 条`);

  const gateOk = await checkSearchGateHealth();
  if (!gateOk) {
    console.error('❌ SearchGate 未就绪，无法安全控制访问频率');
    process.exit(1);
  }

  console.log('\n🚦 开始按 SearchGate 节流规则访问链接（默认：同一 profile 每 60s 最多 2 次）\n');

  for (let i = 0; i < total; i += 1) {
    const entry = entries[i];
    const label = `#${i + 1}/${total}`;

    console.log(`\n[${label}] noteId=${entry.noteId || '未知'} title=${entry.title || '无标题'}`);

    // 1. 向 SearchGate 申请许可
    let permit;
    try {
      permit = await requestPermit(profile, entry.noteId || '');
    } catch (err) {
      console.error(`   ❌ 向 SearchGate 申请许可失败: ${err?.message || String(err)}`);
      continue;
    }

    if (!permit.allowed) {
      const waitSec = Math.ceil((permit.waitMs || 0) / 1000);
      console.log(
        `   ⏳ 当前已超出速率限制，需等待约 ${waitSec}s (countInWindow=${permit.countInWindow}/${permit.maxCount})`,
      );
      const waitMs = Math.max(permit.waitMs || 0, 1000);
      await delay(waitMs);

      // 再尝试一次
      try {
        permit = await requestPermit(profile, entry.noteId || '');
      } catch (err) {
        console.error(`   ❌ 重试申请许可失败: ${err?.message || String(err)}`);
        continue;
      }

      if (!permit.allowed) {
        console.log(
          '   ⚠️ 重试后仍未获得许可，跳过当前链接，避免过于频繁访问导致风控',
        );
        continue;
      }
    }

    console.log(
      `   ✅ 已获得访问许可 (countInWindow=${permit.countInWindow}/${permit.maxCount})`,
    );

    // 2. 在获得许可后访问链接（根据 engine 切换实际访问实现）
    if (engine === 'camoufox') {
      console.log('   🦊 使用 Camoufox 探测单页锚点和风控...');
      const probe = await runCamoufoxProbe(entry.safeDetailUrl, entry.noteId || '');

      if (!probe || probe.ok === false) {
        console.log(
          `   ❌ Camoufox 探测失败: ${probe?.error || 'unknown error'}${
            probe?.raw ? ` (${String(probe.raw).slice(0, 200)})` : ''
          }`,
        );
      } else {
        const anchors = probe.anchors || {};
        if (anchors.isRiskControl) {
          console.log('   🚨 Camoufox 检测到风控页面');
        }
        if (anchors.hasDetailAnchor) {
          console.log('   ✅ Camoufox Phase3 入口锚点命中（详情容器存在）');
        } else {
          console.log('   ⚠️ Camoufox Phase3 入口锚点未命中（未检测到详情容器）');
        }
        if (anchors.hasDetailAnchor && anchors.hasCommentsAnchor) {
          console.log('   ✅ Camoufox Phase4 入口锚点命中（评论区容器存在）');
        } else if (anchors.hasDetailAnchor) {
          console.log('   ⚠️ Camoufox Phase4 入口锚点未命中（未检测到评论区容器）');
        }
      }
    } else {
      await visitDetailUrl(entry.safeDetailUrl);
    }

    // 3. 额外增加一个小间隔，让行为更接近真实用户
    await delay(2000);
  }

  console.log('\n✅ 所有目标链接处理完成');
}

main().catch((err) => {
  console.error('❌ 未捕获错误:', err?.message || err);
  process.exit(1);
});
