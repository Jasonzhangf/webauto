# Utilities Directory

Development tools, scripts, and utilities for the web automation platform.

## Structure

- **local-dev/** - Local development utilities and test scripts
- **scripts/** - Automation and deployment scripts

## Local Development

### 1688 Platform Scripts
Development utilities for 1688.com platform automation:
- **1688-chat-highlight-containers.js** - Chat container highlighting
- **1688-highlight-search-containers-persist.js** - Persistent search highlighting
- **1688-highlight-search-items-all.js** - All search item highlighting
- **1688-home-dismiss-overlays.js** - Home page overlay management
- **1688-home-search-submit.js** - Search submission utilities
- **1688-pick-first-item.js** - First item selection
- **1688-probe-home-search-controls.js** - Search control probing

### Usage
These scripts are used for:
- Manual testing and debugging
- Feature development
- UI element discovery
- Performance testing
- Data validation

## Scripts Directory

### Development Scripts
- **dev/** - Basic development setup scripts
- **development/** - Development environment configuration
- **platform-specific/** - Platform-specific development utilities

### Production Scripts
- **production/** - Production deployment and maintenance
- **service/** - Service management scripts
- **service-tests/** - Service testing utilities
- **tests/** - General testing frameworks
- **utils/** - Common utility scripts

## Common Utilities

### Environment Setup
- Development environment initialization
- Dependency management
- Configuration setup
- Database initialization

### Testing Utilities
- Test data generation
- Mock service setup
- Performance benchmarking
- Integration testing

### Deployment Tools
- Build automation
- Container management
- Service orchestration
- Monitoring setup

## Usage Guidelines

1. **Local Development**: Use scripts in `local-dev/` for quick testing and debugging
2. **Platform Work**: Platform-specific scripts are organized by target platform
3. **Production**: Production scripts include safety checks and rollbacks
4. **Testing**: Use test utilities for automated and manual testing

## Contributing

When adding new utilities:
- Include comprehensive documentation
- Add error handling and logging
- Follow existing naming conventions
- Include usage examples
- Add appropriate tests
