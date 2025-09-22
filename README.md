# Glueful Framework Tools

> Comprehensive development tools for the Glueful PHP framework

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="media/icons/dark/icon-128.png">
  <img alt="Glueful Logo" src="media/icons/light/icon-128.png" width="64" height="64">
</picture>

[![Security Hardened](https://img.shields.io/badge/Security-Hardened-green.svg)](./SECURITY_COMPLIANCE_MATRIX.md)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.93.0+-blue.svg)](https://code.visualstudio.com/)

Transform your Glueful development experience with powerful tools for routes management, performance monitoring, security scanning, and advanced debugging.

## ✨ Key Features

### 🗂️ **Routes Management**
- **Interactive Routes Tree** - Browse all application routes in the Explorer
- **Routes Panel** - Dedicated view with filtering and quick navigation
- **Smart Navigation** - Click any route to jump to its controller method
- **Live Updates** - Automatically refreshes when routes change

![Routes Management](https://via.placeholder.com/600x300?text=Routes+Tree+View+Screenshot)

### 🔍 **Code Intelligence**
- **CodeLens Integration** - Contextual information above controller methods
- **Quick Actions** - Create missing controller methods with one click
- **Smart Snippets** - Pre-built templates for common Glueful patterns
- **Intelligent Navigation** - Seamless jumping between routes and implementations

### 📊 **Performance Monitoring**
- **Real-time Metrics** - Live application performance tracking
- **Query Analysis** - Database query performance and optimization suggestions
- **Memory Monitoring** - Track memory usage and identify bottlenecks
- **Performance Dashboard** - Comprehensive performance overview

![Performance Dashboard](https://via.placeholder.com/600x300?text=Performance+Dashboard+Screenshot)

### 🛡️ **Security Integration**
- **Vulnerability Scanning** - Built-in security analysis
- **Compliance Reporting** - Security posture dashboard
- **Auto-fix Suggestions** - Automated resolution for common issues
- **Build-time Enforcement** - Prevent security regressions

### 🔧 **Development Tools**
- **Container Analysis** - Dependency injection container inspection
- **Advanced Debugging** - Enhanced debugging with breakpoint management
- **Extension Management** - Enable/disable Glueful extensions
- **Documentation Integration** - Context-aware help system

## 🚀 Quick Start

### Installation
<div align="center">

# Glueful Framework Tools

Powerful, secure & fast development tooling for your Glueful PHP apps.

[![Security Hardened](https://img.shields.io/badge/Security-Hardened-green.svg)](./SECURITY_COMPLIANCE_MATRIX.md)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.93.0+-blue.svg)](https://code.visualstudio.com/)

</div>

## Why Install
Accelerate everyday Glueful tasks: explore routes, inspect performance, catch security issues early, debug smarter, and manage extensions—all without leaving VS Code.

## Core Features (At a Glance)
- **Routes Explorer & Panel**: Search, filter, jump to handler.
- **Performance Dashboard**: Live CPU / memory, slow queries, routes, cache stats.
- **Security Center**: Scan code & dependencies, view actionable issues.
- **Advanced Debugging**: Breakpoints list, query & profiler views.
- **Extension Manager**: Enable/disable framework extensions visually.
- **Context Docs**: Quick access to framework guides & cookbook.

## Quick Start
1. Install from Marketplace (search: “Glueful Framework Tools”).
2. Open a Glueful project (auto-detects structure).
3. Open Command Palette → type `Glueful:` to see available commands.
4. Start with: `Glueful: Routes Panel`, `Glueful: Performance Dashboard`, `Glueful: Security Report`.
5. (Optional) Set `glueful.cliPath` if your CLI is not in the default location.

## Everyday Workflows
| Task | Command Palette Entry | Result |
|------|-----------------------|--------|
| View all routes | Glueful: Routes Panel | Filter & jump to controllers |
| Investigate slowness | Glueful: Performance Dashboard | See slow queries & routes |
| Check security posture | Glueful: Security Report | Score + issues + vulnerabilities |
| Debug activity | Glueful: Advanced Debugging | Sessions, breakpoints, queries |
| Manage extensions | Glueful: Extensions Dashboard | Enable/disable & inspect |

## Configuration (Optional)
Add to your VS Code settings JSON if you need overrides:
```jsonc
{
  "glueful.cliPath": "php vendor/bin/glueful",
  "glueful.autoRefresh": true,
  "glueful.performance.enabled": true,
  "glueful.security.autoScan": true
}
```

## Security (Plain Language)
Your data stays local. Webviews are locked down with:
- Strict Content Security Policy & sandboxed panels
- Central factory enforcing HTML escaping & no remote scripts
- Local vendored assets (no CDN execution)
- Build-time checks to prevent regressions

Full details: see the **[Security Compliance Matrix](./SECURITY_COMPLIANCE_MATRIX.md)**.

## Troubleshooting
| Problem | Hint |
|---------|------|
| Routes list is empty | Run your Glueful CLI once; ensure project root detected. |
| Performance metrics flat | App logs/metrics files not present yet (traffic required). |
| Security score 0 | Initial scan not finished—re-run `Glueful: Security Scan`. |
| No Glueful commands appear | Workspace not recognized; ensure `composer.json` + framework structure. |
| CLI errors | Check `glueful.cliPath` or run the command manually in terminal. |

## FAQ
**Does it modify my code?** Only when you explicitly trigger actions (e.g., create files). Passive views never alter source.

**Internet required?** Only for opening external documentation URLs; core features work offline.

**Telemetry?** None. No tracking or data upload.

**Safe for production repos?** Yes—operations are read-focused unless you invoke scaffolding or fixes.

## Requirements
- VS Code 1.93.0+
- PHP 7.4+
- Glueful framework project

## Support & Feedback
- Issues / Ideas: GitHub Issues (repository link)
- Discussions / Q&A: GitHub Discussions
- Security concerns: open a private advisory (link) or email security contact

## License
MIT – see [LICENSE](LICENSE).

---
Enjoy building with Glueful. Feedback welcome! 🚀