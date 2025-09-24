# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development
- **Build**: `pnpm run compile` - Compile TypeScript to JavaScript
- **Watch mode**: `pnpm run watch` - Auto-compile on changes
- **Package extension**: `pnpm run package` - Create VSIX package

### Testing
- **Run all tests**: `pnpm test` or `pnpm run test:run`
- **Watch tests**: `pnpm test` (interactive mode with Vitest)
- **Test UI**: `pnpm run test:ui` - Open Vitest UI
- **Coverage**: `pnpm run test:coverage` - Generate coverage report
- **Single test file**: `pnpm test src/path/to/file.test.ts`

### Code Quality
- **Lint**: `pnpm run lint` - Check for linting issues
- **Lint fix**: `pnpm run lint:fix` - Auto-fix linting issues
- **Format check**: `pnpm run format` - Check formatting
- **Format fix**: `pnpm run format:fix` - Auto-format code
- **Security scan**: `pnpm run security:scan` - Run security lint
- **Security enforcement**: `pnpm run security:enforce` - CI security checks
- **Full security**: `pnpm run security:full` - All security checks

### Pre-commit
- **Pre-commit checks**: `pnpm run precommit` - Runs security enforcement, linting, and compilation

## Architecture

### Core Structure
The extension follows a feature-based modular architecture with strict security practices:

- **Entry point**: `src/extension.ts` - Activates the extension and registers all features using lazy loading pattern
- **Features** (`src/features/`): Each feature is a self-contained module with its own provider class
- **Utils** (`src/utils/`): Shared utilities including the critical security infrastructure
- **Services** (`src/services/`): Background services like project indexing

### Security Architecture
The extension implements a comprehensive security model centered around webview isolation:

- **Unified Webview Factory** (`src/utils/unifiedWebviewFactory.ts`): Central factory enforcing security for all webviews
  - Strict Content Security Policy (CSP) enforcement
  - HTML escaping via `escapeHtml` function
  - No external scripts allowed - all assets must be local
  - Sandboxed iframe isolation

- **Security Utilities** (`src/utils/webviewSecurity.ts`): Core security functions including HTML escaping
- **Security Config** (`src/config/securityConfig.ts`): Centralized security configuration and CSP templates

### Feature Providers
Each feature is implemented as a provider class that encapsulates its functionality:

1. **Routes Management** (`routesTree.ts`, `routesPanel.ts`): Interactive routes explorer and panel
2. **Container Analysis** (`containerAnalysis.ts`): Dependency injection container inspection
3. **Performance Monitoring** (`performanceMonitor.ts`): Real-time performance tracking
4. **Security Integration** (`securityIntegration.ts`): Vulnerability scanning and reporting
5. **Real-time Monitoring** (`realTimeMonitoring.ts`): Live metrics dashboard
6. **Extension System** (`extensionSystemIntegration.ts`): Glueful extension management
7. **Advanced Debugging** (`advancedDebugging.ts`): Enhanced debugging tools
8. **Documentation** (`documentationIntegration.ts`): Context-aware help system

### Command Registration Pattern
Commands follow a lazy registration pattern to optimize startup performance:
- Commands are registered immediately but providers are only instantiated when first accessed
- Provider instances are cached after first creation
- All webview panels go through the unified factory for security

### Testing Infrastructure
- Uses Vitest for unit testing
- Test files colocated with source files (`*.test.ts`)
- Global test setup in `src/test/setup.ts`
- Mock VS Code API available in tests

### Build Process
- TypeScript compilation with strict type checking
- Security enforcement scripts run during CI/CD
- Pre-commit hooks ensure code quality and security
- All webview content is sanitized at build time