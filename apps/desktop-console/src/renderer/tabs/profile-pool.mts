import { createEl, labeledInput, section } from '../ui-components.mjs';
import { resolveWebautoRoot } from '../path-helpers.mjs';

// Phase definitions
const PHASES = [
  { id: 'phase1', label: 'Phase1: 启动浏览器' },
  { id: 'phase2', label: 'Phase2: 搜索采集链接' },
  { id: 'phase3', label: 'Phase3: 评论互动' },
  { id: 'phase4', label: 'Phase4: 内容采集' },
  { id: 'unified', label: 'Unified: 统一采集' },
];

export function renderProfilePool(root: HTMLElement, ctx: any) {
  const webautoRoot = resolveWebautoRoot(ctx.settings?.downloadRoot || '', window.api);
  
  // Styles
  const containerStyle = 'background:#1a1a2e; color:#eee; padding:16px; border-radius:8px;';
  const listStyle = 'max-height:180px; overflow:auto; background:#16213e; border:1px solid #0f3460; border-radius:4px; padding:8px;';
  const itemStyle = 'cursor:pointer; padding:8px 12px; margin:4px 0; background:#0f3460; border-radius:4px; color:#fff; font-size:14px;';
  const selectedItemStyle = 'cursor:pointer; padding:8px 12px; margin:4px 0; background:#e94560; border-radius:4px; color:#fff; font-weight:bold; font-size:14px;';
  const disabledItemStyle = 'padding:8px 12px; margin:4px 0; background:#333; border-radius:4px; color:#666; font-size:14px; text-decoration:line-through;';
  const labelStyle = 'color:#eaeaea; font-size:13px; margin-bottom:8px; font-weight:500;';
  const phaseLabelStyle = 'color:#aaa; font-size:11px; margin-left:8px;';
  
  const availableProfiles = createEl('div', { style: listStyle });
  const selectedProfiles = createEl('div', { style: listStyle });
  const statusText = createEl('div', { style: 'color:#e94560; font-size:14px; margin:12px 0; font-weight:bold;' });
  
  // Phase checkboxes container
  const phaseContainer = createEl('div', { style: 'display:flex; flex-wrap:wrap; gap:12px; margin:12px 0; padding:12px; background:#0f3460; border-radius:4px;' });
  
  let profiles: string[] = [];
  let selected: Set<string> = new Set();
  let profilePhases: Record<string, Set<string>> = {};
  
  // Load saved config
  function loadSavedConfig() {
    if (ctx.settings?.allowedProfiles) {
      selected = new Set(ctx.settings.allowedProfiles);
    }
    if (ctx.settings?.profilePhases) {
      profilePhases = {};
      for (const [profile, phases] of Object.entries(ctx.settings.profilePhases)) {
        profilePhases[profile] = new Set(phases as string[]);
      }
    }
    // Default: all phases enabled for selected profiles
    selected.forEach(profile => {
      if (!profilePhases[profile]) {
        profilePhases[profile] = new Set(PHASES.map(p => p.id));
      }
    });
  }
  
  async function loadProfiles() {
    try {
      const res = await fetch((ctx.settings?.coreDaemonUrl || 'http://127.0.0.1:7700') + '/profile/list');
      const data = await res.json();
      profiles = data.allowed || [];
      loadSavedConfig();
      renderLists();
      renderPhaseCheckboxes();
    } catch (e) {
      statusText.textContent = '❌ 加载失败: ' + (e as Error).message;
    }
  }
  
  function renderPhaseCheckboxes() {
    phaseContainer.textContent = '';
    phaseContainer.appendChild(createEl('div', { style: 'width:100%; color:#aaa; font-size:12px; margin-bottom:8px;' }, ['为选中的 Profile 启用以下阶段：']));
    
    PHASES.forEach(phase => {
      const label = createEl('label', { style: 'display:flex; align-items:center; gap:6px; cursor:pointer; color:#fff; font-size:13px;' });
      const checkbox = createEl('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
      checkbox.dataset.phase = phase.id;
      checkbox.onchange = () => {
        selected.forEach(profile => {
          if (!profilePhases[profile]) profilePhases[profile] = new Set();
          if (checkbox.checked) {
            profilePhases[profile].add(phase.id);
          } else {
            profilePhases[profile].delete(phase.id);
          }
        });
      };
      label.appendChild(checkbox);
      label.appendChild(createEl('span', {}, [phase.label]));
      phaseContainer.appendChild(label);
    });
  }
  
  function getEnabledPhasesText(profile: string): string {
    const phases = profilePhases[profile];
    if (!phases || phases.size === 0) return '(无阶段)';
    if (phases.size === PHASES.length) return '(全部)';
    const enabled = PHASES.filter(p => phases.has(p.id)).map(p => p.id.replace('phase', 'P'));
    return '(' + enabled.join(',') + ')';
  }
  
  function renderLists() {
    availableProfiles.textContent = '';
    selectedProfiles.textContent = '';
    
    if (profiles.length === 0) {
      availableProfiles.appendChild(createEl('div', { style: 'color:#888; padding:20px; text-align:center;' }, ['暂无可用 profiles']));
    }
    
    profiles.forEach(p => {
      if (!selected.has(p)) {
        const row = createEl('div', { style: itemStyle }, [p]);
        row.onclick = () => { 
          selected.add(p); 
          if (!profilePhases[p]) profilePhases[p] = new Set(PHASES.map(ph => ph.id));
          renderLists(); 
        };
        availableProfiles.appendChild(row);
      }
    });
    
    if (selected.size === 0) {
      selectedProfiles.appendChild(createEl('div', { style: 'color:#888; padding:20px; text-align:center;' }, ['点击左侧添加']));
    }
    
    selected.forEach(p => {
      const phasesText = getEnabledPhasesText(p);
      const row = createEl('div', { style: selectedItemStyle }, ['✓ ' + p + ' ', createEl('span', { style: phaseLabelStyle }, [phasesText])]);
      row.onclick = () => { selected.delete(p); delete profilePhases[p]; renderLists(); };
      selectedProfiles.appendChild(row);
    });
    
    statusText.textContent = `📊 可用: ${profiles.length - selected.size} | 已选: ${selected.size}`;
  }
  
  const btnStyle = 'padding:8px 16px; margin-right:8px; background:#0f3460; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px;';
  const btnPrimaryStyle = 'padding:8px 16px; margin-right:8px; background:#e94560; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px;';
  
  const btnSave = createEl('button', { style: btnPrimaryStyle }, ['💾 保存配置']);
  btnSave.onclick = async () => {
    const profileList = Array.from(selected);
    const phasesConfig: Record<string, string[]> = {};
    selected.forEach(profile => {
      phasesConfig[profile] = Array.from(profilePhases[profile] || []);
    });
    await window.api.settingsSet({ 
      allowedProfiles: profileList,
      profilePhases: phasesConfig
    });
    ctx.settings.allowedProfiles = profileList;
    ctx.settings.profilePhases = phasesConfig;
    ctx.appendLog('[ProfilePool] ✅ 已保存 ' + profileList.length + ' 个 profile');
  };
  
  const btnRefresh = createEl('button', { style: btnStyle }, ['🔄 刷新']);
  btnRefresh.onclick = () => loadProfiles();
  
  const btnSelectAll = createEl('button', { style: btnStyle }, ['☑️ 全选']);
  btnSelectAll.onclick = () => { 
    profiles.forEach(p => {
      selected.add(p);
      if (!profilePhases[p]) profilePhases[p] = new Set(PHASES.map(ph => ph.id));
    });
    renderLists(); 
  };
  
  const btnClear = createEl('button', { style: btnStyle }, ['🗑️ 清空']);
  btnClear.onclick = () => { selected.clear(); profilePhases = {}; renderLists(); };
  
  const wrapper = createEl('div', { style: containerStyle });
  wrapper.appendChild(
    section('Profile Pool 配置', [
      createEl('div', { style: 'margin-bottom:12px;' }, [
        btnRefresh,
        btnSelectAll,
        btnClear,
        btnSave,
      ]),
      statusText,
      createEl('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:12px;' }, [
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['📋 可用 Profiles（点击选择）']),
          availableProfiles,
        ]),
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['✅ 已选 Profiles（显示启用阶段）']),
          selectedProfiles,
        ]),
      ]),
      phaseContainer,
      createEl('div', { style: 'color:#888; font-size:12px; margin-top:12px;' }, ['提示：配置会自动保存，下次启动时恢复']),
    ]),
  );
  
  root.appendChild(wrapper);
  loadProfiles();
}
