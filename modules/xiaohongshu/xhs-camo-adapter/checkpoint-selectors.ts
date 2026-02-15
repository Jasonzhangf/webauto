// XHS Checkpoint Selectors - Map checkpoints to CSS selectors for camo filter
// Used by V2 orchestrator to detect page state via container subscription

export type XhsCheckpointId =
  | 'home_ready'
  | 'search_ready'
  | 'detail_ready'
  | 'comments_ready'
  | 'login_guard'
  | 'risk_control'
  | 'offsite'
  | 'unknown';

export interface CheckpointSelector {
  checkpoint: XhsCheckpointId;
  selectors: string[];
  requireAll: boolean;
  priority: number;
  description: string;
}

// XHS checkpoint selectors using CSS selectors
// These map to the container-library definitions but use direct selectors for camo
export const XHS_CHECKPOINT_SELECTORS: CheckpointSelector[] = [
  {
    checkpoint: 'home_ready',
    selectors: [
      '#search-input',
      'input[placeholder*="搜索"]',
      'input[placeholder*="关键字"]',
      '.search-input',
    ],
    requireAll: false,
    priority: 1,
    description: 'Home page with search input visible',
  },
  {
    checkpoint: 'search_ready',
    selectors: [
      '.feeds-container',
      '.search-result-list',
      '.note-list',
      '[class*="search-result"]',
    ],
    requireAll: false,
    priority: 2,
    description: 'Search results page with result list',
  },
  {
    checkpoint: 'detail_ready',
    selectors: [
      '.note-detail-modal',
      '.note-detail-page',
      '.note-detail-dialog',
      '.detail-container',
      '[class*="detail-container"]',
    ],
    requireAll: false,
    priority: 3,
    description: 'Note detail page/modal visible',
  },
  {
    checkpoint: 'comments_ready',
    selectors: [
      '.comment-section',
      '.comment-list',
      '.comments-container',
      '[class*="comment"]',
    ],
    requireAll: false,
    priority: 4,
    description: 'Comments section visible on detail page',
  },
  {
    checkpoint: 'login_guard',
    selectors: [
      '.login-mask',
      '.login-dialog',
      '.login-modal',
      '[class*="login"]',
    ],
    requireAll: false,
    priority: 0, // Highest priority - blocks everything
    description: 'Login prompt blocking interaction',
  },
  {
    checkpoint: 'risk_control',
    selectors: [
      '.risk-control',
      '.verify-container',
      '[class*="captcha"]',
      '[class*="verify"]',
    ],
    requireAll: false,
    priority: 0,
    description: 'Risk control/verification page',
  },
];

// Get primary selector for a checkpoint (first in the list)
export function getPrimarySelector(checkpoint: XhsCheckpointId): string | null {
  const config = XHS_CHECKPOINT_SELECTORS.find(c => c.checkpoint === checkpoint);
  return config?.selectors[0] || null;
}

// Get all selectors for a checkpoint
export function getAllSelectors(checkpoint: XhsCheckpointId): string[] {
  const config = XHS_CHECKPOINT_SELECTORS.find(c => c.checkpoint === checkpoint);
  return config?.selectors || [];
}

// Get checkpoint config
export function getCheckpointConfig(checkpoint: XhsCheckpointId): CheckpointSelector | undefined {
  return XHS_CHECKPOINT_SELECTORS.find(c => c.checkpoint === checkpoint);
}

// Get checkpoints by priority (lower number = higher priority)
export function getCheckpointsByPriority(): CheckpointSelector[] {
  return [...XHS_CHECKPOINT_SELECTORS].sort((a, b) => a.priority - b.priority);
}

// Blocking checkpoints that require user intervention
export const BLOCKING_CHECKPOINTS: XhsCheckpointId[] = ['login_guard', 'risk_control', 'offsite'];

export function isBlockingCheckpoint(checkpoint: XhsCheckpointId): boolean {
  return BLOCKING_CHECKPOINTS.includes(checkpoint);
}

// Checkpoint transition rules (what can transition to what)
export const CHECKPOINT_TRANSITIONS: Record<XhsCheckpointId, XhsCheckpointId[]> = {
  unknown: ['home_ready', 'search_ready', 'detail_ready', 'login_guard', 'risk_control'],
  home_ready: ['search_ready', 'detail_ready', 'login_guard'],
  search_ready: ['detail_ready', 'home_ready', 'login_guard'],
  detail_ready: ['search_ready', 'home_ready', 'comments_ready', 'login_guard'],
  comments_ready: ['detail_ready', 'search_ready', 'login_guard'],
  login_guard: ['home_ready', 'search_ready'],
  risk_control: ['home_ready', 'search_ready'],
  offsite: [],
};

// Check if transition is valid
export function isValidTransition(from: XhsCheckpointId, to: XhsCheckpointId): boolean {
  if (from === to) return true;
  return CHECKPOINT_TRANSITIONS[from]?.includes(to) || false;
}
