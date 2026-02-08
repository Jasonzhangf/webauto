import { createEl } from '../ui-components.mjs';

export function renderXiaohongshuTab(root: HTMLElement, api: any) {
  root.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = '小红书 · 统一采集与点赞';
  title.style.fontWeight = '700';
  title.style.marginBottom = '12px';
  root.appendChild(title);

  const card = createEl('div', { className: 'card' });
  const cardTitle = createEl('div', { style: 'font-weight:700; margin-bottom:12px;' }, ['采集选项']);
  card.appendChild(cardTitle);

  // 勾选项
  const doCommentsCheckbox = createEl('input', { type: 'checkbox', checked: true, id: 'doComments' });
  const doCommentsRow = createEl('div', { className: 'row' }, [
    doCommentsCheckbox,
    createEl('label', { htmlFor: 'doComments', style: 'cursor:pointer; margin-left:6px;' }, ['采集评论']),
  ]);
  card.appendChild(doCommentsRow);

  const doLikesCheckbox = createEl('input', { type: 'checkbox', checked: false, id: 'doLikes' });
  const doLikesRow = createEl('div', { className: 'row' }, [
    doLikesCheckbox,
    createEl('label', { htmlFor: 'doLikes', style: 'cursor:pointer; margin-left:6px;' }, ['点赞评论']),
  ]);
  card.appendChild(doLikesRow);

  const dryRunCheckbox = createEl('input', { type: 'checkbox', checked: true, id: 'dryRun' });
  const dryRunRow = createEl('div', { className: 'row' }, [
    dryRunCheckbox,
    createEl('label', { htmlFor: 'dryRun', style: 'cursor:pointer; margin-left:6px; color:#d4b106;' }, ['Dry Run（勾选=不点赞，取消=真实点赞）']),
  ]);
  card.appendChild(dryRunRow);

  const doHomepageCheckbox = createEl('input', { type: 'checkbox', checked: false, id: 'doHomepage' });
  const doHomepageRow = createEl('div', { className: 'row' }, [
    doHomepageCheckbox,
    createEl('label', { htmlFor: 'doHomepage', style: 'cursor:pointer; margin-left:6px;' }, ['采集主页内容']),
  ]);
  card.appendChild(doHomepageRow);

  const doImagesCheckbox = createEl('input', { type: 'checkbox', checked: false, id: 'doImages' });
  const doImagesRow = createEl('div', { className: 'row' }, [
    doImagesCheckbox,
    createEl('label', { htmlFor: 'doImages', style: 'cursor:pointer; margin-left:6px;' }, ['采集图片']),
  ]);
  card.appendChild(doImagesRow);

  const doOcrCheckbox = createEl('input', { type: 'checkbox', checked: false, id: 'doOcr' });
  const doOcrRow = createEl('div', { className: 'row' }, [
    doOcrCheckbox,
    createEl('label', { htmlFor: 'doOcr', style: 'cursor:pointer; margin-left:6px;' }, ['OCR识别（占位，待实现）']),
  ]);
  card.appendChild(doOcrRow);

  // 参数输入
  const maxCommentsInput = createEl('input', { type: 'number', value: '50', min: '1', style: 'width:80px;' });
  const maxCommentsRow = createEl('div', { className: 'row' }, [
    createEl('label', {}, ['最大评论数:']),
    maxCommentsInput,
  ]);
  card.appendChild(maxCommentsRow);

  const maxLikesInput = createEl('input', { type: 'number', value: '2', min: '1', style: 'width:80px;' });
  const maxLikesRow = createEl('div', { className: 'row' }, [
    createEl('label', {}, ['最大点赞数:']),
    maxLikesInput,
  ]);
  card.appendChild(maxLikesRow);

  const likeKeywordsInput = createEl('input', { type: 'text', value: '黄金,走势,涨,跌', placeholder: '逗号分隔', style: 'flex:1;' });
  const likeKeywordsRow = createEl('div', { className: 'row' }, [
    createEl('label', {}, ['点赞关键字:']),
    likeKeywordsInput,
  ]);
  card.appendChild(likeKeywordsRow);

  // 按钮
  const runBtn = createEl('button', {}, ['开始执行']);
  runBtn.onclick = async () => {
    const args = [
      '--keyword', '黄金走势',
      '--env', 'debug',
      '--profile', 'xiaohongshu_batch-2',
      '--do-comments', doCommentsCheckbox.checked ? 'true' : 'false',
      '--do-likes', doLikesCheckbox.checked ? 'true' : 'false',
      '--do-homepage', doHomepageCheckbox.checked ? 'true' : 'false',
      '--do-images', doImagesCheckbox.checked ? 'true' : 'false',
      '--do-ocr', doOcrCheckbox.checked ? 'true' : 'false',
      '--max-comments', String(maxCommentsInput.value || 50),
      '--max-likes', String(maxLikesInput.value || 2),
      '--like-keywords', likeKeywordsInput.value || '',
    ];

    if (dryRunCheckbox.checked) {
      args.push('--dry-run');
    } else {
      args.push('--no-dry-run');
    }

    if (api.runScript) {
      api.runScript('scripts/xiaohongshu/phase-unified-harvest.mjs', args);
    } else {
      console.warn('api.runScript not available');
    }
  };

  const btnRow = createEl('div', { className: 'row' }, [runBtn]);
  card.appendChild(btnRow);

  root.appendChild(card);
}
