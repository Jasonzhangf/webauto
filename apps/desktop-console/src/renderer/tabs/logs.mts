import { createEl } from '../ui-components.mts';

export function renderLogs(root: HTMLElement, ctx: any) {
  root.textContent = '';

  const title = createEl('div', { style: 'font-weight:700; margin-bottom:8px;' }, ['日志 · Logs']);
  const sub = createEl('div', { className: 'muted', style: 'margin-bottom:10px; font-size:12px;' }, [
    '命令事件的运行日志（从主壳上下文收集）。',
  ]);

  const toolbar = createEl('div', { className: 'row', style: 'margin-bottom:8px;' });
  const clearBtn = createEl('button', { type: 'button', className: 'secondary' }, ['清空日志']) as HTMLButtonElement;
  const copyGlobalBtn = createEl('button', { type: 'button', className: 'secondary', title: '复制公共日志（Ctrl/Cmd+Shift+1）' }, ['复制公共日志']) as HTMLButtonElement;
  const copyShardBtn = createEl('button', { type: 'button', className: 'secondary', title: '复制分片日志（Ctrl/Cmd+Shift+2）' }, ['复制分片日志']) as HTMLButtonElement;
  const activeOnlyCheckbox = createEl('input', { type: 'checkbox', id: 'logs-active-only' }) as HTMLInputElement;
  activeOnlyCheckbox.checked = true;
  const activeOnlyLabel = createEl('label', { htmlFor: 'logs-active-only', style: 'cursor:pointer; user-select:none;' }, ['仅显示活跃分片']) as HTMLLabelElement;
  const showGlobalCheckbox = createEl('input', { type: 'checkbox', id: 'logs-show-global' }) as HTMLInputElement;
  showGlobalCheckbox.checked = false;
  const showGlobalLabel = createEl('label', { htmlFor: 'logs-show-global', style: 'cursor:pointer; user-select:none;' }, ['显示公共日志']) as HTMLLabelElement;
  toolbar.appendChild(clearBtn);
  toolbar.appendChild(copyGlobalBtn);
  toolbar.appendChild(copyShardBtn);
  toolbar.appendChild(activeOnlyCheckbox);
  toolbar.appendChild(activeOnlyLabel);
  toolbar.appendChild(showGlobalCheckbox);
  toolbar.appendChild(showGlobalLabel);

  const globalContainer = createEl('div', {
    style: 'display:flex; flex-direction:column; gap:10px; margin-bottom:10px;',
  }) as HTMLDivElement;

  const shardContainer = createEl('div', {
    style: 'display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; align-items:start; font-family:"Cascadia Mono", Consolas, ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px;',
  }) as HTMLDivElement;

  const sectionMap = new Map<string, HTMLDivElement>();
  const sectionCardMap = new Map<string, HTMLDivElement>();
  const sectionRunIds = new Map<string, Set<string>>();
  const sectionHeaderMap = new Map<string, HTMLDivElement>();
  const sectionTypeMap = new Map<string, 'global' | 'shard'>();
  const logActiveRunIds = new Set<string>();
  const parentRunIds = new Set<string>();
  const runIdToSection = new Map<string, string>();
  const parentRunCurrentSection = new Map<string, string>();
  const shardRunIds = new Set<string>();
  let selectedSectionKey = 'global';
  let shardProfileQueue: string[] = [];

  const parseShardHint = (line: string): string[] => {
    const text = String(line || '');
    const hinted = text.match(/\[shard-hint\]\s*profiles=([A-Za-z0-9_,-]+)/i);
    const orchestrate = text.match(/\[orchestrate\][^\n]*\bprofiles=([A-Za-z0-9_,-]+)/i);
    const raw = hinted?.[1] || orchestrate?.[1] || '';
    if (!raw) return [];
    return String(raw)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const isShardSection = (sectionKey: string) => String(sectionKey || '').startsWith('shard:');

  const extractRunId = (line: string) => {
    const text = String(line || '');
    const byRunTag = text.match(/^\[(?:run:|rid:)([A-Za-z0-9_-]+)\]\s*(.*)$/);
    const prefixedRunId = byRunTag?.[1] ? String(byRunTag[1]) : '';
    const tailText = byRunTag?.[2] ? String(byRunTag[2]) : text;

    // 优先使用日志正文里的 runId（例如 [Logger] runId=...），避免被外层 [rid:parent] 覆盖
    const byRunIdField = tailText.match(/runId=([A-Za-z0-9_-]+)/);
    if (byRunIdField?.[1]) return String(byRunIdField[1]);
    const byRunIdTag = tailText.match(/\[runId:([A-Za-z0-9_-]+)\]/);
    if (byRunIdTag?.[1]) return String(byRunIdTag[1]);

    if (prefixedRunId) return prefixedRunId;

    const byRunTagAnyPos = text.match(/\[(?:run:|rid:)([A-Za-z0-9_-]+)\]/);
    if (byRunTagAnyPos?.[1]) return String(byRunTagAnyPos[1]);
    return 'global';
  };

  const extractPrefixedRunId = (line: string) => {
    const text = String(line || '');
    const byRunTag = text.match(/^\[(?:run:|rid:)([A-Za-z0-9_-]+)\]/);
    return byRunTag?.[1] ? String(byRunTag[1]) : '';
  };

  const ensureSection = (sectionKey: string, headerLabel?: string) => {
    const normalized = String(sectionKey || 'global').trim() || 'global';
    const existing = sectionMap.get(normalized);
    if (existing) {
      if (headerLabel && sectionHeaderMap.has(normalized)) {
        sectionHeaderMap.get(normalized)!.textContent = headerLabel;
      }
      return existing;
    }

    const card = createEl('div', {
      style: 'border:1px solid #23262f; background:#0b0d12; border-radius:10px; overflow:hidden; min-width:0;',
    }) as HTMLDivElement;
    const head = createEl('div', {
      style: 'padding:8px 12px; border-bottom:1px solid #23262f; background:#121622; font-weight:600; color:#9aa4bd;',
    }, [headerLabel || (normalized === 'global' ? '公共日志' : `runId: ${normalized}`)]) as HTMLDivElement;
    const body = createEl('div', {
      style: 'padding:10px 12px; white-space:pre-wrap; word-break:break-all; line-height:1.5; height:calc(100vh - 220px); overflow:auto;',
    }) as HTMLDivElement;
    card.tabIndex = 0;

    card.appendChild(head);
    card.appendChild(body);
    if (normalized === 'global' || !isShardSection(normalized)) {
      globalContainer.appendChild(card);
      sectionTypeMap.set(normalized, 'global');
    } else {
      shardContainer.appendChild(card);
      sectionTypeMap.set(normalized, 'shard');
    }
    sectionMap.set(normalized, body);
    sectionCardMap.set(normalized, card);
    sectionRunIds.set(normalized, new Set<string>());
    sectionHeaderMap.set(normalized, head);
    const activateCard = () => {
      selectedSectionKey = normalized;
      sectionCardMap.forEach((item, key) => {
        const isSelected = key === selectedSectionKey;
        item.style.outline = isSelected ? '2px solid #4f86ff' : 'none';
        item.style.outlineOffset = isSelected ? '-2px' : '0';
      });
    };
    card.addEventListener('click', activateCard);
    card.addEventListener('focus', activateCard);
    return body;
  };

  const getSectionText = (sectionKey: string) => {
    const body = sectionMap.get(sectionKey);
    if (!body) return '';
    return Array.from(body.children)
      .map((el) => String((el as HTMLElement).innerText || (el as HTMLElement).textContent || '').trim())
      .filter(Boolean)
      .join('\n');
  };

  const collectSectionText = (type: 'global' | 'shard') => {
    return Array.from(sectionMap.keys())
      .filter((sectionKey) => sectionTypeMap.get(sectionKey) === type)
      .filter((sectionKey) => {
        const card = sectionCardMap.get(sectionKey);
        if (!card) return false;
        return card.style.display !== 'none';
      })
      .map((sectionKey) => getSectionText(sectionKey))
      .filter(Boolean)
      .join('\n');
  };

  const writeClipboard = async (text: string) => {
    if (!text) return { ok: false, error: 'empty' };
    if (typeof window.api?.clipboardWriteText === 'function') {
      return window.api.clipboardWriteText(text);
    }
    if (typeof navigator?.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
    return { ok: false, error: 'clipboard_unavailable' };
  };

  const copyByType = async (type: 'global' | 'shard') => {
    const text = collectSectionText(type);
    if (!text) {
      ctx.setStatus?.(`日志复制失败：${type === 'global' ? '公共日志为空' : '分片日志为空'}`);
      return;
    }
    const ret = await writeClipboard(text);
    ctx.setStatus?.(ret?.ok ? `已复制${type === 'global' ? '公共日志' : '分片日志'}（${text.split('\n').length}行）` : `日志复制失败：${ret?.error || 'unknown'}`);
  };

  const copySelected = async () => {
    const sectionType = sectionTypeMap.get(selectedSectionKey) || 'global';
    const text = selectedSectionKey ? getSectionText(selectedSectionKey) : '';
    if (text) {
      const ret = await writeClipboard(text);
      ctx.setStatus?.(
        ret?.ok
          ? `已复制当前日志卡片（${selectedSectionKey}）`
          : `日志复制失败：${ret?.error || 'unknown'}`,
      );
      return;
    }
    await copyByType(sectionType);
  };

  const resolveSectionKey = (text: string, rawRunId: string, prefixedRunId: string) => {
    if (rawRunId === 'global') return 'global';

    if (text.includes('[started]') && text.includes('xiaohongshu orchestrate')) {
      parentRunIds.add(rawRunId);
    }

    const mapped = runIdToSection.get(rawRunId);
    if (mapped) return mapped;

    // 同一父rid下，优先沿用“当前分片上下文”
    if (prefixedRunId && rawRunId === prefixedRunId) {
      const currentSection = parentRunCurrentSection.get(prefixedRunId);
      if (currentSection) return currentSection;
    }

    if (!parentRunIds.has(rawRunId) && shardProfileQueue.length > 0) {
      const profile = String(shardProfileQueue.shift() || '').trim();
      if (profile) {
        const sectionKey = `shard:${profile}`;
        runIdToSection.set(rawRunId, sectionKey);
        shardRunIds.add(rawRunId);
        ensureSection(sectionKey, `分片: ${profile}`);
        return sectionKey;
      }
    }

    return rawRunId;
  };

  const updateSectionVisibility = () => {
    const activeOnly = activeOnlyCheckbox.checked;
    const showGlobal = showGlobalCheckbox.checked;
    const activeRunIds: Set<string> = (ctx as any)._activeRunIds instanceof Set ? (ctx as any)._activeRunIds : new Set<string>();
    const effectiveActiveRunIds = new Set<string>([...activeRunIds, ...logActiveRunIds]);
    sectionCardMap.forEach((card, sectionKey) => {
      if (sectionKey === 'global') {
        card.style.display = showGlobal ? '' : 'none';
        return;
      }
      if (!isShardSection(sectionKey)) {
        card.style.display = showGlobal ? '' : 'none';
        return;
      }
      if (!activeOnly) {
        card.style.display = '';
        return;
      }
      const relatedRunIds = sectionRunIds.get(sectionKey) || new Set<string>();
      const visible =
        effectiveActiveRunIds.has(sectionKey) ||
        shardRunIds.has(sectionKey) ||
        Array.from(relatedRunIds).some((runId) => effectiveActiveRunIds.has(runId));
      card.style.display = visible ? '' : 'none';
    });
  };

  const appendLine = (line: string) => {
    const text = String(line || '').trim();
    if (!text) return;

    const prefixedRunId = extractPrefixedRunId(text);
    const rawRunId = extractRunId(text);

    const hintedProfiles = parseShardHint(text);
    if (hintedProfiles.length > 0) {
      shardProfileQueue = hintedProfiles.slice();
      hintedProfiles.forEach((profile) => {
        const sectionKey = `shard:${profile}`;
        ensureSection(sectionKey, `分片: ${profile}`);
        if (prefixedRunId && rawRunId !== 'global') {
          parentRunCurrentSection.set(prefixedRunId, sectionKey);
          runIdToSection.set(rawRunId, sectionKey);
          shardRunIds.add(rawRunId);
          if (!sectionRunIds.has(sectionKey)) {
            sectionRunIds.set(sectionKey, new Set<string>());
          }
          sectionRunIds.get(sectionKey)!.add(rawRunId);
        }
      });
    }

    // 识别日志中的 Profile 行，切换父rid当前分片上下文
    const profileMatch = text.match(/\b[Pp]rofile\s*[:：]\s*([A-Za-z0-9_-]+)/);
    const profileEqMatch = text.match(/\bprofile=([A-Za-z0-9_-]+)/);
    const resolvedProfile = String(profileMatch?.[1] || profileEqMatch?.[1] || '').trim();
    if (resolvedProfile) {
      const profileId = resolvedProfile;
      if (profileId) {
        const sectionKey = `shard:${profileId}`;
        ensureSection(sectionKey, `分片: ${profileId}`);
        if (prefixedRunId && rawRunId && rawRunId !== prefixedRunId) {
          runIdToSection.set(rawRunId, sectionKey);
          if (!sectionRunIds.has(sectionKey)) {
            sectionRunIds.set(sectionKey, new Set<string>());
          }
          sectionRunIds.get(sectionKey)!.add(rawRunId);
        }
        if (prefixedRunId) {
          parentRunCurrentSection.set(prefixedRunId, sectionKey);
        }
      }
    }

    const loggerChildRunId = text.match(/\[Logger\]\s+runId=([A-Za-z0-9_-]+)/);
    if (loggerChildRunId?.[1] && prefixedRunId) {
      const childRunId = String(loggerChildRunId[1]).trim();
      const parentSection = parentRunCurrentSection.get(prefixedRunId);
      if (parentSection) {
        shardRunIds.add(childRunId);
        runIdToSection.set(childRunId, parentSection);
        if (!sectionRunIds.has(parentSection)) {
          sectionRunIds.set(parentSection, new Set<string>());
        }
        sectionRunIds.get(parentSection)!.add(childRunId);
      }
    }

    if (rawRunId !== 'global') {
      logActiveRunIds.add(rawRunId);
      if (text.includes('[exit]')) {
        logActiveRunIds.delete(rawRunId);
      }
    }

    const sectionKey = resolveSectionKey(text, rawRunId, prefixedRunId);
    const body = ensureSection(sectionKey);
    if (isShardSection(sectionKey) && rawRunId !== 'global') {
      shardRunIds.add(rawRunId);
    }
    if (rawRunId !== 'global') {
      if (!sectionRunIds.has(sectionKey)) {
        sectionRunIds.set(sectionKey, new Set<string>());
      }
      sectionRunIds.get(sectionKey)?.add(rawRunId);
    }

    const div = createEl('div', { className: 'muted' }, [text]);
    body.appendChild(div);
  };

  clearBtn.onclick = () => {
    ctx.clearLog();
    sectionMap.clear();
    sectionCardMap.clear();
    sectionRunIds.clear();
    sectionHeaderMap.clear();
    sectionTypeMap.clear();
    logActiveRunIds.clear();
    parentRunIds.clear();
    runIdToSection.clear();
    parentRunCurrentSection.clear();
    shardRunIds.clear();
    shardProfileQueue = [];
    selectedSectionKey = 'global';

    globalContainer.textContent = '';
    shardContainer.textContent = '';
  };
  copyGlobalBtn.onclick = () => { void copyByType('global'); };
  copyShardBtn.onclick = () => { void copyByType('shard'); };

  activeOnlyCheckbox.onchange = () => {
    updateSectionVisibility();
  };
  showGlobalCheckbox.onchange = () => {
    updateSectionVisibility();
  };

  // 初始渲染现有日志
  const existingLines = (ctx as any)._logLines || [];
  if (Array.isArray(existingLines)) {
    existingLines.forEach((line: string) => {
      appendLine(line);
    });
    updateSectionVisibility();
  }

  // 监听后续日志追加
  const originalAppendLog = typeof ctx._appendLogBase === 'function' ? ctx._appendLogBase : ctx.appendLog;
  ctx._appendLogBase = originalAppendLog;
  ctx.appendLog = (line: string) => {
    appendLine(line);
    updateSectionVisibility();
    // 同时保留原有行为（如果其他地方需要）
    if (typeof originalAppendLog === 'function') originalAppendLog.call(ctx, line);
  };

  const unsubscribeActiveRuns = typeof ctx.onActiveRunsChanged === 'function'
    ? ctx.onActiveRunsChanged(() => updateSectionVisibility())
    : null;

  updateSectionVisibility();

  root.appendChild(title);
  root.appendChild(sub);
  root.appendChild(toolbar);
  root.appendChild(globalContainer);
  root.appendChild(shardContainer);

  const onKeydown = (evt: KeyboardEvent) => {
    if (!(evt.ctrlKey || evt.metaKey) || !evt.shiftKey) return;
    const key = String(evt.key || '').toLowerCase();
    if (key === '1') {
      evt.preventDefault();
      void copyByType('global');
      return;
    }
    if (key === '2') {
      evt.preventDefault();
      void copyByType('shard');
      return;
    }
    if (key === 'c') {
      evt.preventDefault();
      void copySelected();
    }
  };
  root.addEventListener('keydown', onKeydown);
  ensureSection('global', '公共日志');

  root.addEventListener('DOMNodeRemoved', () => {
    if (typeof unsubscribeActiveRuns === 'function') unsubscribeActiveRuns();
    root.removeEventListener('keydown', onKeydown);
  }, { once: true });
}
