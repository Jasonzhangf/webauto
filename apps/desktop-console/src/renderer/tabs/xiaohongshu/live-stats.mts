import { createEl } from '../../ui-components.mjs';

type LiveStatsOptions = {
  maxCommentsInput: HTMLInputElement;
  linksStat: HTMLSpanElement;
  postsStat: HTMLSpanElement;
  commentsStat: HTMLSpanElement;
  likesStat: HTMLSpanElement;
  repliesStat: HTMLSpanElement;
  streamStat: HTMLSpanElement;
  likedList: HTMLDivElement;
  repliedList: HTMLDivElement;
};

export type LiveStatsController = {
  resetLiveStats: () => void;
  setExpectedLinksTarget: (target: number) => void;
  parseStdoutForEvents: (line: string) => void;
  dispose: () => void;
};

export function createLiveStatsController(opts: LiveStatsOptions): LiveStatsController {
  const {
    maxCommentsInput,
    linksStat,
    postsStat,
    commentsStat,
    likesStat,
    repliesStat,
    streamStat,
    likedList,
    repliedList,
  } = opts;

  const parentDir = (inputPath: string) => {
    const p = String(inputPath || '');
    const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return slash > 0 ? p.slice(0, slash) : '';
  };

  const liveStats = {
    linksCollected: 0,
    linksTarget: 0,
    postsProcessed: 0,
    currentCommentsCollected: 0,
    currentCommentsTarget: '不限',
    likesTotal: 0,
    repliesTotal: 0,
    eventsPath: '',
    noteId: '',
  };

  const activeRunIds = new Set<string>();
  const likedNotes = new Map<string, { count: number; path: string }>();
  const repliedNotes = new Map<string, { count: number; path: string }>();

  const renderActionList = (
    container: HTMLDivElement,
    items: Map<string, { count: number; path: string }>,
    emptyText: string,
  ) => {
    container.innerHTML = '';
    if (items.size === 0) {
      container.appendChild(createEl('div', { className: 'muted' }, [emptyText]));
      return;
    }
    Array.from(items.entries()).forEach(([noteId, item]) => {
      const row = createEl('div', {
        className: 'row',
        style: 'justify-content:space-between; gap:8px; border:1px solid #1f2937; border-radius:6px; padding:6px 8px;',
      });
      row.appendChild(createEl('span', { className: 'muted' }, [`${noteId} × ${item.count}`]));
      const openBtn = createEl('button', { type: 'button', className: 'secondary', style: 'padding:2px 8px;' }, ['打开目录']) as HTMLButtonElement;
      openBtn.onclick = async () => {
        const targetPath = String(item.path || '').trim();
        if (!targetPath) {
          alert('该帖子暂无目录信息');
          return;
        }
        const ret = await window.api.osOpenPath(targetPath);
        if (!ret?.ok) alert(`打开失败：${ret?.error || 'unknown_error'}`);
      };
      row.appendChild(openBtn);
      container.appendChild(row);
    });
  };

  const renderLiveStats = () => {
    linksStat.textContent = `链接采集：${liveStats.linksCollected}/${liveStats.linksTarget || 0}`;
    postsStat.textContent = `帖子处理：${liveStats.postsProcessed}`;
    commentsStat.textContent = `当前帖子评论：${liveStats.currentCommentsCollected}/${liveStats.currentCommentsTarget}`;
    likesStat.textContent = `总点赞：${liveStats.likesTotal}`;
    repliesStat.textContent = `总回复：${liveStats.repliesTotal}`;

    const sourceHint = activeRunIds.size > 0 ? `run=${activeRunIds.size}` : 'run=0';
    const eventsHint = liveStats.eventsPath ? `, events=${liveStats.eventsPath}` : '';
    streamStat.textContent = `数据源：命令日志(cmd-event, ${sourceHint}${eventsHint})`;

    renderActionList(likedList, likedNotes, '暂无点赞命中');
    renderActionList(repliedList, repliedNotes, '暂无回复命中');
  };

  const extractEventsPath = (line: string) => {
    const quoted = line.match(/(?:events=|eventsPath\s*[:=]\s*)(?:"([^"]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)"|'([^']+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)')/i);
    if (quoted?.[1] || quoted?.[2]) return String(quoted[1] || quoted[2] || '').trim();

    const plain = line.match(/(?:events=|eventsPath\s*[:=]\s*)([^\s]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)/i);
    if (!plain?.[1]) return '';
    return String(plain[1]).trim();
  };

  const parseStdoutForEvents = (line: string) => {
    const rawText = String(line || '');
    if (!rawText.trim()) return;

    const runIdMatch = rawText.match(/runId\s*[:=]\s*([A-Za-z0-9_-]+)/);
    if (runIdMatch?.[1]) activeRunIds.add(String(runIdMatch[1]));

    const eventsPath = extractEventsPath(rawText);
    if (eventsPath) liveStats.eventsPath = eventsPath;

    const text = rawText
      .replace(/^\[rid:[^\]]+\]\s*/i, '')
      .replace(/^\[(?:stdout|stderr)\]\s*/i, '')
      .trim();

    const phase2ProgressMatch = text.match(/\[Phase2Collect(?:Links)?\][^\d]*(\d+)\s*\/\s*(\d+)/);
    if (phase2ProgressMatch) {
      liveStats.linksCollected = Number(phase2ProgressMatch[1] || liveStats.linksCollected || 0);
      liveStats.linksTarget = Number(phase2ProgressMatch[2] || liveStats.linksTarget || 0);
    }

    const linksReadyMatch = text.match(/\[Links\][^\d]*(\d+)\s*\/\s*(\d+)/);
    if (linksReadyMatch) {
      liveStats.linksCollected = Math.max(liveStats.linksCollected, Number(linksReadyMatch[1] || 0));
      liveStats.linksTarget = Math.max(liveStats.linksTarget, Number(linksReadyMatch[2] || 0));
    }

    const noteProgressMatch = text.match(/^\[(\d+)\s*\/\s*(\d+)\]\s+slot-\d+\(tab-\d+\)\s+note=([A-Za-z0-9]+)/);
    if (noteProgressMatch) {
      liveStats.postsProcessed = Number(noteProgressMatch[1] || liveStats.postsProcessed || 0);
      liveStats.linksTarget = Math.max(liveStats.linksTarget, Number(noteProgressMatch[2] || liveStats.linksTarget || 0));
      liveStats.noteId = String(noteProgressMatch[3] || '').trim();
      liveStats.currentCommentsCollected = 0;
      liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
        ? String(Math.floor(Number(maxCommentsInput.value || 0)))
        : '不限';
    }

    const postsSummary = text.match(/-\s*处理帖子[:：]\s*(\d+)/);
    if (postsSummary) liveStats.postsProcessed = Number(postsSummary[1] || liveStats.postsProcessed || 0);

    const commentsSummary = text.match(/-\s*(?:评论总量|comments?)[:：]\s*(\d+)/i);
    if (commentsSummary) liveStats.currentCommentsCollected = Number(commentsSummary[1] || liveStats.currentCommentsCollected || 0);

    const likesSummary = text.match(/-\s*(?:点赞总量|likes?)[:：]\s*(\d+)/i);
    if (likesSummary) liveStats.likesTotal = Number(likesSummary[1] || liveStats.likesTotal || 0);

    const repliesSummary = text.match(/-\s*(?:回复总量|replies?)[:：]\s*(\d+)/i);
    if (repliesSummary) liveStats.repliesTotal = Number(repliesSummary[1] || liveStats.repliesTotal || 0);

    const donePath = text.match(/likeEvidenceDir\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
    if ((donePath?.[1] || donePath?.[2] || donePath?.[3]) && liveStats.noteId) {
      const p = String(donePath[1] || donePath[2] || donePath[3] || '').trim();
      likedNotes.set(liveStats.noteId, {
        count: Math.max(1, liveStats.likesTotal),
        path: parentDir(p) || p,
      });
    }

    renderLiveStats();
  };

  const resetLiveStats = () => {
    liveStats.linksCollected = 0;
    liveStats.linksTarget = 0;
    liveStats.postsProcessed = 0;
    liveStats.currentCommentsCollected = 0;
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(maxCommentsInput.value || 0)))
      : '不限';
    liveStats.likesTotal = 0;
    liveStats.repliesTotal = 0;
    liveStats.eventsPath = '';
    liveStats.noteId = '';
    activeRunIds.clear();
    likedNotes.clear();
    repliedNotes.clear();
    renderLiveStats();
  };

  const setExpectedLinksTarget = (target: number) => {
    const normalized = Number.isFinite(target) ? Math.max(0, Math.floor(target)) : 0;
    if (normalized <= 0) return;
    liveStats.linksTarget = Math.max(liveStats.linksTarget, normalized);
    renderLiveStats();
  };

  maxCommentsInput.addEventListener('change', () => {
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(maxCommentsInput.value || 0)))
      : '不限';
    renderLiveStats();
  });

  const dispose = () => {
    // single source mode: no extra polling worker
  };

  resetLiveStats();

  return {
    resetLiveStats,
    setExpectedLinksTarget,
    parseStdoutForEvents,
    dispose,
  };
}
// State integration: taskStateStore will be imported and used here
import { taskStateStore } from '../../hooks/use-task-state.mts';

export function initLiveStats() {
  taskStateStore.start();
  taskStateStore.subscribe((update) => {
    console.log('[LiveStats] state update:', update.type, update.runId);
  });
}
