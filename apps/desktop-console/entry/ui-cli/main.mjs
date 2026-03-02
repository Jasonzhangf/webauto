import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_HTTP_RETRIES,
  DEFAULT_START_HEALTH_TIMEOUT_MS,
  DEFAULT_STATUS_TIMEOUT_MS,
  DEFAULT_ACTION_HTTP_TIMEOUT_MS,
  ROOT,
  parseIntSafe,
  buildUiCliClientMeta,
  resolveEndpoint,
} from './constants.mjs';
import { requestJson, sendAction } from './http.mjs';
import { startConsoleIfNeeded, waitForHealthDown, resolveKnownPid } from './console-control.mjs';
import {
  printOutput,
  runSteps,
  runFullCover,
  resolveStageMode,
  printHelp,
  validateActionMap,
  normalizeActionPayload,
  clipText,
} from './system.mjs';
import { runCommandStream, terminatePid } from './process.mjs';

export async function runUiCli(args) {
  const cmd = String(args._[0] || '').trim();
  if (args.help || !cmd) {
    printHelp();
    return;
  }

  const endpoint = resolveEndpoint(args);
  const needStart = args['auto-start'] || cmd === 'start' || cmd === 'full-cover';
  if (needStart) {
    await startConsoleIfNeeded(args, endpoint);
  }

  if (cmd === 'start') {
    const startWaitMs = parseIntSafe(args.timeout, DEFAULT_START_HEALTH_TIMEOUT_MS);
    const status = await requestJson(endpoint, '/health', {
      timeoutMs: startWaitMs,
      retries: DEFAULT_HTTP_RETRIES,
    });
    if (!status.ok) throw new Error('ui cli bridge not healthy');
    printOutput(args, { ok: true, endpoint, status: status.json });
    return;
  }

  if (cmd === 'status' || cmd === 'snapshot') {
    const pathName = cmd === 'snapshot' ? '/snapshot' : '/health';
    const statusTimeoutMs = parseIntSafe(args.timeout, DEFAULT_STATUS_TIMEOUT_MS);
    const ret = await requestJson(endpoint, pathName, {
      timeoutMs: statusTimeoutMs,
      retries: DEFAULT_HTTP_RETRIES,
    });
    if (!ret.ok) throw new Error(ret.json?.error || `http_${ret.status}`);
    printOutput(args, ret.json);
    return;
  }

  if (cmd === 'stop') {
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close_window', _client: buildUiCliClientMeta('stop') }),
      timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_ACTION_HTTP_TIMEOUT_MS)),
      retries: 0,
    }).catch((error) => ({
      ok: false,
      status: 0,
      json: { ok: false, error: error?.message || String(error) },
    }));
    printOutput(args, ret.json || { ok: false, error: `http_${ret.status}` });
    if (!ret.ok || !ret.json?.ok) process.exit(1);
    return;
  }

  if (cmd === 'restart') {
    const restartReason = String(args.reason || '').trim() || 'ui_cli';
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restart', reason: restartReason, _client: buildUiCliClientMeta('restart') }),
      timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_ACTION_HTTP_TIMEOUT_MS)),
      retries: 0,
    }).catch((error) => ({
      ok: false,
      status: 0,
      json: { ok: false, error: error?.message || String(error) },
    }));
    printOutput(args, ret.json || { ok: false, error: `http_${ret.status}` });
    if (!ret.ok || !ret.json?.ok) process.exit(1);
    return;
  }

  if (cmd === 'run') {
    const filePath = String(args.file || '').trim();
    if (!filePath) throw new Error('missing --file');
    const result = await runSteps(args, endpoint, filePath);
    printOutput(args, result);
    if (!result.ok) process.exit(1);
    return;
  }

  if (cmd === 'stage') {
    const resolved = resolveStageMode(args.mode);
    if (!resolved) throw new Error('stage requires --mode login-collect|login-detail');
    const keyword = String(args.keyword || '').trim();
    if (!keyword) throw new Error('stage requires --keyword');
    const env = String(args.env || 'debug').trim() || 'debug';
    const target = parseIntSafe(args.target ?? args['max-notes'], 30);
    const profile = String(args.profile || '').trim();
    const profiles = String(args.profiles || '').trim();
    const profilepool = String(args.profilepool || '').trim();

    if (resolved.stage === 'links') {
      if (profiles) throw new Error('stage login-collect does not support --profiles');
      if (profilepool) throw new Error('stage login-collect does not support --profilepool');
      if (profile.includes(',')) throw new Error('stage login-collect requires a single --profile');
    }

    const uiTriggerId = `ui-cli-stage-${resolved.mode}-${Date.now()}`;
    const stageArgs = [
      'xhs',
      'unified',
      '--stage',
      resolved.stage,
      '--keyword',
      keyword,
      '--max-notes',
      String(target),
      '--env',
      env,
      '--ui-trigger-id',
      uiTriggerId,
    ];
    if (profile) stageArgs.push('--profile', profile);
    if (profiles) stageArgs.push('--profiles', profiles);
    if (profilepool) stageArgs.push('--profilepool', profilepool);
    if (args.headless === true) stageArgs.push('--headless');
    if (args['dry-run'] === true) stageArgs.push('--dry-run');

    const binPath = path.join(ROOT, 'bin', 'webauto.mjs');
    const relayArgs = [binPath, '--daemon', 'relay', '--', ...stageArgs];
    const timeoutMs = parseIntSafe(args.timeout, 0);
    const result = await runCommandStream(process.execPath, relayArgs, {
      cwd: ROOT,
      timeoutMs,
      forwardOutput: !args.json,
    });
    let relayJson = null;
    try {
      relayJson = JSON.parse(String(result.stdout || '').trim());
    } catch {
      relayJson = null;
    }
    const payload = {
      ok: result.ok,
      mode: resolved.mode,
      stage: resolved.stage,
      keyword,
      env,
      target,
      profile: profile || null,
      profiles: profiles || null,
      profilepool: profilepool || null,
      uiTriggerId,
      command: {
        bin: binPath,
        argv: relayArgs.slice(1),
        cwd: ROOT,
      },
      relay: relayJson,
      stdout: args.json ? clipText(result.stdout) : undefined,
      stderr: args.json ? clipText(result.stderr) : undefined,
      code: result.code ?? null,
      timedOut: result.timedOut === true,
    };
    printOutput(args, payload);
    if (!result.ok) process.exit(1);
    return;
  }

  if (cmd === 'full-cover') {
    const report = await runFullCover(args, endpoint);
    printOutput(args, report);
    if (!report.ok) process.exit(1);
    return;
  }

  if (!validateActionMap(cmd)) {
    printHelp();
    process.exit(2);
  }

  const payload = normalizeActionPayload(cmd, args);
  const ret = await requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, _client: buildUiCliClientMeta(cmd) }),
    timeoutMs: DEFAULT_ACTION_HTTP_TIMEOUT_MS,
    retries: DEFAULT_HTTP_RETRIES,
  });
  if (!ret.ok || !ret.json?.ok) {
    printOutput(args, ret.json || { ok: false, error: `http_${ret.status}` });
    process.exit(1);
  }
  printOutput(args, ret.json);
}
