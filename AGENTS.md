# WebAuto AI Agent Guide

## Project Overview

WebAuto is a sophisticated web automation platform that combines Python and Node.js technologies to provide stealth browser automation, visual recognition, and workflow orchestration capabilities. The platform focuses on anti-detection browser operations with comprehensive Chinese language support.

### Core Technology Stack

- **Primary Runtime**: Node.js with TypeScript (ES2022 target)
- **Python Integration**: UI recognition services and specific automation tasks
- **Browser Automation**: Camoufox and Playwright with anti-detection measures
- **Key Dependencies**: camoufox (^0.1.10), playwright (^1.56.0), sharp (^0.33.5), iconv-lite (^0.6.3)

### Project Architecture

The project follows a microservices architecture with clear separation of concerns:

```
webauto/
├── libs/           # Shared libraries and core modules
│   ├── browser/    # Browser automation core (Node.js)
│   ├── ui-recognition/  # Python-based visual recognition
│   ├── workflows/  # Workflow execution framework
│   └── containers/ # Container orchestration
├── services/       # Backend services (Node.js)
│   ├── engines/    # Core service engines
│   ├── api/        # API gateways
│   └── shared/     # Shared utilities
├── apps/           # Application layer
├── utils/scripts/  # Build and development scripts
└── docs/           # Comprehensive documentation
```

## Build and Development Commands

### Core Commands
```bash
# Build all services
npm run build:services

# Start main application
npm start

# Development mode with all services
npm run dev:all

# Individual service control
npm run start:workflow-api      # Port 7701
npm run start:vision-proxy      # Port 7702  
npm run start:orchestrator      # Port 7700
npm run start:container-engine  # Port 7703

# Testing
npm run test:services
npm run test:vision
npm run test:simple
npm run test:camoufox
```

### Browser Testing
```bash
# Python browser tests
python test_browser_module.py
python test_camoufox.py
python test_cookie_integration.py

# Node.js browser tests  
node test-camoufox.js
node simple-test.js
```

## Code Structure and Conventions

## 项目规则 (Project Rules)

- 应用层不得直接访问浏览器底层实现，必须通过浏览器应用模块的统一接口访问。禁止在应用代码中直接导入或使用底层库（如 `playwright`、`camoufox`、`selenium` 等）。
- 每个功能模块必须有"全局唯一入口"。大模块（例如浏览器）只能通过其唯一入口进行访问与集成：浏览器模块唯一入口为 `libs/browser/browser.js`。严禁跨过入口直接引用模块内部文件。
- **CRITICAL**: 所有浏览器操作必须通过 `libs/browser/browser.js` 统一入口，禁止绕过直接使用任何底层实现。这是系统架构的核心要求。

### Python Components

**Browser Interface Layer**:
- `browser_interface.py` - **MAIN ENTRY POINT** for all browser operations
- `abstract_browser.py` - Security-enforced abstract interface
- `browser_manager.py` - Browser lifecycle management

**Security Model**:
```python
# ✅ Correct usage
from browser_interface import create_browser, quick_test, stealth_mode

# ❌ Forbidden (blocked by security system)
from playwright.sync_api import sync_playwright
from camoufox import NewBrowser
```

**Key Classes**:
- `AbstractBrowser` - Base interface with forbidden module enforcement
- `SecurityError` - Exception for unauthorized access attempts

### Node.js Components

**Browser Module** (`libs/browser/`):
- `browser.js` - **UNIFIED ENTRY POINT** - Main browser interface and the only valid entry point
- `browser-manager.js` - Browser instance management with singleton pattern
- `playwright-browser.js` - Playwright browser implementation (internal use only)
- `cookie-manager.js` - Cookie handling with URL-based auto-injection
- `browser-config.js` - Configuration management with Chinese support
- `fingerprint-manager.js` - Browser fingerprint generation and management
- `remote-service.js` - HTTP+SSE remote control service
- `browser-service-config.js` - Service configuration management
- `abstract-browser.js` - Abstract base class with security enforcement
- `default-profile.js` - Default profile creation and management
- `browser-errors.js` - Comprehensive error definitions
- `security/enforce-imports.js` - Runtime import security enforcement

### TypeScript Configuration
- Target: ES2022
- Module: ESNext
- Output: `./dist/` directory
- Strict mode disabled for flexibility
- Source maps enabled for debugging

## Testing Strategy

### Multi-Language Testing
The project maintains comprehensive testing in both Python and Node.js:

**Python Tests**:
- Unit tests for browser operations
- Integration tests for cookie management
- Anti-detection validation tests
- Chinese language support tests

**Node.js Tests**:
- Browser functionality tests
- Service health checks
- Performance benchmarks
- Cross-platform compatibility tests

### Test Organization
- `test_*.py` files for Python tests
- `test-*.js` files for Node.js tests
- Separate test suites for different components
- Mock data for consistent testing

## Security Considerations

### Access Control
- **Forbidden Modules**: Playwright, Camoufox, Selenium cannot be imported directly
- **Abstract Interface**: All browser operations must go through `browser_interface.py` (Python) or `libs/browser/browser.js` (Node.js)
- **Resource Management**: Context managers enforced for proper cleanup
- **Isolation**: Separate environments for different service components
- **Runtime Enforcement**: `security/enforce-imports.js` prevents direct imports at runtime
- **Critical Rule**: **All browser operations MUST go through `libs/browser/browser.js` unified entry point**

