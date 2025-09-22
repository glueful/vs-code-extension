
import * as vscode from 'vscode';
import { GluefulRoutesProvider } from './features/routesTree';
import { registerControllerCodeLens } from './features/codeLens';
import { registerQuickFixes } from './features/codeActions';
import { registerGluefulTasks } from './features/tasks';
import { registerRoutesPanel } from './features/routesPanel';
import { registerStatusBar } from './features/statusBar';
import { registerTestingFeatures } from './features/testing';
import { ContainerAnalysisProvider } from './features/containerAnalysis';
import { PerformanceMonitorProvider } from './features/performanceMonitor';
import { SecurityIntegrationProvider } from './features/securityIntegration';
import { DocumentationIntegrationProvider } from './features/documentationIntegration';
import { RealTimeMonitoringProvider } from './features/realTimeMonitoring';
import { ExtensionSystemIntegrationProvider } from './features/extensionSystemIntegration';
import { AdvancedDebuggingProvider } from './features/advancedDebugging';
import { openSecurePanel, WebviewTemplateBuilder } from './utils/unifiedWebviewFactory';
import { escapeHtml } from './utils/webviewSecurity';

// Lazy provider instances
let _routesProvider: GluefulRoutesProvider | null = null;
let _containerAnalysis: ContainerAnalysisProvider | null = null;
let _performanceMonitor: PerformanceMonitorProvider | null = null;
let _securityIntegration: SecurityIntegrationProvider | null = null;
let _documentationIntegration: DocumentationIntegrationProvider | null = null;
let _realTimeMonitoring: RealTimeMonitoringProvider | null = null;
let _extensionSystemIntegration: ExtensionSystemIntegrationProvider | null = null;
let _advancedDebugging: AdvancedDebuggingProvider | null = null;

// Lazy accessors
function getRoutesProvider(_ctx: vscode.ExtensionContext) { return _routesProvider ??= new GluefulRoutesProvider(); }
function getContainerAnalysis(ctx: vscode.ExtensionContext) { return _containerAnalysis ??= new ContainerAnalysisProvider(ctx); }
function getPerformanceMonitor(ctx: vscode.ExtensionContext) { return _performanceMonitor ??= new PerformanceMonitorProvider(ctx); }
function getSecurityIntegration(ctx: vscode.ExtensionContext) { return _securityIntegration ??= new SecurityIntegrationProvider(ctx); }
function getDocumentationIntegration(ctx: vscode.ExtensionContext) { return _documentationIntegration ??= new DocumentationIntegrationProvider(ctx); }
function getRealTimeMonitoring(ctx: vscode.ExtensionContext) { return _realTimeMonitoring ??= new RealTimeMonitoringProvider(ctx); }
function getExtensionSystemIntegration(ctx: vscode.ExtensionContext) { return _extensionSystemIntegration ??= new ExtensionSystemIntegrationProvider(ctx); }
function getAdvancedDebugging(ctx: vscode.ExtensionContext) { return _advancedDebugging ??= new AdvancedDebuggingProvider(ctx); }

