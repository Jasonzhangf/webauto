const FORBIDDEN_JS_ACTION_RULES = [
  { code: 'dom_click', re: /\.click\s*\(/i },
  { code: 'dispatch_event', re: /\.dispatchEvent\s*\(/i },
  { code: 'js_scroll_by', re: /\bscrollBy\s*\(/i },
  { code: 'js_scroll_to', re: /\bscrollTo\s*\(/i },
  { code: 'js_scroll_into_view', re: /\bscrollIntoView\s*\(/i },
  { code: 'keyboard_event_ctor', re: /\bKeyboardEvent\s*\(/i },
  { code: 'input_event_ctor', re: /\bInputEvent\s*\(/i },
  { code: 'dom_value_assign', re: /\.value\s*=/i },
];

export function detectForbiddenJsAction(script = '') {
  const source = String(script || '');
  for (const rule of FORBIDDEN_JS_ACTION_RULES) {
    if (rule.re.test(source)) return rule.code;
  }
  return null;
}

export function assertNoForbiddenJsAction(script = '', scope = 'evaluate') {
  const hit = detectForbiddenJsAction(script);
  if (!hit) return;
  throw new Error(`${scope} blocked: forbidden_js_action(${hit})`);
}

export function isJsExecutionEnabled() {
  return false;
}
