This repository uses an agent to help with automation and code changes.

## Coding philosophy for this project

The core programming mindset for this project is:

- **Functional**: Prefer small, focused functions with clear inputs and outputs. Minimize shared mutable state and hidden side effects.
- **Non-flat**: Avoid a "pile of scripts" at the root. Use a layered, hierarchical module structure to express domains and responsibilities.
- **Modular**: Group related logic into modules and packages with clear responsibilities and stable public APIs. Keep cross-module coupling low.
- **Self-contained**: Each module should encapsulate its own configuration, types, and error handling as much as practical, instead of relying on scattered globals.

When adding or refactoring code, prefer:

- Extracting reusable logic into pure functions that can be unit-tested.
- Moving domain-specific flows into service modules, keeping CLI/scripts as thin entrypoints.
- Keeping side effects (I/O, network, browser automation) at the edges, orchestrated by higher-level functions.
- Organizing tests to mirror the module structure (core, services, CLI).

Agents working in this repo should respect these principles and avoid large monolithic scripts or god-objects when implementing new behavior.

