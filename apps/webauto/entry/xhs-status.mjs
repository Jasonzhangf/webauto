#!/usr/bin/env node
import minimist from 'minimist';

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function parseIntFlag(value, fallback, min = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

async function fetchJson(baseUrl, pathname) {
  const url = `${baseUrl}${pathname}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${pathname}`);
  }
  return await res.json();
}

function summarizeTasks(tasks = []) {
  const totals = {
    total: tasks.length,
    running: 0,
    queued: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
  };
  const rows = tasks.map((task) => {
    const runId = asText(task?.runId || task?.id || '');
    const status = asText(task?.status || 'unknown').toLowerCase();
    if (status === 'running' || status === 'starting') totals.running += 1;
    else if (status === 'queued' || status === 'pending') totals.queued += 1;
    else if (status === 'completed' || status === 'success' || status === 'succeeded') totals.succeeded += 1;
    else if (status === 'failed' || status === 'error') totals.failed += 1;
    else totals.unknown += 1;

    return {
      runId,
      status,
      phase: asText(task?.phase || task?.lastPhase || ''),
      progress: Number(task?.progress || task?.current || 0) || 0,
      total: Number(task?.total || 0) || 0,
      updatedAt: asText(task?.updatedAt || task?.lastActiveAt || ''),
      error: asText(task?.error || ''),
    };
  });
  return { totals, tasks: rows };
}

function extractErrorEvents(events = [], limit = 20) {
  const items = [];
  for (const event of events) {
    const payload = event?.data && typeof event.data === 'object' ? event.data : event;
    const type = asText(payload?.type || payload?.event || '').toLowerCase();
    const hasErrorType = type.includes('error') || type.includes('fail');
    const errText = asText(payload?.error || payload?.message || payload?.reason || '');
    if (!hasErrorType && !errText) continue;
    items.push({
      ts: asText(payload?.timestamp || payload?.ts || ''),
      type: type || 'error',
      message: errText || asText(payload?.line || ''),
    });
  }
  return items.slice(-Math.max(1, limit));
}

function printHelp() {
  console.log([
    'Usage: node apps/webauto/entry/xhs-status.mjs [options]',
    'Options:',
    '  --run-id <id>    指定 runId 查看详情',
    '  --limit <n>      错误事件数量（默认 20）',
    '  --api <url>      Unified API 地址（默认 http://127.0.0.1:7701）',
    '  --json           JSON 输出',
  ].join('\n'));
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'json'],
    string: ['run-id', 'api'],
    alias: { h: 'help' },
  });
  if (argv.help) {
    printHelp();
    return;
  }

  const baseUrl = asText(argv.api || process.env.WEBAUTO_UNIFIED_API || 'http://127.0.0.1:7701');
  const runId = asText(argv['run-id'] || '');
  const limit = parseIntFlag(argv.limit, 20, 1);

  const tasksRes = await fetchJson(baseUrl, '/api/v1/tasks').catch((error) => ({
    success: false,
    error: error?.message || String(error),
  }));
  if (tasksRes?.success === false && !Array.isArray(tasksRes?.data)) {
    throw new Error(`fetch tasks failed: ${tasksRes?.error || 'unknown'}`);
  }
  const tasks = Array.isArray(tasksRes?.data) ? tasksRes.data : [];
  const summary = summarizeTasks(tasks);

  let detail = null;
  if (runId) {
    const taskRes = await fetchJson(baseUrl, `/api/v1/tasks/${runId}`).catch(() => null);
    const task = taskRes?.data ?? null;
    const eventsRes = await fetchJson(baseUrl, `/api/v1/tasks/${runId}/events`).catch(() => null);
    const events = Array.isArray(eventsRes?.data) ? eventsRes.data : [];
    detail = {
      runId,
      task,
      errorEvents: extractErrorEvents(events, limit),
    };
  }

  const payload = {
    ok: true,
    api: baseUrl,
    generatedAt: new Date().toISOString(),
    summary,
    detail,
  };

  if (argv.json === true) {
    console.log(JSON.stringify(payload));
    return;
  }

  console.log(`[xhs-status] api=${baseUrl}`);
  console.log(`[xhs-status] total=${summary.totals.total} running=${summary.totals.running} queued=${summary.totals.queued} failed=${summary.totals.failed} succeeded=${summary.totals.succeeded}`);
  const top = summary.tasks.slice(0, 10);
  for (const item of top) {
    console.log(`- ${item.runId || '<unknown>'} status=${item.status} phase=${item.phase || '-'} progress=${item.progress}/${item.total || '-'} updatedAt=${item.updatedAt || '-'}`);
    if (item.error) console.log(`  error: ${item.error}`);
  }
  if (detail) {
    console.log(`\n[run ${detail.runId}] errorEvents=${detail.errorEvents.length}`);
    for (const evt of detail.errorEvents) {
      console.log(`- ${evt.ts || '-'} ${evt.type}: ${evt.message || '-'}`);
    }
  }
}

main().catch((error) => {
  console.error(`xhs-status failed: ${error?.message || String(error)}`);
  process.exit(1);
});
