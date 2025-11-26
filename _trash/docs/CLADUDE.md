# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

WebAuto is a dual-language web automation platform combining Python and Node.js for advanced browser automation with stealth capabilities and workflow orchestration.

### Core Components

**Browser Entry Points (MUST USE THESE):**
- `libs/browser/browser.js` - Node.js browser interface (primary entry)
- `abstract_browser.py` - Python abstract browser interface
- Security enforced via `libs/browser/security/enforce-imports.js` (prevents direct camoufox/playwright imports)

**Service Architecture:**
- Orchestrator: `sharedmodule/engines/orchestrator/server.ts` - Manages workflow/vision engines
- API Gateway: `services/engines/api-gateway/` - REST endpoints for browser operations
- Vision Engine: `services/engines/vision-engine/` - Computer vision & UI recognition
- Container Engine: `services/engines/container-engine/` - Container-based automation
- Configuration: Service ports defined in CONFIG.ports (7703, 3120)

**Operations Framework:**
- `/libs/operations-framework/` - Atomic operations for browser control
- Event-driven workflow engine
- Self-refreshing containers for dynamic content
- Platform-specific containers (1688, Weibo)

## Development Commands

```bash
# Build & Development
npm run build:services          # Compile TypeScript services to dist/
npm run dev:all                 # Start all services in development mode
npm run start:orchestrator      # Start orchestrator service
npm run start:workflow-api      # Start workflow API service
npm run start:vision            # Start vision engine service

# Browser Management
npm run browser:oneclick        # Quick browser test
npm run browser:camoufox:oneclick     # Camoufox stealth mode test
npm run browser:camoufox:install      # Install/update Camoufox browser
npm run service:browser:restart       # Restart browser service
npm run service:browser:restart:python # Restart Python browser service

# Testing
npm run test:services           # Run service tests
npm run test:vision             # Run vision tests
python test_integrated_system.py      # Python integration test
python test_cookie_integration.py     # Cookie management test
```

## Key Architectural Rules

1. **Browser Access Forbidden Direct:** Never import Playwright, Camoufox, or Selenium directly. Always use browser interface files.

2. **Dual Language Boundary:** Python handles browser control/automation, Node.js handles service layer/APIs. Maintain clear separation.

3. **Service Communication:** HTTP/REST JSON-based, port-based discovery. Services must register with orchestrator.

4. **Container System:** All UI interactions go through container abstractions. Containers self-refresh for dynamic content.

5. **Event-Driven Operations:** Operations framework uses events for container discovery and workflow execution.

## TypeScript Configuration

- Target: ES2022, module: ESNext
- Services compile to `dist/` with source maps
- Root tsconfig for page analyzer, services tsconfig for backend services
- Output modules with proper Node.js compatibility

## Testing Strategy

- Python tests: `test_*.py` files for browser integration
- Service tests: Node.js-based in service directories
- Integration tests for complete workflows
- Cookie persistence testing
- Stealth mode validation with Camoufox