### Anti-Detection Measures
- Custom user agents and browser fingerprints
- Proxy rotation and IP masking
- Cookie management and session preservation
- Behavior randomization to mimic human users

## Development Workflow

### Setting Up Development Environment
```bash
# Install dependencies
npm install

# Build services
npm run build:services

# Start in development mode
npm run dev:all

# Verify all services are healthy
curl http://localhost:7700/health
```

### Code Style Guidelines
- **Python**: Follow PEP 8, use type hints, comprehensive docstrings
- **JavaScript/TypeScript**: ES6+ syntax, async/await patterns, module exports
- **Documentation**: Chinese and English comments, extensive README files
- **Error Handling**: Custom exception classes with descriptive messages

### Adding New Features
1. Update appropriate interface layer (Python or Node.js)
2. Add corresponding tests
3. Update documentation in `docs/` directory
4. Test integration with existing services
5. Update `AGENTS.md` if architectural changes made

## API and Service Architecture

### Service Ports
- 7700: Orchestrator (main coordination)
- 7701: Workflow API (automation endpoints)
- 7702: Vision Proxy (UI recognition)
- 7703: Container Engine (workflow execution)
- 7704: Browser Remote Service (HTTP + SSE) — configured via `config/browser-service.json`

### Health Monitoring
All services expose `/health` endpoints for monitoring and orchestration.

### Key APIs
- Browser automation through unified interface
- Workflow execution with context isolation
- Visual recognition and UI analysis
- Container-based task orchestration

## Important Notes for AI Agents

### Entry Points
- **Python**: Always use `browser_interface.py` as the import source
- **Node.js**: Use `libs/browser/browser.js` for browser operations
- **Services**: Access through orchestrator at port 7700; browser service at port 7704

### Common Pitfalls
1. **Direct Library Import**: Never import Playwright/Camoufox directly
2. **Resource Management**: Always use context managers for browser instances
3. **Service Dependencies**: Ensure required services are running before integration
4. **Configuration**: Use provided configuration files, avoid hardcoded parameters

### Best Practices
- Leverage the abstract interfaces for consistent behavior
- Use built-in cookie management for session persistence
- Test anti-detection measures regularly
- Monitor service health through provided endpoints
- Follow the established error handling patterns

### Camoufox Fingerprint Profiles (Memory)
- Python 统一入口 `browser_interface.py` 已内置 **指纹模式**：
  - `fingerprint_profile='fixed'`（默认）：为每个 `profile_id` 生成并缓存一套 Camoufox `launch_options`，后续启动复用同一指纹（适合 1688 等强绑定站点）。
  - `fingerprint_profile='random'`：每次启动随机指纹，仅在显式传入时启用。
- 固定指纹配置保存位置：`~/.webauto/camoufox-profiles/launch_options_<profile_id>.json`。
- 一键启动浏览器时：
  - 默认使用 `fingerprint_profile='fixed', profile_id='1688-main-v1'`（与 1688 登录场景共用同一指纹）。
  - 推荐为 1688 场景显式传入独立的 `session_name`（例如 `1688-fixed-v1`），确保 cookie 与指纹一起可复用。
- Camoufox 字体指纹已在入口层禁用，并在页面级自动注入中文字体 CSS，避免中文渲染为方框。

### 交互式浏览器启动共识
- **统一使用 `open_profile_browser(...)` 启动 Camoufox**，不要在新代码中直接调用 `CamoufoxBrowserWrapper._ensure_browser()` 或手动管理进程：
  - 默认行为：
    - 同一 `profile_id` 下 **互斥**：启动前自动尝试终止已有 Camoufox 进程；
    - 使用固定指纹（`fingerprint_profile='fixed'`，默认 profile 为 `1688-main-v1`）+ 自动会话（`auto_session=True`）；
    - 自动会话将通过后台线程每隔约 5 秒保存一次 `storage_state`，并在 `close()` 时再做最终保存；
    - 启动后自动注入最小悬浮菜单（`install_overlay`）；
    - 创建并前置一个 about:blank 空白标签页，同时尽可能关闭 Camoufox 自带启动页，**不自动打开任何业务 URL**。
  - 示例：
    ```python
    from browser_interface import open_profile_browser

    with open_profile_browser(profile_id='1688-main-v1') as browser:
        page = browser.new_page()
        page.goto('https://www.1688.com')
    ```

### Language Preference
The project uses both Chinese and English in documentation and code comments. Chinese is primarily used in:
- User-facing documentation
- Code comments and docstrings
- Error messages for better local developer experience

English is used for:
- Technical specifications
- API definitions
- Configuration files
- International code collaboration

## Deployment and Production

### Environment Variables
Key environment variables for production deployment:
- `PORT_ORCH`, `PORT_WORKFLOW`, `PORT_VISION`, `PORT_CONTAINER`
- `PYTHON_BIN`, `PY_SERVICE_ENTRY` for Python services
- `LMSTUDIO_ENDPOINT`, `LMSTUDIO_MODEL` for AI integration
- `VISION_TARGET_*` variables for image processing

### Production Build
```bash
# Build for production
npm run build:services

# Start production services
npm run start:unified:prod
```

### Monitoring
- All services expose health endpoints
- Centralized logging through service orchestrator
- Performance metrics collection built-in
- Error tracking and alerting capabilities

This comprehensive platform provides enterprise-level web automation with strong emphasis on stealth operations, visual understanding, and scalable microservices architecture.
