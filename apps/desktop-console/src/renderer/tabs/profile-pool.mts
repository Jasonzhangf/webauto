import { createEl, labeledInput, section } from '../ui-components.mjs';
import { resolveWebautoRoot } from '../path-helpers.mjs';

const PHASES = [
  { id: 'phase1', label: 'Phase1: 启动浏览器' },
  { id: 'phase2', label: 'Phase2: 搜索采集' },
  { id: 'phase3', label: 'Phase3: 评论互动' },
  { id: 'phase4', label: 'Phase4: 内容采集' },
  { id: 'unified', label: 'Unified: 统一采集' },
];

export function renderProfilePool(root: HTMLElement, ctx: any) {
  const webautoRoot = resolveWebautoRoot(ctx.settings?.downloadRoot || '', window.api);
  
  const containerStyle = 'background:#1a1a2e; color:#eee; padding:16px; border-radius:8px;';
  const listStyle = 'max-height:150px; overflow:auto; background:#16213e; border:1px solid #0f3460; border-radius:4px; padding:8px;';
  const itemStyle = 'cursor:pointer; padding:6px 10px; margin:3px 0; background:#0f3460; border-radius:4px; color:#fff; font-size:13px;';
  const selectedItemStyle = 'cursor:pointer; padding:6px 10px; margin:3px 0; background:#e94560; border-radius:4px; color:#fff; font-weight:bold; font-size:13px;';
  const labelStyle = 'color:#eaeaea; font-size:12px; margin-bottom:6px; font-weight:500;';
  const sectionTitleStyle = 'color:#fff; font-size:14px; font-weight:bold; margin:16px 0 8px 0; border-bottom:1px solid #0f3460; padding-bottom:4px;';
  
  // Top section: Available and Selected profiles
  const availableProfiles = createEl('div', { style: listStyle });
  const selectedProfiles = createEl('div', { style: listStyle });
  const statusText = createEl('div', { style: 'color:#e94560; font-size:13px; margin:8px 0; font-weight:bold;' });
  
  // Bottom section: Per-phase profile assignment
  const phaseSections = createEl('div', { style: 'margin-top:16px;' });
  
  let profiles: string[] = [];
  let selected: Set<string> = new Set();
  let phaseProfiles: Record<string, Set<string>> = {};
  
  function loadSavedConfig() {
    if (ctx.settings?.allowedProfiles) {
      selected = new Set(ctx.settings.allowedProfiles);
    }
    // Load phase-specific assignments
    if (ctx.settings?.phaseProfiles) {
      phaseProfiles = {};
      for (const [phaseId, profs] of Object.entries(ctx.settings.phaseProfiles)) {
        phaseProfiles[phaseId] = new Set(profs as string[]);
      }
    }
    // Default: all selected profiles enabled for all phases
    PHASES.forEach(phase => {
      if (!phaseProfiles[phase.id]) {
        phaseProfiles[phase.id] = new Set(selected);
      }
    });
  }
  
  async function loadProfiles() {
    try {
      const res = await fetch((ctx.settings?.coreDaemonUrl || 'http://127.0.0.1:7700') + '/profile/list');
      const data = await res.json();
      profiles = data.allowed || [];
      loadSavedConfig();
      renderTopSection();
      renderPhaseSections();
    } catch (e) {
      statusText.textContent = '❌ 加载失败: ' + (e as Error).message;
    }
  }
  
  function renderTopSection() {
    availableProfiles.textContent = '';
    selectedProfiles.textContent = '';
    
    profiles.forEach(p => {
      if (!selected.has(p)) {
        const row = createEl('div', { style: itemStyle }, ['+ ' + p]);
        row.onclick = () => { 
          selected.add(p);
          // Auto-enable for all phases
          PHASES.forEach(ph => {
            if (!phaseProfiles[ph.id]) phaseProfiles[ph.id] = new Set();
            phaseProfiles[ph.id].add(p);
          });
          renderTopSection();
          renderPhaseSections();
        };
        availableProfiles.appendChild(row);
      }
    });
    
    if (selected.size === 0) {
      selectedProfiles.appendChild(createEl('div', { style: 'color:#888; padding:20px; text-align:center; font-size:12px;' }, ['点击左侧 + 添加 Profile']));
    } else {
      selected.forEach(p => {
        const row = createEl('div', { style: selectedItemStyle }, ['✓ ' + p]);
        row.onclick = () => { 
          selected.delete(p);
          // Remove from all phases
          PHASES.forEach(ph => phaseProfiles[ph.id]?.delete(p));
          renderTopSection();
          renderPhaseSections();
        };
        selectedProfiles.appendChild(row);
      });
    }
    
    statusText.textContent = `📊 可用: ${profiles.length - selected.size} | 已加入: ${selected.size}`;
  }
  
  function renderPhaseSections() {
    phaseSections.textContent = '';
    phaseSections.appendChild(createEl('div', { style: sectionTitleStyle }, ['阶段 Profile 分配（可取消勾选）']));
    
    PHASES.forEach(phase => {
      const phaseBox = createEl('div', { style: 'background:#0f3460; padding:10px; margin:8px 0; border-radius:4px;' });
      const phaseHeader = createEl('div', { style: 'color:#e94560; font-size:13px; font-weight:bold; margin-bottom:8px;' }, [phase.label]);
      phaseBox.appendChild(phaseHeader);
      
      const checkboxesRow = createEl('div', { style: 'display:flex; flex-wrap:wrap; gap:8px;' });
      
      if (selected.size === 0) {
        checkboxesRow.appendChild(createEl('span', { style: 'color:#666; font-size:12px;' }, ['先添加 Profile 到上方池']));
      } else {
        selected.forEach(profile => {
          const isEnabled = phaseProfiles[phase.id]?.has(profile) ?? true;
          const label = createEl('label', { style: 'display:flex; align-items:center; gap:4px; cursor:pointer; color:#fff; font-size:12px; padding:4px 8px; background:#16213e; border-radius:3px;' });
          const checkbox = createEl('input', { type: 'checkbox', checked: isEnabled }) as HTMLInputElement;
          checkbox.onchange = () => {
            if (!phaseProfiles[phase.id]) phaseProfiles[phase.id] = new Set();
            if (checkbox.checked) {
              phaseProfiles[phase.id].add(profile);
            } else {
              phaseProfiles[phase.id].delete(profile);
            }
          };
          label.appendChild(checkbox);
          label.appendChild(createEl('span', {}, [profile]));
          checkboxesRow.appendChild(label);
        });
      }
      
      phaseBox.appendChild(checkboxesRow);
      phaseSections.appendChild(phaseBox);
    });
  }
  
  const btnStyle = 'padding:6px 12px; margin-right:6px; background:#0f3460; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;';
  const btnPrimaryStyle = 'padding:6px 12px; margin-right:6px; background:#e94560; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;';
  
  const btnSave = createEl('button', { style: btnPrimaryStyle }, ['💾 保存']);
  btnSave.onclick = async () => {
    const phaseConfig: Record<string, string[]> = {};
    PHASES.forEach(ph => {
      phaseConfig[ph.id] = Array.from(phaseProfiles[ph.id] || []);
    });
    await window.api.settingsSet({ 
      allowedProfiles: Array.from(selected),
      phaseProfiles: phaseConfig
    });
    ctx.settings.allowedProfiles = Array.from(selected);
    ctx.settings.phaseProfiles = phaseConfig;
    ctx.appendLog('[ProfilePool] ✅ 已保存');
  };
  
  const btnRefresh = createEl('button', { style: btnStyle }, ['🔄 刷新']);
  btnRefresh.onclick = () => loadProfiles();
  
  const btnSelectAll = createEl('button', { style: btnStyle }, ['☑️ 全选']);
  btnSelectAll.onclick = () => { 
    profiles.forEach(p => {
      selected.add(p);
      PHASES.forEach(ph => {
        if (!phaseProfiles[ph.id]) phaseProfiles[ph.id] = new Set();
        phaseProfiles[ph.id].add(p);
      });
    });
    renderTopSection();
    renderPhaseSections();
  };
  
  const btnClear = createEl('button', { style: btnStyle }, ['清空']);
  btnClear.onclick = () => { 
    selected.clear(); 
    phaseProfiles = {};
    renderTopSection();
    renderPhaseSections();
  };
  
  const wrapper = createEl('div', { style: containerStyle });
  wrapper.appendChild(
    section('Profile Pool', [
      // Top: Pool management
      createEl('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:12px;' }, [
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['可用 Profiles（点击加入）']),
          availableProfiles,
        ]),
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['Profile 池（点击移除）']),
          selectedProfiles,
        ]),
      ]),
      statusText,
      createEl('div', { style: 'margin:8px 0;' }, [
        btnRefresh,
        btnSelectAll,
        btnClear,
        btnSave,
      ]),
      // Bottom: Phase assignments
      phaseSections,
    ]),
  );
  
  root.appendChild(wrapper);
  loadProfiles();
}
