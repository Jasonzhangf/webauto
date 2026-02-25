/**
 * Smart Reply Panel - 智能回复配置面板
 * 
 * 功能：
 * 1. 从已爬取数据中分析高频关键词
 * 2. 配置关键词匹配规则
 * 3. 设置回复意图和风格
 * 4. dryRun 模式预览
 * 5. 真实回复执行
 */

import { createEl, labeledInput, labeledSelect, section, row, alertBox } from '../ui-components.mts';

interface SmartReplyConfig {
  enabled: boolean;
  keyword: string;
  matchKeywords: string[];
  replyIntent: string;
  replyStyle: string;
  maxLength: number;
  dryRun: boolean;
  requireConfirmation: boolean;
  rateLimitMinInterval: number;
  rateLimitMaxPerSession: number;
}

interface KeywordStat {
  word: string;
  count: number;
}

interface MatchedComment {
  id: string;
  author: string;
  text: string;
  matched: boolean;
}

export function renderSmartReplyPanel(root: HTMLElement, ctx: any) {
  // State
  let config: SmartReplyConfig = {
    enabled: false,
    keyword: '',
    matchKeywords: [],
    replyIntent: '',
    replyStyle: '友好、自然、口语化',
    maxLength: 100,
    dryRun: true,
    requireConfirmation: true,
    rateLimitMinInterval: 3000,
    rateLimitMaxPerSession: 20,
  };
  
  let keywordStats: KeywordStat[] = [];
  let matchedComments: MatchedComment[] = [];
  let isAnalyzing = false;
  let isRunning = false;

  // UI Elements
  const container = createEl('div', { className: 'smart-reply-panel' });
  
  // Header
  const header = createEl('div', { className: 'panel-header' }, [
    createEl('h2', {}, ['智能回复配置']),
    createEl('p', { className: 'muted' }, ['基于 AI 自动生成评论回复']),
  ]);
  
  // Section 1: 数据源配置
  const dataSourceSection = section('数据源配置', [
    row([
      labeledInput('关键词目录', createEl('input', { 
        placeholder: '如: deepseek', 
        value: config.keyword 
      }) as HTMLInputElement, (val) => {
        config.keyword = val;
      }),
      createEl('button', { className: 'primary' }, ['分析评论数据']),
    ]),
    createEl('div', { className: 'hint' }, ['从已爬取的评论数据中分析高频关键词']),
  ]);
  
  // Section 2: 关键词统计结果
  const keywordStatsEl = createEl('div', { className: 'keyword-stats hidden' });
  
  function renderKeywordStats(stats: KeywordStat[]) {
    keywordStatsEl.innerHTML = '';
    keywordStatsEl.classList.remove('hidden');
    
    const title = createEl('h4', {}, ['高频关键词 TOP 20']);
    const list = createEl('div', { className: 'keyword-list' });
    
    stats.slice(0, 20).forEach((stat, i) => {
      const item = createEl('div', { 
        className: 'keyword-item',
        'data-word': stat.word,
      }, [
        createEl('span', { className: 'rank' }, [`${i + 1}.`]),
        createEl('span', { className: 'word' }, [stat.word]),
        createEl('span', { className: 'count muted' }, [`(${stat.count}次)`]),
      ]);
      
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
        const word = stat.word;
        if (item.classList.contains('selected')) {
          if (!config.matchKeywords.includes(word)) {
            config.matchKeywords.push(word);
          }
        } else {
          config.matchKeywords = config.matchKeywords.filter(w => w !== word);
        }
        updateSelectedKeywords();
      });
      
      list.appendChild(item);
    });
    
    keywordStatsEl.appendChild(title);
    keywordStatsEl.appendChild(list);
  }
  
  // Selected keywords display
  const selectedKeywordsEl = createEl('div', { className: 'selected-keywords' });
  
  function updateSelectedKeywords() {
    selectedKeywordsEl.innerHTML = '';
    if (config.matchKeywords.length === 0) {
      selectedKeywordsEl.appendChild(createEl('span', { className: 'muted' }, ['点击上方关键词进行选择']));
      return;
    }
    
    config.matchKeywords.forEach(word => {
      const tag = createEl('span', { className: 'keyword-tag' }, [
        word,
        createEl('span', { className: 'remove' }, ['×']),
      ]);
      tag.querySelector('.remove')?.addEventListener('click', () => {
        config.matchKeywords = config.matchKeywords.filter(w => w !== word);
        updateSelectedKeywords();
        // Update selection in list
        const item = keywordStatsEl.querySelector(`[data-word="${word}"]`);
        item?.classList.remove('selected');
      });
      selectedKeywordsEl.appendChild(tag);
    });
  }
  
  // Section 3: 回复配置
  const replyConfigSection = section('回复配置', [
    labeledInput('回复中心意思', createEl('textarea', { 
      placeholder: '如: 感谢认可，告诉对方具体信息',
      rows: 3,
    }) as HTMLTextAreaElement, (val) => {
      config.replyIntent = val;
    }),
    
    labeledSelect('回复风格', [
      { value: '友好、自然、口语化', label: '友好自然' },
      { value: '专业、简洁、有条理', label: '专业简洁' },
      { value: '幽默、轻松、有趣', label: '幽默轻松' },
      { value: '热情、积极、活力', label: '热情积极' },
    ], (val) => {
      config.replyStyle = val;
    }),
    
    labeledInput('字数限制', createEl('input', { 
      type: 'number', 
      value: String(config.maxLength),
      min: '10',
      max: '500',
    }) as HTMLInputElement, (val) => {
      config.maxLength = parseInt(val) || 100;
    }),
  ]);
  
  // Section 4: 流控配置
  const rateLimitSection = section('流控配置（防风控）', [
    row([
      labeledInput('最小间隔(ms)', createEl('input', { 
        type: 'number', 
        value: String(config.rateLimitMinInterval),
      }) as HTMLInputElement, (val) => {
        config.rateLimitMinInterval = parseInt(val) || 3000;
      }),
      labeledInput('每Session最大回复数', createEl('input', { 
        type: 'number', 
        value: String(config.rateLimitMaxPerSession),
      }) as HTMLInputElement, (val) => {
        config.rateLimitMaxPerSession = parseInt(val) || 20;
      }),
    ]),
  ]);
  
  // Section 5: 执行配置
  const execConfigSection = section('执行配置', [
    labeledInput('dryRun 预览模式', createEl('input', { 
      type: 'checkbox',
      checked: config.dryRun,
    }) as HTMLInputElement, (val) => {
      config.dryRun = val === 'true';
    }),
    labeledInput('截图确认', createEl('input', { 
      type: 'checkbox',
      checked: config.requireConfirmation,
    }) as HTMLInputElement, (val) => {
      config.requireConfirmation = val === 'true';
    }),
  ]);
  
  // Section 6: 命中评论预览
  const previewSection = createEl('div', { className: 'preview-section hidden' });
  
  function renderPreview(comments: MatchedComment[]) {
    previewSection.innerHTML = '';
    previewSection.classList.remove('hidden');
    
    const title = createEl('h4', {}, [`命中评论预览 (${comments.length}条)`]);
    const list = createEl('div', { className: 'comment-preview-list' });
    
    comments.slice(0, 5).forEach(comment => {
      const item = createEl('div', { className: 'comment-preview-item' }, [
        createEl('div', { className: 'author' }, [comment.author]),
        createEl('div', { className: 'text' }, [comment.text]),
      ]);
      list.appendChild(item);
    });
    
    if (comments.length > 5) {
      list.appendChild(createEl('div', { className: 'more' }, [`还有 ${comments.length - 5} 条...`]));
    }
    
    previewSection.appendChild(title);
    previewSection.appendChild(list);
  }
  
  // Action buttons
  const actionButtons = createEl('div', { className: 'action-buttons' }, [
    createEl('button', { 
      className: 'secondary',
      disabled: isRunning,
    }, ['生成测试回复']),
    createEl('button', { 
      className: 'primary',
      disabled: isRunning,
    }, [config.dryRun ? 'DryRun 预览' : '开始智能回复']),
  ]);
  
  // Status/Log area
  const statusArea = createEl('div', { className: 'status-area' });
  
  function updateStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
    statusArea.innerHTML = '';
    statusArea.appendChild(alertBox(message, type));
  }
  
  // Assemble
  container.appendChild(header);
  container.appendChild(dataSourceSection);
  container.appendChild(keywordStatsEl);
  container.appendChild(createEl('div', { className: 'section' }, [
    createEl('h4', {}, ['已选关键词']),
    selectedKeywordsEl,
  ]));
  container.appendChild(replyConfigSection);
  container.appendChild(rateLimitSection);
  container.appendChild(execConfigSection);
  container.appendChild(previewSection);
  container.appendChild(actionButtons);
  container.appendChild(statusArea);
  
  root.appendChild(container);
  
  // Initialize
  updateSelectedKeywords();
}
