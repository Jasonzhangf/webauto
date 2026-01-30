#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 从小红书 Note fixture 生成本地仿真详情页 HTML
 *
 * 输入：
 *   ~/.webauto/fixtures/xiaohongshu/note-{noteId}.json
 * 输出：
 *   默认：~/.webauto/fixtures/xiaohongshu/detail-{noteId}.html
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import minimist from 'minimist';

async function main() {
  const args = minimist(process.argv.slice(2));
  const noteId = args.noteId || args.id;

  if (!noteId) {
    console.error('Usage: generate-detail-mock-page.mjs --noteId <noteId> [--output <path>]');
    process.exit(1);
  }

  const homeDir = os.homedir();
  const fixturesDir = path.join(homeDir, '.webauto', 'fixtures', 'xiaohongshu');
  const fixturePath = path.join(fixturesDir, `note-${noteId}.json`);

  let raw;
  try {
    raw = await fs.readFile(fixturePath, 'utf-8');
  } catch (err) {
    console.error(`[XHS Mock] Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (err) {
    console.error(
      `[XHS Mock] Invalid JSON in fixture: ${err && err.message ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  const data = fixture.data || fixture;
  const detail = data.detail || {};
  const commentsResult = data.commentsResult || {};
  const comments = Array.isArray(commentsResult.comments) ? commentsResult.comments : [];

  const title =
    detail.title ||
    detail.note_title ||
    detail.header?.title ||
    detail.content?.title ||
    `Mock Note ${noteId}`;

  const contentText =
    detail.contentText ||
    detail.content?.text ||
    detail.content?.desc ||
    detail.content?.content ||
    '';

  const images = Array.isArray(detail?.gallery?.images) ? detail.gallery.images : [];

  const htmlParts = [];

  htmlParts.push('<!DOCTYPE html>');
  htmlParts.push('<html lang="zh-CN">');
  htmlParts.push('<head>');
  htmlParts.push('  <meta charset="utf-8" />');
  htmlParts.push(`  <title>${escapeHtml(title)}</title>`);
  htmlParts.push('  <style>');
  htmlParts.push('    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin: 0; padding: 0; background: #f5f5f5; }');
  htmlParts.push('    .note-detail-mask { position: relative; margin: 40px auto; max-width: 960px; background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }');
  htmlParts.push('    .author-container { display: flex; align-items: center; margin-bottom: 16px; }');
  htmlParts.push('    .author-container .user-name { font-weight: 600; margin-right: 8px; }');
  htmlParts.push('    .note-content { margin-bottom: 16px; line-height: 1.6; }');
  htmlParts.push('    .media-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }');
  htmlParts.push('    .media-container img { max-width: 220px; border-radius: 4px; }');
  htmlParts.push('    .comments-el { border-top: 1px solid #eee; padding-top: 16px; max-height: 480px; overflow-y: auto; }');
  htmlParts.push('    .comment-item { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }');
  htmlParts.push('    .comment-item .user-name { font-weight: 500; margin-right: 4px; }');
  htmlParts.push('    .comment-item .content { display: block; margin-top: 4px; }');
  htmlParts.push('    .comment-item .time { font-size: 12px; color: #999; }');
  htmlParts.push('    .show-more { display: block; padding: 8px 0; color: #1976d2; cursor: pointer; text-align: center; }');
  htmlParts.push('    .end-container { text-align: center; color: #999; padding: 8px 0; font-size: 12px; }');
  htmlParts.push('  </style>');
  htmlParts.push('</head>');
  htmlParts.push('<body>');

  htmlParts.push('  <div class="note-detail-mask">');

  // header
  htmlParts.push('    <div class="author-container">');
  const author =
    detail.author ||
    detail.header?.author ||
    detail.header?.user_name ||
    detail.header?.nickname ||
    '';
  if (author) {
    htmlParts.push(`      <span class="user-name">${escapeHtml(author)}</span>`);
  } else {
    htmlParts.push('      <span class="user-name">Mock 用户</span>');
  }
  htmlParts.push('    </div>');

  // content
  htmlParts.push('    <div class="note-content">');
  if (title) {
    htmlParts.push(`      <h1 class="title">${escapeHtml(title)}</h1>`);
  }
  if (contentText) {
    htmlParts.push(`      <p class="content">${escapeHtml(contentText)}</p>`);
  }
  htmlParts.push('    </div>');

  // gallery
  htmlParts.push('    <div class="media-container">');
  for (const src of images) {
    const safeSrc = typeof src === 'string' ? src : '';
    if (!safeSrc) continue;
    htmlParts.push(
      `      <div class="note-img"><img src="${escapeAttribute(
        safeSrc,
      )}" alt="image" /></div>`,
    );
  }
  htmlParts.push('    </div>');

  // comments section
  htmlParts.push('    <div class="comments-el">');

  const batchSize = 20;
  const firstBatch = comments.slice(0, batchSize);
  const remaining = comments.slice(batchSize);

  // first visible batch
  for (const c of firstBatch) {
    htmlParts.push(renderCommentItem(c));
  }

  if (remaining.length > 0) {
    // show-more + hidden block
    htmlParts.push('      <div class="show-more">展开更多评论</div>');
    htmlParts.push('      <div class="comment-more-block" style="display:none">');
    for (const c of remaining) {
      htmlParts.push(renderCommentItem(c));
    }
    htmlParts.push('      </div>');
  } else {
    htmlParts.push('      <div class="end-container">已经到底了</div>');
  }

  htmlParts.push('    </div>'); // comments-el

  htmlParts.push('  </div>'); // note-detail-mask

  // simple show-more script
  htmlParts.push('<script>');
  htmlParts.push('document.addEventListener("click", (e) => {');
  htmlParts.push('  const btn = e.target.closest(".show-more");');
  htmlParts.push('  if (!btn) return;');
  htmlParts.push('  const block = btn.nextElementSibling;');
  htmlParts.push('  if (block) {');
  htmlParts.push('    block.style.display = "block";');
  htmlParts.push('    btn.remove();');
  htmlParts.push('  }');
  htmlParts.push('});');
  htmlParts.push('</script>');

  htmlParts.push('</body>');
  htmlParts.push('</html>');

  const html = htmlParts.join('\n');

  const outputPath =
    args.output ||
    path.join(fixturesDir, `detail-${noteId}.html`);

  await fs.writeFile(outputPath, html, 'utf-8');
  console.log(`[XHS Mock] Generated mock detail page: ${outputPath}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function renderCommentItem(c) {
  if (!c) return '';
  const user = c.user_name || c.username || '未知用户';
  const uid = c.user_id || '';
  const ts = c.timestamp || '';
  const text = c.text || '';
  const userIdAttr = uid ? ` data-user-id="${escapeAttribute(uid)}"` : '';
  const timeSpan = ts ? `<span class="time">${escapeHtml(ts)}</span>` : '';
  return [
    '      <div class="comment-item">',
    `        <span class="user-name"${userIdAttr}>${escapeHtml(user)}</span>`,
    timeSpan ? `        ${timeSpan}` : '',
    `        <span class="content">${escapeHtml(text)}</span>`,
    '      </div>',
  ]
    .filter(Boolean)
    .join('\n');
}

main().catch((err) => {
  console.error('[XHS Mock] Unexpected error:', err);
  process.exit(1);
});
