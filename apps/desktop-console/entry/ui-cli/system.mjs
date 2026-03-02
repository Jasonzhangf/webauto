import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ACTION_HTTP_TIMEOUT_MS,
  DEFAULT_HTTP_RETRIES,
  DEFAULT_HTTP_TIMEOUT_MS,
  parseIntSafe,
  buildUiCliClientMeta,
} from './constants.mjs';
import { requestJson, sendAction } from './http.mjs';
import { sleep } from './process.mjs';

export function clipText(input, maxLen = 4000) {
  const text = String(input || '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...(+${text.length - maxLen} chars)`;
}

export function printOutput(args, payload) {
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (typeof payload === 'string') {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

export async function runSteps(args, endpoint, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!existsSync(abs)) throw new Error(`steps file not found: ${abs}`);
  const parsed = JSON.parse(readFileSync(abs, 'utf8'));
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  if (steps.length === 0) throw new Error('steps is empty');

  const results = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] || {};
    const action = String(step.action || '').trim();
    if (!action) throw new Error(`step ${i + 1} missing action`);

    if (action === 'sleep') {
      const ms = parseIntSafe(step.ms, 500);
      await sleep(ms);
      const out = { ok: true, action, ms, index: i + 1 };
      results.push(out);
      if (!args.json) console.log(`[ui-cli] step ${i + 1}/${steps.length} sleep ${ms}ms`);
      continue;
    }

    const ret = await sendAction(args, endpoint, step);
    const out = { index: i + 1, action, ok: ret.ok && Boolean(ret.json?.ok), result: ret.json };
    results.push(out);
    if (!out.ok && !args['continue-on-error']) {
      return { ok: false, failedAt: i + 1, results };
    }
  }
  return { ok: true, results };
}

export function outputPathOrDefault(args) {
  const resolved = String(args.output || '').trim();
  if (resolved) return resolved;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), `.tmp/ui-cli-full-cover-${stamp}.json`);
}

export async function runFullCover(args, endpoint) {
  const reportPath = outputPathOrDefault(args);
  const start = Date.now();

  const startRet = await requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', build: args.build === true, install: args.install === true, _client: buildUiCliClientMeta('full-cover') }),
    timeoutMs: DEFAULT_ACTION_HTTP_TIMEOUT_MS,
    retries: 0,
  });
  if (!startRet.ok || !startRet.json?.ok) {
    return {
      ok: false,
      step: 'start',
      reportPath,
      error: startRet.json?.error || `http_${startRet.status}`,
    };
  }

  const statusRet = await requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', _client: buildUiCliClientMeta('full-cover') }),
    timeoutMs: DEFAULT_ACTION_HTTP_TIMEOUT_MS,
    retries: 0,
  });
  if (!statusRet.ok || !statusRet.json?.ok) {
    return {
      ok: false,
      step: 'status',
      reportPath,
      error: statusRet.json?.error || `http_${statusRet.status}`,
    };
  }

  const stopRet = await requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop', _client: buildUiCliClientMeta('full-cover') }),
    timeoutMs: DEFAULT_ACTION_HTTP_TIMEOUT_MS,
    retries: 0,
  });
  if (!stopRet.ok || !stopRet.json?.ok) {
    return {
      ok: false,
      step: 'stop',
      reportPath,
      error: stopRet.json?.error || `http_${stopRet.status}`,
    };
  }

  const report = {
    ok: true,
    reportPath,
    elapsedMs: Date.now() - start,
    steps: {
      start: startRet.json,
      status: statusRet.json,
      stop: stopRet.json,
    },
  };
  try {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  } catch {
    // ignore report write failure
  }
  return report;
}

export function resolveStageMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'login-collect' || raw === 'collect' || raw === 'links') {
    return { mode: 'login-collect', stage: 'links' };
  }
  if (raw === 'login-detail' || raw === 'detail') {
    return { mode: 'login-detail', stage: 'detail' };
  }
  return null;
}

