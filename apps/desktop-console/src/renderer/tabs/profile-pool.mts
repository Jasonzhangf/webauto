import { createEl, labeledInput, section } from '../ui-components.mjs';
import { resolveWebautoRoot } from '../path-helpers.mjs';

export function renderProfilePool(root: HTMLElement, ctx: any) {
  const webautoRoot = resolveWebautoRoot(ctx.settings?.downloadRoot || '', window.api);
  
  // Better contrast styling
  const containerStyle = 'background:#1a1a2e; color:#eee; padding:16px; border-radius:8px;';
  const listStyle = 'max-height:200px; overflow:auto; background:#16213e; border:1px solid #0f3460; border-radius:4px; padding:8px;';
  const itemStyle = 'cursor:pointer; padding:8px 12px; margin:4px 0; background:#0f3460; border-radius:4px; color:#fff; font-size:14px;';
  const selectedItemStyle = 'cursor:pointer; padding:8px 12px; margin:4px 0; background:#e94560; border-radius:4px; color:#fff; font-weight:bold; font-size:14px;';
  const labelStyle = 'color:#eaeaea; font-size:13px; margin-bottom:8px; font-weight:500;';
  
  const availableProfiles = createEl('div', { style: listStyle });
  const selectedProfiles = createEl('div', { style: listStyle });
  const statusText = createEl('div', { style: 'color:#e94560; font-size:14px; margin:12px 0; font-weight:bold;' });
  
  let profiles: string[] = [];
  let selected: Set<string> = new Set();
  
  async function loadProfiles() {
    try {
      const res = await fetch((ctx.settings?.coreDaemonUrl || 'http://127.0.0.1:7700') + '/profile/list');
      const data = await res.json();
      profiles = data.allowed || [];
      if (ctx.settings?.allowedProfiles) {
        selected = new Set(ctx.settings.allowedProfiles);
      }
      renderLists();
    } catch (e) {
      statusText.textContent = '❌ 加载失败: ' + (e as Error).message;
      statusText.setAttribute('style', 'color:#ff6b6b; font-size:14px; margin:12px 0; font-weight:bold;');
    }
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
        row.onmouseenter = () => row.setAttribute('style', itemStyle + ' background:#1a1a2e;');
        row.onmouseleave = () => row.setAttribute('style', itemStyle);
        row.onclick = () => { selected.add(p); renderLists(); };
        availableProfiles.appendChild(row);
      }
    });
    
    if (selected.size === 0) {
      selectedProfiles.appendChild(createEl('div', { style: 'color:#888; padding:20px; text-align:center;' }, ['点击左侧添加']));
    }
    
    selected.forEach(p => {
      const row = createEl('div', { style: selectedItemStyle }, ['✓ ' + p]);
      row.onclick = () => { selected.delete(p); renderLists(); };
      selectedProfiles.appendChild(row);
    });
    
    statusText.textContent = `📊 可用: ${profiles.length - selected.size} | 已选: ${selected.size}`;
  }
  
  const btnStyle = 'padding:8px 16px; margin-right:8px; background:#0f3460; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px;';
  const btnPrimaryStyle = 'padding:8px 16px; margin-right:8px; background:#e94560; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px;';
  
  const btnSave = createEl('button', { style: btnPrimaryStyle }, ['💾 保存配置']);
  btnSave.onclick = async () => {
    const profileList = Array.from(selected);
    await window.api.settingsSet({ allowedProfiles: profileList });
    ctx.settings.allowedProfiles = profileList;
    ctx.appendLog('[ProfilePool] ✅ 已保存: ' + profileList.join(', '));
  };
  
  const btnRefresh = createEl('button', { style: btnStyle }, ['🔄 刷新']);
  btnRefresh.onclick = () => loadProfiles();
  
  const btnSelectAll = createEl('button', { style: btnStyle }, ['☑️ 全选']);
  btnSelectAll.onclick = () => { profiles.forEach(p => selected.add(p)); renderLists(); };
  
  const btnClear = createEl('button', { style: btnStyle }, ['🗑️ 清空']);
  btnClear.onclick = () => { selected.clear(); renderLists(); };
  
  const wrapper = createEl('div', { style: containerStyle });
  wrapper.appendChild(
    section('Profile Pool 配置', [
      createEl('div', { style: 'margin-bottom:16px;' }, [
        btnRefresh,
        btnSelectAll,
        btnClear,
        btnSave,
      ]),
      statusText,
      createEl('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:16px;' }, [
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['📋 可用 Profiles（点击选择）']),
          availableProfiles,
        ]),
        createEl('div', {}, [
          createEl('div', { style: labelStyle }, ['✅ 已选 Profiles（点击移除）']),
          selectedProfiles,
        ]),
      ]),
    ]),
  );
  
  root.appendChild(wrapper);
  loadProfiles();
}