export function activate(ctx: vscode.ExtensionContext) {
  // Register tree data provider with lazy proxy
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('glueful.routes', {
      getTreeItem: (...args) => getRoutesProvider(ctx).getTreeItem(...args),
      getChildren: (...args) => getRoutesProvider(ctx).getChildren(...args),
      onDidChangeTreeData: getRoutesProvider(ctx).onDidChangeTreeData
    }),
    vscode.commands.registerCommand('glueful.refreshRoutes', () => getRoutesProvider(ctx).refresh())
  );

  // Register core features (these are lightweight)
  registerControllerCodeLens(ctx);
  registerQuickFixes(ctx);
  registerGluefulTasks(ctx);
  registerStatusBar(ctx);
  registerRoutesPanel(ctx);
  registerTestingFeatures(ctx);

  // Register container analysis commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.container.showStatus', () => {
      const info = getContainerAnalysis(ctx).getContainerInfo();
      if (info) {
        vscode.window.showInformationMessage(
          `Container: ${info.services.length} services, ${info.providers.length} providers`
        );
      }
    }),
    vscode.commands.registerCommand('glueful.container.validate', async () => {
      const diagnostics = await getContainerAnalysis(ctx).validateContainer();
      if (diagnostics.length === 0) {
        vscode.window.showInformationMessage('Container validation passed');
      } else {
        vscode.window.showWarningMessage(`Container validation found ${diagnostics.length} issues`);
      }
    }),
    vscode.commands.registerCommand('glueful.container.dependencyGraph', () => {
      getContainerAnalysis(ctx).showDependencyGraph();
    })
  );

  // Register performance monitoring commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.performance.dashboard', async () => {
      await vscode.commands.executeCommand('glueful.performance.showDashboard');
    }),
    vscode.commands.registerCommand('glueful.performance.check', async () => {
      const issues = await getPerformanceMonitor(ctx).runPerformanceCheck();
      if (issues.length === 0) {
        vscode.window.showInformationMessage('No performance issues detected');
      } else {
        vscode.window.showWarningMessage(`Found ${issues.length} performance issues`);
      }
    })
  );

  // Register security integration commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.security.dashboard', async () => {
      await vscode.commands.executeCommand('glueful.security.showReport');
    }),
    vscode.commands.registerCommand('glueful.security.quickCheck', async () => {
      const issues = await getSecurityIntegration(ctx).quickSecurityCheck();
      if (issues.length === 0) {
        vscode.window.showInformationMessage('No security issues detected');
      } else {
        vscode.window.showWarningMessage(`Found ${issues.length} security issues`);
      }
    })
  );

  // Register documentation integration commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.docs.help', () => {
      (getDocumentationIntegration(ctx) as any).showQuickHelp();
    })
  );

  // Register real-time monitoring commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.monitoring.start', () => {
      getRealTimeMonitoring(ctx).startMonitoring();
    }),
    vscode.commands.registerCommand('glueful.monitoring.stop', () => {
      getRealTimeMonitoring(ctx).stopMonitoring();
    }),
    vscode.commands.registerCommand('glueful.monitoring.dashboard', () => {
      getRealTimeMonitoring(ctx).showMonitoringDashboard();
    })
  );

  // Register extension system integration commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.extensions.dashboard', () => {
      getExtensionSystemIntegration(ctx).showExtensionsDashboard();
    }),
    vscode.commands.registerCommand('glueful.extensions.enable', async () => {
      const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter extension name to enable'
      });
      if (extensionName) {
        await getExtensionSystemIntegration(ctx).enableExtension(extensionName);
      }
    }),
    vscode.commands.registerCommand('glueful.extensions.disable', async () => {
      const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter extension name to disable'
      });
      if (extensionName) {
        await getExtensionSystemIntegration(ctx).disableExtension(extensionName);
      }
    }),
    vscode.commands.registerCommand('glueful.extensions.create', () => {
      getExtensionSystemIntegration(ctx).createExtensionScaffold();
    })
  );

  // Register advanced debugging commands (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.debug.panel', () => {
      getAdvancedDebugging(ctx).showDebugPanel();
    }),
    vscode.commands.registerCommand('glueful.debug.addBreakpoint', () => {
      getAdvancedDebugging(ctx).addBreakpoint();
    }),
    vscode.commands.registerCommand('glueful.debug.clearBreakpoints', () => {
      getAdvancedDebugging(ctx).clearBreakpoints();
    }),
    vscode.commands.registerCommand('glueful.debug.analyzeQueries', () => {
      getAdvancedDebugging(ctx).analyzeQueries();
    }),
    vscode.commands.registerCommand('glueful.debug.analyzeMemory', () => {
      getAdvancedDebugging(ctx).analyzeMemoryUsage();
    })
  );

  // Register global dashboard command (lazy)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.dashboard', () => {
      showGluefulDashboard(ctx, getContainerAnalysis(ctx), getPerformanceMonitor(ctx), getSecurityIntegration(ctx));
    })
  );

}

function showGluefulDashboard(
  ctx: vscode.ExtensionContext,
  containerAnalysis: ContainerAnalysisProvider,
  performanceMonitor: PerformanceMonitorProvider,
  securityIntegration: SecurityIntegrationProvider
): void {
  // Get data first before using in template
  const containerInfo = containerAnalysis.getContainerInfo();
  const performanceMetrics = performanceMonitor.getMetrics();
  const securityMetrics = securityIntegration.getSecurityMetrics();

  // Generate dashboard content
  const dashboardContent = generateDashboardContent(containerInfo, performanceMetrics, securityMetrics);

  const template = new WebviewTemplateBuilder()
    .title('Glueful Framework Dashboard')
    .content(dashboardContent)
    .addAction({
      id: 'glueful.container.validate',
      label: 'Validate Container',
      enabled: true
    })
    .addAction({
      id: 'glueful.performance.refresh',
      label: 'Refresh Metrics',
      enabled: true
    })
    .addAction({
      id: 'glueful.security.scan',
      label: 'Security Scan',
      enabled: true
    })
    .addMetadata('Services', containerInfo?.services.length || 0)
    .addMetadata('Security Score', `${securityMetrics.securityScore}/100`)
    .build();

  // Create panel using secure factory
  openSecurePanel(
    {
      viewType: 'gluefulDashboard',
      title: 'Glueful Framework Dashboard',
      retainContextWhenHidden: true,
      handlers: {
        'glueful.container.validate': async () => {
          await vscode.commands.executeCommand('glueful.container.validate');
        },
        'glueful.container.dependencyGraph': async () => {
          await vscode.commands.executeCommand('glueful.container.dependencyGraph');
        },
        'glueful.performance.dashboard': async () => {
          await vscode.commands.executeCommand('glueful.performance.dashboard');
        },
        'glueful.performance.check': async () => {
          await vscode.commands.executeCommand('glueful.performance.check');
        },
        'glueful.security.dashboard': async () => {
          await vscode.commands.executeCommand('glueful.security.dashboard');
        },
        'glueful.security.scan': async () => {
          await vscode.commands.executeCommand('glueful.security.scan');
        },
        'glueful.docs.help': async () => {
          await vscode.commands.executeCommand('glueful.docs.help');
        }
      }
    },
    template,
    ctx
  );
}

