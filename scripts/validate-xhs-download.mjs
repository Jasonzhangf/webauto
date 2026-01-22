import minimist from 'minimist';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

function sanitizeForPath(name) {
  if (!name) return '';
  return String(name).replace(/[\\/:"*?<>|]+/g, '_').trim();
}

function decodeRepeated(value, maxRounds = 4) {
  let current = String(value || '');
  for (let i = 0; i < maxRounds; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function parseCommentsStats(text) {
  const m = text.match(/评论统计:\\s*抓取=(\\d+),\\s*header=([^（\\n]+)/);
  if (!m) return { fetched: null, header: null };
  const fetched = Number(m[1]);
  const headerRaw = String(m[2] || '').trim();
  const header = /^\\d+$/.test(headerRaw) ? Number(headerRaw) : null;
  return {
    fetched: Number.isFinite(fetched) ? fetched : null,
    header: Number.isFinite(header) ? header : null,
  };
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const platform = typeof args.platform === 'string' && args.platform.trim() ? String(args.platform).trim() : 'xiaohongshu';
  const env = typeof args.env === 'string' && args.env.trim() ? String(args.env).trim() : 'debug';
  const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
  const count = Number(args.count || 0);
  const linksCount = Number(args.linksCount || 0);
  const minCoverage = typeof args.minCoverage === 'number' ? args.minCoverage : Number(args.minCoverage || 0.9);

  if (args.help || args.h) {
    console.log(`Usage:
  node scripts/validate-xhs-download.mjs --keyword "<kw>" --count 50 [--env debug] [--minCoverage 0.9] [--linksCount <n>]
`);
    return;
  }
  if (!keyword) throw new Error('Missing --keyword');
  if (!Number.isFinite(count) || count <= 0) throw new Error('Missing/invalid --count');

  const home = os.homedir();
  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const base = path.join(home, '.webauto', 'download', platform, env, safeKeyword);
  const linksPath = path.join(base, 'phase2-links.jsonl');

  const linksText = await fs.readFile(linksPath, 'utf8');
  const links = linksText
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  if (Number.isFinite(linksCount) && linksCount > 0) {
    if (links.length !== linksCount) {
      throw new Error(`phase2-links lines mismatch: got=${links.length} expected=${linksCount}`);
    }
  } else if (links.length < count) {
    throw new Error(`phase2-links lines too few: got=${links.length} need>=${count}`);
  }

  const searchUrls = new Set(links.map((l) => l.searchUrl));
  if (searchUrls.size !== 1) {
    throw new Error(`Search URL unique mismatch: unique=${searchUrls.size} expected=1`);
  }
  const onlySearchUrl = links[0].searchUrl;
  try {
    const u = new URL(onlySearchUrl);
    const kw = decodeRepeated(u.searchParams.get('keyword') || '');
    if (kw !== keyword) throw new Error(`Search URL keyword mismatch: got="${kw}" expected="${keyword}"`);
  } catch (e) {
    throw new Error(`Invalid Search URL: ${onlySearchUrl}`);
  }

  const entries = await fs.readdir(base, { withFileTypes: true });
  const noteIds = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => name !== '_debug' && name !== '_rejected');
  if (noteIds.length !== count) {
    throw new Error(`note dir count mismatch: got=${noteIds.length} expected=${count}`);
  }

  const bad = [];
  for (const noteId of noteIds) {
    const contentPath = path.join(base, noteId, 'content.md');
    const commentsPath = path.join(base, noteId, 'comments.md');
    if (!(await fileExists(contentPath)) || !(await fileExists(commentsPath))) {
      bad.push({ noteId, reason: 'missing_files' });
      continue;
    }

    const content = await fs.readFile(contentPath, 'utf8');
    const kwLine = (content.match(/^-\\s*关键词:\\s*(.*)$/m) || [])[1];
    if (String(kwLine || '').trim() !== keyword) {
      bad.push({ noteId, reason: 'keyword_mismatch', kw: String(kwLine || '').trim() });
    }

    const linkLine = (content.match(/^-\\s*链接:\\s*(.*)$/m) || [])[1];
    const detailUrl = String(linkLine || '').trim();
    if (!detailUrl.includes('/explore/') || !detailUrl.includes('xsec_token=')) {
      bad.push({ noteId, reason: 'detail_url_missing_token', detailUrl });
    }

    const comments = await fs.readFile(commentsPath, 'utf8');
    const done = comments.includes('reachedEnd=是') || comments.includes('empty=是');
    if (!done) bad.push({ noteId, reason: 'comments_not_done' });

    const stats = parseCommentsStats(comments);
    if (stats.header !== null && stats.header > 0 && stats.fetched !== null) {
      const need = Math.ceil(stats.header * minCoverage);
      if (stats.fetched < need) {
        bad.push({
          noteId,
          reason: 'comments_coverage_low',
          fetched: stats.fetched,
          header: stats.header,
          needAtLeast: need,
        });
      }
    }
  }

  if (bad.length) {
    console.log(JSON.stringify({ ok: false, badCount: bad.length, bad: bad.slice(0, 20) }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify({ ok: true, keyword, env, platform, count, minCoverage, base, searchUrl: onlySearchUrl }, null, 2));
}

main().catch((err) => {
  console.error('[validate-xhs-download] failed:', err?.message || String(err));
  process.exit(1);
});
