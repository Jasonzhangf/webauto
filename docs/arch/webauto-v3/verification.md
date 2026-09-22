# WebAuto v3 Verification Plan

## Focused unit gates

- event envelope validation;
- monotonic sequence allocation;
- replay reconstruction;
- terminal operation idempotency;
- guard union validation;
- invocation ID stability;
- page DAG pre/post anchor behavior;
- artifact generation/digest validation;
- Weibo extraction projection;
- compatibility command dispatch.

## Integration gates

- fixture page: observe -> choose -> guard -> act -> verify -> complete;
- stale selector: guard blocks and emits regression evidence;
- workflow: producer -> links -> consumer -> validated details;
- existing Weibo entry: command resolves to the v3 CLI.

## Live gates

Live browser gates are separate from source gates and require an active Camo
profile. They are run only when the environment is available:

- viewport initialization before any action;
- one live page DAG;
- one Weibo task replay.

## Reporting rule

Source tests, fixture integration, live browser replay, and merge are
different evidence levels. A lower level must never be reported as a higher
one.