function generateDashboardContent(
  containerInfo: any,
  performanceMetrics: any,
  securityMetrics: any
): string {
  return `
    <style>
        body {
            font-family: var(--vscode-font-family);
            margin: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        .dashboard-header { text-align: center; margin-bottom: 30px; }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card {
            background: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 20px;
        }
        .card-title { font-size: 1.2em; font-weight: bold; margin-bottom: 15px; }
        .metric { margin: 8px 0; }
        .metric-label { font-weight: bold; }
        .metric-value { float: right; }
        .status-good { color: var(--vscode-testing-iconPassed); }
        .status-warning { color: var(--vscode-testing-iconQueued); }
        .status-error { color: var(--vscode-testing-iconFailed); }
        .action-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 8px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
            font-family: inherit;
        }
        .action-button:hover { background: var(--vscode-button-hoverBackground); }
    </style>

    <div class="dashboard-header">
        <h1>🔧 Glueful Framework Dashboard</h1>
        <p>Development environment overview and quick actions</p>
    </div>

    <div class="dashboard-grid">
        <!-- Container Status -->
        <div class="card">
            <div class="card-title">📦 DI Container</div>
            <div class="metric">
                <span class="metric-label">Services:</span>
                <span class="metric-value">${escapeHtml((containerInfo?.services.length || 0).toString())}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Providers:</span>
                <span class="metric-value">${escapeHtml((containerInfo?.providers.length || 0).toString())}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Circular Dependencies:</span>
                <span class="metric-value ${(containerInfo?.circularDeps.length || 0) > 0 ? 'status-error' : 'status-good'}">
                    ${escapeHtml((containerInfo?.circularDeps.length || 0).toString())}
                </span>
            </div>
            <button class="action-button" data-cmd="glueful.container.validate">Validate</button>
            <button class="action-button" data-cmd="glueful.container.dependencyGraph">View Graph</button>
        </div>

        <!-- Performance Status -->
        <div class="card">
            <div class="card-title">⚡ Performance</div>
            <div class="metric">
                <span class="metric-label">Queries Tracked:</span>
                <span class="metric-value">${escapeHtml(performanceMetrics.queries.length.toString())}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Routes Tracked:</span>
                <span class="metric-value">${escapeHtml(performanceMetrics.routes.length.toString())}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Memory Samples:</span>
                <span class="metric-value">${escapeHtml(performanceMetrics.memory.length.toString())}</span>
            </div>
            <button class="action-button" data-cmd="glueful.performance.dashboard">Dashboard</button>
            <button class="action-button" data-cmd="glueful.performance.check">Run Check</button>
        </div>

        <!-- Security Status -->
        <div class="card">
            <div class="card-title">🛡️ Security</div>
            <div class="metric">
                <span class="metric-label">Security Score:</span>
                <span class="metric-value ${securityMetrics.securityScore >= 85 ? 'status-good' : securityMetrics.securityScore >= 70 ? 'status-warning' : 'status-error'}">
                    ${escapeHtml(securityMetrics.securityScore.toString())}/100
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">Total Issues:</span>
                <span class="metric-value">${escapeHtml(securityMetrics.totalIssues.toString())}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Critical Issues:</span>
                <span class="metric-value ${securityMetrics.criticalIssues > 0 ? 'status-error' : 'status-good'}">
                    ${escapeHtml(securityMetrics.criticalIssues.toString())}
                </span>
            </div>
            <button class="action-button" data-cmd="glueful.security.dashboard">Security Report</button>
            <button class="action-button" data-cmd="glueful.security.scan">Run Scan</button>
        </div>

        <!-- Quick Actions -->
        <div class="card">
            <div class="card-title">🚀 Quick Actions</div>
            <button class="action-button" data-cmd="glueful.docs.help">📚 Documentation</button>
        </div>
    </div>
  `;
}

export function deactivate() {
  // Dispose all lazy-loaded providers to prevent memory leaks
  // Most providers use context subscriptions which are automatically disposed,
  // but some like routes provider have manual watchers that need cleanup
  if (_routesProvider && typeof _routesProvider.dispose === 'function') {
    _routesProvider.dispose();
  }
  if (_securityIntegration && typeof _securityIntegration.dispose === 'function') {
    _securityIntegration.dispose();
  }

  // Clear all references
  _routesProvider = null;
  _containerAnalysis = null;
  _performanceMonitor = null;
  _securityIntegration = null;
  _documentationIntegration = null;
  _realTimeMonitoring = null;
  _extensionSystemIntegration = null;
  _advancedDebugging = null;
}
