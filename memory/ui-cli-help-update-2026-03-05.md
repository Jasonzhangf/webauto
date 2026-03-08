# UI CLI Help Update 2026-03-05

## Summary
- Updated local CLI help in `bin/webauto.mjs` to include `webauto ui cli --help` in Usage and Examples.
- Global installed `webauto` at `/opt/homebrew/bin/webauto` remains old; local script `node bin/webauto.mjs --help` shows updated help.

## Context
- User request: "you need to find ui cli and update help in local program, do not modify dist".
- The global `webauto` help output lacked `ui cli`; local repo help already has it in `bin/webauto.mjs` and was patched to add explicit `ui cli --help` lines.

## Related Implementation Notes
- `xhs_expand_replies` was implemented to click visible `.show-more` reply expand elements using subscription event payload \(no JS click\), and only if visible in viewport.