export function printHelp() {
  console.log(`webauto ui cli

Usage:
  webauto ui cli start [--build] [--install]
  webauto ui cli status [--json]
  webauto ui cli snapshot [--json]
  webauto ui cli tab --tab <id|label>
  webauto ui cli click --selector <css>
  webauto ui cli focus --selector <css>
  webauto ui cli input --selector <css> --value <text>
  webauto ui cli select --selector <css> --value <value>
  webauto ui cli press --key <Enter|Escape|...> [--selector <css>]
  webauto ui cli probe [--selector <css>] [--text <contains>] [--exact] [--detailed]
  webauto ui cli click-text --text <button_text> [--selector "button"] [--nth 0]
  webauto ui cli dialogs --value silent|restore
  webauto ui cli wait --selector <css> [--state visible|exists|hidden|text_contains|text_equals|value_equals|not_disabled] [--value <text>] [--timeout 15000] [--interval 250]
  webauto ui cli full-cover [--build] [--install] [--output <report.json>] [--keep-open]
  webauto ui cli stage --mode <login-collect|login-detail> --keyword <kw> [--env <debug|prod>] [--target <n>] [--profile <id>|--profiles <a,b>|--profilepool <prefix>]
  webauto ui cli run --file <steps.json> [--continue-on-error]
  webauto ui cli stop
  webauto ui cli restart [--reason <text>] [--timeout <ms>]

Options:
  --host <host>          UI CLI bridge host (default 127.0.0.1)
  --port <n>             UI CLI bridge port (default 7716)
  --auto-start           未检测到 UI 时自动拉起
  --keep-open            full-cover 完成后不自动关闭 UI
  --json                 输出 JSON

Steps JSON format:
  {
    "steps": [
      { "action": "tab", "tabId": "tasks" },
      { "action": "input", "selector": "#task-keyword", "value": "春晚" },
      { "action": "click", "selector": "#task-run-btn" },
      { "action": "wait", "selector": "#run-id-text", "state": "exists", "timeoutMs": 20000 }
    ]
  }
`);
}

export function validateActionMap(cmd) {
  const actionMap = new Set(['tab', 'click', 'focus', 'input', 'select', 'press', 'wait', 'probe', 'click-text', 'dialogs']);
  return actionMap.has(cmd);
}

export function normalizeActionPayload(cmd, rawArgs) {
  const payload = { action: cmd };
  if (cmd === 'tab') {
    const tabValue = String(rawArgs.tab || '').trim();
    if (tabValue) {
      payload.tabId = tabValue;
      payload.tabLabel = tabValue;
    } else {
      payload.tabLabel = String(rawArgs.label || '').trim();
    }
    if (!payload.tabId && !payload.tabLabel) throw new Error('tab requires --tab or --label');
    return payload;
  }

  if (cmd === 'click-text') payload.action = 'click_text';
  if (rawArgs.selector) payload.selector = String(rawArgs.selector);
  if (rawArgs.value != null) payload.value = String(rawArgs.value);
  if (rawArgs.text != null) payload.text = String(rawArgs.text);
  if (rawArgs.key != null) payload.key = String(rawArgs.key);
  if (rawArgs.state != null) payload.state = String(rawArgs.state);
  if (rawArgs.nth != null) payload.nth = parseIntSafe(rawArgs.nth, 0);
  if (rawArgs.exact === true) payload.exact = true;
  if (rawArgs.timeout != null) payload.timeoutMs = parseIntSafe(rawArgs.timeout, 15000);
  if (rawArgs.interval != null) payload.intervalMs = parseIntSafe(rawArgs.interval, 250);
  if (rawArgs.detailed === true) payload.detailed = true;
  if (cmd === 'dialogs' && !payload.value) {
    throw new Error('dialogs requires --value silent|restore');
  }
  if (cmd === 'click-text' && !payload.text && !payload.value) {
    throw new Error('click-text requires --text');
  }
  if (cmd !== 'press' && cmd !== 'probe' && cmd !== 'click-text' && cmd !== 'dialogs' && !payload.selector && cmd !== 'wait') {
    throw new Error(`${cmd} requires --selector`);
  }
  if (cmd === 'wait' && !payload.selector) {
    throw new Error('wait requires --selector');
  }
  return payload;
}
