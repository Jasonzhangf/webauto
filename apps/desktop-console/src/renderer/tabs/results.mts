import { createEl, section } from '../ui-components.mts';

export function renderResults(root: HTMLElement, ctx: any) {
  const entryList = createEl('div', { className: 'list' });
  const fileList = createEl('div', { className: 'list' });
  const rightTop = createEl('div', {});
  const preview = createEl('div', {});

  const filterInput = createEl('input', { placeholder: 'filter filename (contains)', value: '' }) as HTMLInputElement;
  const onlyImages = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const onlyText = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
  const statusLine = createEl('div', { className: 'muted' }, ['']);

  let currentEntry: any = null;
  let currentFiles: any[] = [];

  async function refresh() {
    entryList.textContent = '';
    fileList.textContent = '';
    rightTop.textContent = '';
    preview.textContent = '';
    statusLine.textContent = '';
    currentEntry = null;
    currentFiles = [];

    const res = await window.api.resultsScan({ downloadRoot: ctx.settings?.downloadRoot });
    if (!res?.ok) {
      entryList.appendChild(createEl('div', { className: 'item' }, [String(res?.error || 'scan failed')]));
      return;
    }
    const entries = res.entries || [];
    entries.forEach((e: any) => {
      const s = e.state || null;
      const badge =
        s && s.status
          ? ` [${s.status}] links=${s.links || 0}/${s.target || 0} ok=${s.completed || 0} fail=${s.failed || 0}`
          : ' [no-state]';
      const item = createEl('div', { className: 'item' }, [`${e.env}/${e.keyword}${badge}`]);
      item.onclick = () => void openEntry(e);
      entryList.appendChild(item);
    });
  }

  async function openEntry(e: any) {
    currentEntry = e;
    currentFiles = [];
    rightTop.textContent = '';
    preview.textContent = '';
    fileList.textContent = '';

    const openDirBtn = createEl('button', { className: 'secondary' }, ['打开目录']) as HTMLButtonElement;
    openDirBtn.onclick = () => void window.api.osOpenPath(e.path);

    rightTop.appendChild(createEl('div', { className: 'row' }, [
      openDirBtn,
      createEl('div', { className: 'muted' }, [String(e.path || '')]),
    ]));

    const res = await window.api.fsListDir({ root: e.path, recursive: true, maxEntries: 2000 });
    if (!res?.ok) {
      statusLine.textContent = `list failed: ${String(res?.error || '')}`;
      return;
    }
    const files = (res.entries || []).filter((x: any) => x && x.isDir === false);
    currentFiles = files;
    statusLine.textContent = `files=${files.length}${res.truncated ? ' (truncated)' : ''}`;
    renderFileList();
  }

  function isImagePath(p: string) {
    const ext = p.toLowerCase().split('.').pop() || '';
    return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
  }

  function isTextPath(p: string) {
    const ext = p.toLowerCase().split('.').pop() || '';
    return ext === 'jsonl' || ext === 'json' || ext === 'txt' || ext === 'log' || ext === 'md';
  }

  function renderFileList() {
    fileList.textContent = '';
    preview.textContent = '';

    const needle = filterInput.value.trim().toLowerCase();
    const list = currentFiles
      .filter((x: any) => {
        const rel = String(x.rel || x.name || '').toLowerCase();
        if (needle && !rel.includes(needle)) return false;
        if (onlyImages.checked && !isImagePath(rel)) return false;
        if (onlyText.checked && !isTextPath(rel)) return false;
        return true;
      })
      .slice(0, 600);

    list.forEach((f: any) => {
      const label = String(f.rel || f.name || '');
      const item = createEl('div', { className: 'item' }, [label]);
      item.onclick = () => void previewFile(f);
      fileList.appendChild(item);
    });
  }

  async function previewFile(f: any) {
    preview.textContent = '';
    const p = String(f.path || '');
    if (!p) return;

    const actions = createEl('div', { className: 'row' }, [
      createEl('button', { className: 'secondary' }, ['打开文件']),
    ]);
    (actions.querySelector('button') as HTMLButtonElement).onclick = () => void window.api.osOpenPath(p);
    preview.appendChild(actions);

    if (isImagePath(p)) {
      const res = await window.api.fsReadFileBase64({ path: p, maxBytes: 8_000_000 });
      if (!res?.ok) {
        preview.appendChild(createEl('div', { className: 'muted' }, [String(res?.error || 'read image failed')]));
        return;
      }
      const ext = p.toLowerCase().endsWith('.png') ? 'png' : p.toLowerCase().endsWith('.webp') ? 'webp' : 'jpeg';
      const img = createEl('img', { style: 'max-width:100%; border:1px solid #ddd; border-radius:6px;' }) as HTMLImageElement;
      img.src = `data:image/${ext};base64,${res.data}`;
      preview.appendChild(img);
      return;
    }
    if (isTextPath(p)) {
      await previewText(p);
      return;
    }
    preview.appendChild(createEl('div', { className: 'muted' }, ['(no preview)']));
  }

  async function previewText(filePath: string) {
    const res = await window.api.fsReadTextPreview({ path: filePath, maxBytes: 50_000, maxLines: 200 });
    if (!res?.ok) {
      preview.appendChild(createEl('div', { className: 'muted' }, [String(res?.error || 'read failed')]));
      return;
    }
    preview.appendChild(createEl('pre', { style: 'white-space:pre-wrap; margin:0;' }, [res.text]));
  }

  root.appendChild(
    section('结果目录', [
      createEl('div', { className: 'row' }, [
        createEl('button', { className: 'secondary' }, ['刷新']),
        createEl('div', { className: 'muted' }, [`root=${ctx.settings?.downloadRoot || ''}`]),
      ]),
      createEl('div', { className: 'row' }, [
        createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
          createEl('label', {}, ['only images']),
          onlyImages,
        ]),
        createEl('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
          createEl('label', {}, ['only text']),
          onlyText,
        ]),
        filterInput,
        statusLine,
      ]),
      createEl('div', { className: 'split' }, [
        entryList,
        createEl('div', {}, [rightTop, fileList, preview]),
      ]),
    ]),
  );
  (root.querySelector('button') as HTMLButtonElement).onclick = () => void refresh();
  filterInput.oninput = () => renderFileList();
  onlyImages.onchange = () => renderFileList();
  onlyText.onchange = () => renderFileList();
  void refresh();
}
