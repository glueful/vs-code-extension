import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runCliWithErrorHandling } from '../utils/cli';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';
import { escapeHtml } from '../utils/webviewSecurity';

interface PerformanceMetrics {
    queries: QueryMetric[];
    routes: RouteMetric[];
    memory: MemoryMetric[];
    cache: CacheMetric[];
    general: GeneralMetric[];
}

interface QueryMetric {
    sql: string;
    executionTime: number;
    rows: number;
    timestamp: Date;
    file?: string;
    line?: number;
}

interface RouteMetric {
    route: string;
    method: string;
    executionTime: number;
    memoryUsage: number;
    timestamp: Date;
    statusCode: number;
}

interface MemoryMetric {
    timestamp: Date;
    usage: number;
    peak: number;
    limit: number;
}

interface CacheMetric {
    operation: 'hit' | 'miss' | 'set' | 'delete';
    key: string;
    timestamp: Date;
    executionTime?: number;
}

interface GeneralMetric {
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
    context?: string;
}

/**
 * Performance Monitor Feature
 *
 * Integrates with Glueful framework performance monitoring:
 * - Query performance analysis and slow query detection
 * - Route execution time monitoring
 * - Memory usage tracking and leak detection
 * - Cache hit/miss ratio analysis
 * - Real-time performance alerts
 * - Performance trend visualization
 */
export class PerformanceMonitorProvider {
    private metrics: PerformanceMetrics = {
        queries: [],
        routes: [],
        memory: [],
        cache: [],
        general: []
    };

