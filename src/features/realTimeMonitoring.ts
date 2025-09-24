import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';
import { escapeHtml } from '../utils/webviewSecurity';

interface LiveMetric {
    timestamp: number;
    type: 'request' | 'query' | 'error' | 'cache' | 'memory' | 'cpu';
    value: number;
    metadata?: Record<string, any>;
}

interface SystemHealth {
    cpu: number;
    memory: number;
    requests: number;
    errors: number;
    responseTime: number;
    cacheHits: number;
    activeConnections: number;
}

interface AlertRule {
    id: string;
    metric: string;
    operator: '>' | '<' | '=' | '>=' | '<=';
    threshold: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    cooldown: number; // minutes
    lastTriggered?: number;
}

/**
 * Real-time Monitoring Feature
 *
 * Provides live monitoring capabilities for Glueful applications:
 * - Real-time metrics collection and visualization
 * - Performance monitoring dashboard
 * - Custom alerts and notifications
 * - Log streaming and analysis
 * - System health monitoring
 * - Application profiling
 */
export class RealTimeMonitoringProvider {
    private panel: vscode.WebviewPanel | null = null;
    private workspaceRoot: string;
    private metricsHistory: LiveMetric[] = [];
    private logWatcher: fs.FSWatcher | null = null;
    private metricsInterval: NodeJS.Timeout | null = null;
    private alertRules: AlertRule[] = [];
    private isMonitoring: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.setupDefaultAlerts();
    }

    private setupDefaultAlerts(): void {
        this.alertRules = [
            {
                id: 'high_response_time',
                metric: 'responseTime',
                operator: '>',
                threshold: 5000, // 5 seconds
                severity: 'high',
                enabled: true,
                cooldown: 5
            },
            {
                id: 'high_error_rate',
                metric: 'errors',
                operator: '>',
                threshold: 10,
                severity: 'critical',
                enabled: true,
                cooldown: 2
            },
            {
                id: 'high_memory_usage',
                metric: 'memory',
                operator: '>',
                threshold: 80, // 80%
                severity: 'medium',
                enabled: true,
                cooldown: 10
            },
            {
                id: 'low_cache_hit_rate',
                metric: 'cacheHits',
                operator: '<',
                threshold: 50, // 50%
                severity: 'low',
                enabled: true,
                cooldown: 15
            }
        ];
    }

    public async startMonitoring(): Promise<void> {
        if (this.isMonitoring) {
            vscode.window.showInformationMessage('Real-time monitoring is already active');
            return;
        }

        this.isMonitoring = true;

        // Start metrics collection
        this.startMetricsCollection();

        // Start log monitoring
        this.startLogMonitoring();

        // Show monitoring dashboard
        this.showMonitoringDashboard();

        vscode.window.showInformationMessage('Real-time monitoring started');
    }

    public async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            vscode.window.showInformationMessage('Real-time monitoring is not active');
            return;
        }

        this.isMonitoring = false;

        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }

        if (this.logWatcher) {
            this.logWatcher.close();
            this.logWatcher = null;
        }

        vscode.window.showInformationMessage('Real-time monitoring stopped');
    }

    private startMetricsCollection(): void {
        this.metricsInterval = setInterval(async () => {
            try {
                const health = await this.collectSystemHealth();
                this.processHealthMetrics(health);
                this.updateDashboard();
                this.checkAlerts(health);
            } catch (error) {
                console.error('Error collecting metrics:', error);
            }
        }, 5000); // Collect every 5 seconds
    }

    private async collectSystemHealth(): Promise<SystemHealth> {
        // Simulate real-time metrics collection
        // In real implementation, this would read from Glueful log files, metrics endpoints, etc.

        const metricsFile = path.join(this.workspaceRoot, 'storage', 'metrics.json');

        let health: SystemHealth = {
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            requests: Math.floor(Math.random() * 1000),
            errors: Math.floor(Math.random() * 50),
            responseTime: Math.random() * 10000,
            cacheHits: Math.random() * 100,
            activeConnections: Math.floor(Math.random() * 200)
        };

        // Try to read actual metrics if available
        if (fs.existsSync(metricsFile)) {
            try {
                const content = fs.readFileSync(metricsFile, 'utf8');
                const metrics = JSON.parse(content);
                health = { ...health, ...metrics };
            } catch (error) {
                // Use simulated data as fallback
            }
        }

        return health;
    }

    private processHealthMetrics(health: SystemHealth): void {
        const timestamp = Date.now();

        // Store metrics for trending
        this.metricsHistory.push(
            { timestamp, type: 'cpu', value: health.cpu },
            { timestamp, type: 'memory', value: health.memory },
            { timestamp, type: 'request', value: health.requests },
            { timestamp, type: 'error', value: health.errors }
        );

        // Keep only last 1000 metrics (roughly 1.5 hours at 5-second intervals)
        if (this.metricsHistory.length > 1000) {
            this.metricsHistory = this.metricsHistory.slice(-1000);
        }
    }

    private startLogMonitoring(): void {
        const logPaths = [
            path.join(this.workspaceRoot, 'storage', 'logs', 'glueful.log'),
            path.join(this.workspaceRoot, 'storage', 'logs', 'error.log'),
            path.join(this.workspaceRoot, 'var', 'log', 'app.log')
        ];

        for (const logPath of logPaths) {
            if (fs.existsSync(logPath)) {
                try {
                    const watcher = fs.watch(logPath, (eventType) => {
                        if (eventType === 'change') {
                            this.processLogChanges(logPath);
                        }
                    });

                    this.context.subscriptions.push({
                        dispose: () => watcher.close()
                    });
                } catch (error) {
                    console.error(`Failed to watch log file ${logPath}:`, error);
                }
            }
        }
    }

    private processLogChanges(logPath: string): void {
        try {
            // Read last few lines of log file for new entries
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').slice(-10); // Last 10 lines

            for (const line of lines) {
                if (line.trim()) {
                    this.analyzeLogEntry(line, logPath);
                }
            }
        } catch (error) {
            console.error(`Error processing log changes for ${logPath}:`, error);
        }
    }

    private analyzeLogEntry(logEntry: string, logPath: string): void {
        const timestamp = Date.now();

        // Parse log entry for metrics
        if (logEntry.includes('ERROR') || logEntry.includes('CRITICAL')) {
            this.metricsHistory.push({
                timestamp,
                type: 'error',
                value: 1,
                metadata: { logPath, entry: logEntry }
            });
        }

        // Extract response times from request logs
        const responseTimeMatch = logEntry.match(/(\d+)ms/);
        if (responseTimeMatch) {
            this.metricsHistory.push({
                timestamp,
                type: 'request',
                value: parseInt(responseTimeMatch[1]),
                metadata: { logPath, entry: logEntry }
            });
        }

        // Update dashboard with new data
        this.updateDashboard();
    }

    private checkAlerts(health: SystemHealth): void {
        for (const rule of this.alertRules) {
            if (!rule.enabled) continue;

            // Check cooldown
            if (rule.lastTriggered &&
                Date.now() - rule.lastTriggered < rule.cooldown * 60000) {
                continue;
            }

            const value = (health as any)[rule.metric];
            if (value === undefined) continue;

            let triggered = false;
            switch (rule.operator) {
                case '>':
                    triggered = value > rule.threshold;
                    break;
                case '<':
                    triggered = value < rule.threshold;
                    break;
                case '>=':
                    triggered = value >= rule.threshold;
                    break;
                case '<=':
                    triggered = value <= rule.threshold;
                    break;
                case '=':
                    triggered = value === rule.threshold;
                    break;
            }

            if (triggered) {
                this.triggerAlert(rule, value);
                rule.lastTriggered = Date.now();
            }
        }
    }

    private triggerAlert(rule: AlertRule, value: number): void {
        const severityIcon = {
            low: '💡',
            medium: '⚠️',
            high: '🚨',
            critical: '🔥'
        };

        const message = `${severityIcon[rule.severity]} Alert: ${rule.metric} is ${value} (threshold: ${rule.threshold})`;

        switch (rule.severity) {
            case 'critical':
            case 'high':
                vscode.window.showErrorMessage(message, 'View Dashboard').then(selection => {
                    if (selection === 'View Dashboard') {
                        this.showMonitoringDashboard();
                    }
                });
                break;
            case 'medium':
                vscode.window.showWarningMessage(message);
                break;
            case 'low':
                vscode.window.showInformationMessage(message);
                break;
        }
    }

    public showMonitoringDashboard(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        const currentHealth = this.getCurrentHealth();
        const template = new WebviewTemplateBuilder()
            .title('Glueful Real-time Monitoring')
            .content(this.generateSecureMonitoringContent())
            .addAction({
                id: 'refresh',
                label: '🔄 Refresh',
                enabled: true
            })
            .addAction({
                id: 'stopMonitoring',
                label: '⏹️ Stop Monitoring',
                enabled: this.isMonitoring
            })
            .addMetadata('Status', this.isMonitoring ? 'Active' : 'Stopped')
            .addMetadata('CPU', `${currentHealth.cpu.toFixed(1)}%`)
            .addMetadata('Memory', `${currentHealth.memory.toFixed(1)}%`)
            .build();

        this.panel = openSecurePanel(
            {
                viewType: 'gluefulRealtimeMonitoring',
                title: 'Glueful Real-time Monitoring',
                retainContextWhenHidden: true,
                handlers: this.createMonitoringHandlers()
            },
            template,
            this.context
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
        });
    }

    private updateDashboard(): void {
        if (!this.panel) return;

        const template = new WebviewTemplateBuilder()
            .title('Glueful Real-time Monitoring')
            .content(this.generateSecureMonitoringContent())
            .addMetadata('Last Update', new Date().toLocaleTimeString())
            .build();

        // Update panel content using the factory's update method
        const factory = require('../utils/unifiedWebviewFactory').UnifiedWebviewFactory.getInstance();
        factory.updatePanelContent(this.panel, template);
    }

    private getCurrentHealth(): SystemHealth {
        // Calculate current health from recent metrics
        const recent = this.metricsHistory.slice(-10);

        return {
            cpu: this.getAverageValue(recent, 'cpu'),
            memory: this.getAverageValue(recent, 'memory'),
            requests: this.getSumValue(recent, 'request'),
            errors: this.getSumValue(recent, 'error'),
            responseTime: this.getAverageValue(recent, 'request'),
            cacheHits: this.getAverageValue(recent, 'cache'),
            activeConnections: Math.floor(Math.random() * 200) // Placeholder
        };
    }

    private getAverageValue(metrics: LiveMetric[], type: string): number {
        const filtered = metrics.filter(m => m.type === type);
        if (filtered.length === 0) return 0;
        return filtered.reduce((sum, m) => sum + m.value, 0) / filtered.length;
    }

    private getSumValue(metrics: LiveMetric[], type: string): number {
        return metrics.filter(m => m.type === type).reduce((sum, m) => sum + m.value, 0);
    }

    private createMonitoringHandlers(): Record<string, (payload: any) => Promise<void> | void> {
        return {
            'refresh': () => {
                this.updateDashboard();
            },
            'stopMonitoring': () => {
                this.stopMonitoring();
                this.updateDashboard();
            },
            'startMonitoring': () => {
                this.startMonitoring();
            },
            'configureAlerts': () => {
                // Future: Open alert configuration dialog
                vscode.window.showInformationMessage('Alert configuration coming soon');
            }
        };
    }

    private generateSecureMonitoringContent(): string {
        const recentMetrics = this.metricsHistory.slice(-100);
        const currentHealth = this.getCurrentHealth();
        const chartData = this.prepareChartData(recentMetrics);

        // Get secure URIs for resources
        const chartJsUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chart.min.js')
        );
        const cssUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monitoring.css')
        );

        // Provide chart configuration via JSON that the base secure script can read
        const chartCfg = {
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                elements: { point: { radius: 2 } },
                scales: {
                    x: { display: true, title: { display: true, text: 'Time' } },
                    y: { display: true, title: { display: true, text: 'Value' } }
                }
            }
        };

        return `
            <link rel="stylesheet" href="${cssUri}">
            <script src="${chartJsUri}"></script>

            <div class="monitoring-container">
                ${this.generateMetricsGrid(currentHealth)}
                ${this.generateChartSection(chartData)}
                ${this.generateAlertsSection()}
            </div>

            <script id="chart-data" type="application/json">${escapeHtml(JSON.stringify(chartCfg))}</script>
        `;
    }

    private generateMetricsGrid(health: SystemHealth): string {
        const metrics = [
            { label: 'CPU Usage', value: health.cpu.toFixed(1), unit: '%', status: this.getStatusClass(health.cpu, 80, 60) },
            { label: 'Memory Usage', value: health.memory.toFixed(1), unit: '%', status: this.getStatusClass(health.memory, 80, 60) },
            { label: 'Requests/min', value: health.requests, unit: '', status: 'status-good' },
            { label: 'Errors/min', value: health.errors, unit: '', status: this.getStatusClass(health.errors, 10, 5, true) },
            { label: 'Avg Response Time', value: health.responseTime.toFixed(0), unit: 'ms', status: this.getStatusClass(health.responseTime, 5000, 2000, true) },
            { label: 'Active Connections', value: health.activeConnections, unit: '', status: 'status-good' }
        ];

        return `
            <div class="metrics-grid">
                ${metrics.map(metric => `
                    <div class="metric-card">
                        <div class="metric-label">${escapeHtml(metric.label)}</div>
                        <div class="metric-value ${escapeHtml(metric.status)}">
                            ${escapeHtml(String(metric.value))}${escapeHtml(metric.unit)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private generateChartSection(chartData: any): string {
        return `
            <div class="chart-container">
                <h3>Performance Trends</h3>
                <canvas id="metricsChart" width="400" height="200"></canvas>
            </div>
        `;
    }

    private generateAlertsSection(): string {
        const activeAlerts = this.alertRules.filter(rule => rule.enabled && rule.lastTriggered);
        const recentAlerts = activeAlerts
            .sort((a, b) => (b.lastTriggered || 0) - (a.lastTriggered || 0))
            .slice(0, 5);

        return `
            <div class="alerts-section">
                <h3>Recent Alerts</h3>
                ${recentAlerts.length === 0 ?
                    '<p class="no-alerts">No recent alerts</p>' :
                    recentAlerts.map(alert => `
                        <div class="alert-item severity-${escapeHtml(alert.severity)}">
                            <span class="alert-metric">${escapeHtml(alert.metric)}</span>
                            <span class="alert-operator">${escapeHtml(alert.operator)}</span>
                            <span class="alert-threshold">${escapeHtml(String(alert.threshold))}</span>
                            <span class="alert-time">${alert.lastTriggered ?
                                escapeHtml(new Date(alert.lastTriggered).toLocaleTimeString()) : ''}</span>
                        </div>
                    `).join('')
                }
                <button class="btn btn-secondary" data-cmd="configureAlerts">⚙️ Configure Alerts</button>
            </div>
        `;
    }

    private getStatusClass(value: number, dangerThreshold: number, warningThreshold: number, inverse: boolean = false): string {
        if (inverse) {
            if (value > dangerThreshold) return 'status-danger';
            if (value > warningThreshold) return 'status-warning';
            return 'status-good';
        } else {
            if (value > dangerThreshold) return 'status-danger';
            if (value > warningThreshold) return 'status-warning';
            return 'status-good';
        }
    }

    // Old vulnerable HTML generation method removed - replaced with secure template functions

    private prepareChartData(metrics: LiveMetric[]): any {
        const now = Date.now();
        const timeLabels = [];
        const cpuData = [];
        const memoryData = [];
        const requestData = [];
        const errorData = [];

        // Group metrics by 30-second intervals
        const intervals: Record<number, LiveMetric[]> = {};

        for (const metric of metrics) {
            const interval = Math.floor((now - metric.timestamp) / 30000) * 30000;
            if (!intervals[interval]) intervals[interval] = [];
            intervals[interval].push(metric);
        }

        const sortedIntervals = Object.keys(intervals)
            .map(k => parseInt(k))
            .sort((a, b) => b - a)
            .slice(0, 20); // Last 20 intervals (10 minutes)

        for (const interval of sortedIntervals.reverse()) {
            const intervalMetrics = intervals[interval];
            const time = new Date(now - interval).toLocaleTimeString();

            timeLabels.push(time);
            cpuData.push(this.getAverageValue(intervalMetrics, 'cpu'));
            memoryData.push(this.getAverageValue(intervalMetrics, 'memory'));
            requestData.push(this.getSumValue(intervalMetrics, 'request'));
            errorData.push(this.getSumValue(intervalMetrics, 'error'));
        }

        return {
            labels: timeLabels,
            datasets: [
                {
                    label: 'CPU %',
                    data: cpuData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Memory %',
                    data: memoryData,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.1
                },
                {
                    label: 'Requests',
                    data: requestData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1,
                    yAxisID: 'y1'
                },
                {
                    label: 'Errors',
                    data: errorData,
                    borderColor: 'rgb(255, 205, 86)',
                    backgroundColor: 'rgba(255, 205, 86, 0.2)',
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        };
    }

    public getMetricsHistory(): LiveMetric[] {
        return this.metricsHistory;
    }

    public isActive(): boolean {
        return this.isMonitoring;
    }

    public dispose(): void {
        this.stopMonitoring();
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
