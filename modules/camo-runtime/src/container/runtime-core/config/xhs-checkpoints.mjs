/**
 * XHS (Xiaohongshu) checkpoint selectors.
 * Platform-specific DOM selectors for checkpoint detection.
 */
export const XHS_CHECKPOINTS = {
  search_ready: [
    '#search-input',
    'input.search-input',
    '.search-result-list',
  ],
  home_ready: [
    '.feeds-page',
    '.note-item',
  ],
  detail_ready: [
    '.note-scroller',
    '.note-content',
    '.interaction-container',
  ],
  comments_ready: [
    '.comments-container',
    '.comment-item',
  ],
  login_guard: [
    '.login-container',
    '.login-dialog',
    '#login-container',
  ],
  risk_control: [
    '.qrcode-box',
    '.captcha-container',
    '[class*="captcha"]',
  ],
};

export const XHS_PLATFORM_HOST = 'xiaohongshu.com';
