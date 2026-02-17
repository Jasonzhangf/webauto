# camo-runtime (vendored)

This directory vendors non-CLI runtime capabilities from `@web-auto/camo` for webauto app-side orchestration.

Included:
- autoscript schema/runtime/template/action providers
- container runtime-core primitives (checkpoint/validation/operations/subscription)
- runtime dependencies used by autoscript execution (`utils/config`, `utils/browser-service`, `events/progress-log`)

CLI-only command routing remains in `@web-auto/camo`.