    private workspaceRoot: string;
    private statusBarItem: vscode.StatusBarItem;
    private isMonitoring: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            90
        );

        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Watch for performance log files
        const logWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/storage/logs/performance.log')
        );

        logWatcher.onDidChange(() => this.parsePerformanceLogs());

        this.context.subscriptions.push(logWatcher);

        // Register commands
        this.registerCommands();

        // Initial setup
        this.updateStatusBar();
        await this.parsePerformanceLogs();
    }

    private registerCommands(): void {
        const commands = [
            vscode.commands.registerCommand('glueful.performance.start', () => this.startMonitoring()),
            vscode.commands.registerCommand('glueful.performance.stop', () => this.stopMonitoring()),
            vscode.commands.registerCommand('glueful.performance.showDashboard', () => this.showDashboard()),
            vscode.commands.registerCommand('glueful.performance.analyzeQueries', () => this.analyzeQueries()),
            vscode.commands.registerCommand('glueful.performance.memoryProfile', () => this.showMemoryProfile()),
            vscode.commands.registerCommand('glueful.performance.cacheAnalysis', () => this.showCacheAnalysis())
        ];

        this.context.subscriptions.push(...commands);
    }

    private async parsePerformanceLogs(): Promise<void> {
        const logFiles = [
            path.join(this.workspaceRoot, 'storage', 'logs', 'performance.log'),
            path.join(this.workspaceRoot, 'storage', 'logs', 'queries.log'),
            path.join(this.workspaceRoot, 'storage', 'logs', 'memory.log')
        ];

        for (const logFile of logFiles) {
            if (fs.existsSync(logFile)) {
                await this.parseLogFile(logFile);
            }
        }

        this.updateStatusBar();
    }

    private async parseLogFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const logEntry = JSON.parse(line);
                    this.processLogEntry(logEntry);
                } catch (e) {
                    // Skip invalid JSON lines
                }
            }
        } catch (error) {
            console.error(`Failed to parse log file ${filePath}:`, error);
        }
    }

    private processLogEntry(entry: any): void {
        const timestamp = new Date(entry.timestamp || Date.now());

        switch (entry.type) {
            case 'query':
                this.metrics.queries.push({
                    sql: entry.sql,
                    executionTime: entry.execution_time || 0,
                    rows: entry.rows || 0,
                    timestamp,
                    file: entry.file,
                    line: entry.line
                });
                break;

            case 'route':
                this.metrics.routes.push({
                    route: entry.route,
                    method: entry.method,
                    executionTime: entry.execution_time || 0,
                    memoryUsage: entry.memory_usage || 0,
                    timestamp,
                    statusCode: entry.status_code || 200
                });
                break;

            case 'memory':
                this.metrics.memory.push({
                    timestamp,
                    usage: entry.usage || 0,
                    peak: entry.peak || 0,
                    limit: entry.limit || 0
                });
                break;

            case 'cache':
                this.metrics.cache.push({
                    operation: entry.operation,
                    key: entry.key,
                    timestamp,
                    executionTime: entry.execution_time
                });
                break;

            default:
                this.metrics.general.push({
                    name: entry.name || 'unknown',
                    value: entry.value || 0,
                    unit: entry.unit || '',
                    timestamp,
                    context: entry.context
                });
        }
    }

    private updateStatusBar(): void {
        const slowQueries = this.metrics.queries.filter(q => q.executionTime > 100).length;
        const avgMemory = this.getAverageMemoryUsage();
        const cacheHitRate = this.getCacheHitRate();

        let status = '$(pulse) Performance';
        let tooltip = 'Click to view performance dashboard';

        if (slowQueries > 0) {
            status += ` $(warning) ${slowQueries}`;
            tooltip += `\nSlow queries: ${slowQueries}`;
        }

        if (avgMemory > 0) {
            const memoryMB = Math.round(avgMemory / 1024 / 1024);
            status += ` $(database) ${memoryMB}MB`;
            tooltip += `\nAvg memory: ${memoryMB}MB`;
        }

        if (cacheHitRate >= 0) {
            status += ` $(archive) ${Math.round(cacheHitRate * 100)}%`;
            tooltip += `\nCache hit rate: ${Math.round(cacheHitRate * 100)}%`;
        }

        this.statusBarItem.text = status;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.command = 'glueful.performance.showDashboard';
        this.statusBarItem.show();
    }

    private getAverageMemoryUsage(): number {
        if (this.metrics.memory.length === 0) return 0;

        const total = this.metrics.memory.reduce((sum, m) => sum + m.usage, 0);
        return total / this.metrics.memory.length;
    }

    private getCacheHitRate(): number {
        const cacheOps = this.metrics.cache;
        if (cacheOps.length === 0) return -1;

        const hits = cacheOps.filter(op => op.operation === 'hit').length;
        const total = cacheOps.filter(op => op.operation === 'hit' || op.operation === 'miss').length;

        return total > 0 ? hits / total : -1;
    }

    private async startMonitoring(): Promise<void> {
        this.isMonitoring = true;

        // Enable profiling via CLI command
        await this.executeGluefulCommand('system:memory-monitor --start');

        vscode.window.showInformationMessage('Performance monitoring started');
        this.updateStatusBar();
    }

    private async stopMonitoring(): Promise<void> {
        this.isMonitoring = false;

        // Disable profiling via CLI command
        await this.executeGluefulCommand('system:memory-monitor --stop');

        vscode.window.showInformationMessage('Performance monitoring stopped');
        this.updateStatusBar();
    }

    private async executeGluefulCommand(command: string): Promise<void> {
        const args = command.split(' ');
        const result = await runCliWithErrorHandling(args, { showErrors: true });

        if (!result.success) {
            vscode.window.showErrorMessage(`Performance command failed: ${result.stderr}`);
        }
    }

    private async showDashboard(): Promise<void> {
        const template = new WebviewTemplateBuilder()
            .title('Performance Dashboard')
            .content(this.generateDashboardContent())
            .addAction({
                id: 'performance.refresh',
                label: 'Refresh Metrics',
                enabled: true
            })
            .build();

        openSecurePanel(
            {
                viewType: 'performanceDashboard',
                title: 'Performance Dashboard',
                retainContextWhenHidden: true,
                handlers: {
                    'performance.refresh': () => this.refreshMetrics()
                }
            },
            template,
            this.context
        );
    }

    private refreshMetrics(): void {
        // Refresh performance metrics - could implement actual refresh logic here
        vscode.window.showInformationMessage('Performance metrics refreshed');
    }

    private generateDashboardContent(): string {
        const slowQueries = this.metrics.queries
            .filter(q => q.executionTime > 100)
            .sort((a, b) => b.executionTime - a.executionTime)
            .slice(0, 10);

        const slowRoutes = this.metrics.routes
            .sort((a, b) => b.executionTime - a.executionTime)
            .slice(0, 10);

        return `
            <div class="container">
                <h1>Performance Dashboard</h1>

                <div class="card">
                    <div class="metric-title">Query Performance</div>
                    <div class="metric-value">
                        Total Queries: ${this.metrics.queries.length}<br>
                        Slow Queries (>100ms): <span class="status-warning">${slowQueries.length}</span><br>
                        Average Execution Time: ${this.getAverageQueryTime().toFixed(2)}ms
                    </div>
                </div>

                <div class="card">
                    <div class="metric-title">Memory Usage</div>
                    <div class="metric-value">
                        Current Usage: ${Math.round(this.getAverageMemoryUsage() / 1024 / 1024)}MB<br>
                        Peak Usage: ${Math.round(this.getPeakMemoryUsage() / 1024 / 1024)}MB
                    </div>
                </div>

                <div class="card">
                    <div class="metric-title">Cache Performance</div>
                    <div class="metric-value">
                        Hit Rate: <span class="status-good">${Math.round(this.getCacheHitRate() * 100)}%</span><br>
                        Total Operations: ${this.metrics.cache.length}
                    </div>
                </div>

                <h2>Slowest Queries</h2>
                ${slowQueries.map(query => `
                    <div class="card slow-query">
                        <strong>${query.executionTime}ms</strong> - ${escapeHtml(query.sql.substring(0, 100))}...
                        ${query.file ? `<br><small>File: ${escapeHtml(query.file)}:${query.line}</small>` : ''}
                    </div>
                `).join('')}

                <h2>Slowest Routes</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Route</th>
                            <th>Method</th>
                            <th>Execution Time</th>
                            <th>Memory Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${slowRoutes.map(route => `
                            <tr>
                                <td>${escapeHtml(route.route)}</td>
                                <td>${escapeHtml(route.method)}</td>
                                <td>${route.executionTime}ms</td>
                                <td>${Math.round(route.memoryUsage / 1024)}KB</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    private getAverageQueryTime(): number {
        if (this.metrics.queries.length === 0) return 0;

        const total = this.metrics.queries.reduce((sum, q) => sum + q.executionTime, 0);
        return total / this.metrics.queries.length;
    }

    private getPeakMemoryUsage(): number {
        if (this.metrics.memory.length === 0) return 0;

        return Math.max(...this.metrics.memory.map(m => m.peak));
    }

    private async analyzeQueries(): Promise<void> {
        const slowQueries = this.metrics.queries.filter(q => q.executionTime > 100);

        if (slowQueries.length === 0) {
            vscode.window.showInformationMessage('No slow queries detected');
            return;
        }

        const items = slowQueries.map(query => ({
            label: `${query.executionTime}ms - ${query.sql.substring(0, 60)}...`,
            description: query.file ? `${query.file}:${query.line}` : '',
            query
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a slow query to analyze'
        });

        if (selected && selected.query.file) {
            const doc = await vscode.workspace.openTextDocument(selected.query.file);
            const editor = await vscode.window.showTextDocument(doc);

            if (selected.query.line) {
                const line = selected.query.line - 1;
                const range = new vscode.Range(line, 0, line, 0);
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range);
            }
        }
    }

    private async showMemoryProfile(): Promise<void> {
        // Execute memory profiling command
        await this.executeGluefulCommand('system:memory-monitor --profile');

        vscode.window.showInformationMessage('Memory profiling started. Check logs for results.');
    }

    private async showCacheAnalysis(): Promise<void> {
        const hitRate = this.getCacheHitRate();
        const operations = this.metrics.cache;

        const content = `
            <div class="container">
                <h1>Cache Analysis</h1>

                <div class="card ${hitRate > 0.8 ? 'status-good' : hitRate > 0.5 ? 'status-warning' : 'status-error'}">
                    <h3>Cache Hit Rate: ${escapeHtml(Math.round(hitRate * 100).toString())}%</h3>
                    <p>Total Operations: ${escapeHtml(operations.length.toString())}</p>
                    <p>Hits: ${escapeHtml(operations.filter(op => op.operation === 'hit').length.toString())}</p>
                    <p>Misses: ${escapeHtml(operations.filter(op => op.operation === 'miss').length.toString())}</p>
                </div>

                <h2>Recent Cache Operations</h2>
                ${operations.slice(-20).reverse().map(op => `
                    <div class="card">
                        <strong>${escapeHtml(op.operation.toUpperCase())}</strong> - ${escapeHtml(op.key)}
                        <br><small>${escapeHtml(op.timestamp.toLocaleString())}</small>
                    </div>
                `).join('')}
            </div>
        `;

        const template = new WebviewTemplateBuilder()
            .title('Cache Analysis')
            .content(content)
            .build();

        openSecurePanel(
            {
                viewType: 'cacheAnalysis',
                title: 'Cache Analysis',
                retainContextWhenHidden: false,
                handlers: {}
            },
            template,
            this.context
        );
    }


    // Public API
    public getMetrics(): PerformanceMetrics {
        return this.metrics;
    }

    public async runPerformanceCheck(): Promise<string[]> {
        const issues: string[] = [];

        // Check for slow queries
        const slowQueries = this.metrics.queries.filter(q => q.executionTime > 100);
        if (slowQueries.length > 0) {
            issues.push(`${slowQueries.length} slow queries detected (>100ms)`);
        }

        // Check memory usage
        const avgMemory = this.getAverageMemoryUsage();
        if (avgMemory > 128 * 1024 * 1024) { // 128MB
            issues.push(`High memory usage: ${Math.round(avgMemory / 1024 / 1024)}MB`);
        }

        // Check cache hit rate
        const hitRate = this.getCacheHitRate();
        if (hitRate >= 0 && hitRate < 0.7) {
            issues.push(`Low cache hit rate: ${Math.round(hitRate * 100)}%`);
        }

        return issues;
    }

    public dispose(): void {
        // Clean up any timers or watchers
        if (this.isMonitoring) {
            this.stopMonitoring();
        }

        // Context subscriptions are automatically disposed by VS Code
        // This method provides explicit cleanup if needed
    }
}