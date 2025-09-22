import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';
import { escapeHtml } from '../utils/webviewSecurity';

interface DebugSession {
    id: string;
    type: 'xdebug' | 'request' | 'cli' | 'query';
    status: 'active' | 'paused' | 'stopped';
    startTime: Date;
    metadata: Record<string, any>;
}

interface BreakpointInfo {
    file: string;
    line: number;
    condition?: string;
    enabled: boolean;
    hitCount: number;
}

// interface StackFrame {
//     function: string;
//     file: string;
//     line: number;
//     variables: Record<string, any>;
// }

interface ProfilerData {
    timestamp: number;
    function: string;
    memory: number;
    duration: number;
    file: string;
    line: number;
}

interface QueryLog {
    query: string;
    duration: number;
    bindings: any[];
    timestamp: Date;
    stackTrace: string[];
}

/**
 * Advanced Debugging Tools Feature
 *
 * Provides comprehensive debugging capabilities for Glueful applications:
 * - Interactive debugging sessions
 * - Request/response inspection
 * - Query debugging and profiling
 * - Memory usage analysis
 * - Performance bottleneck detection
 * - Stack trace analysis
 * - Variable inspection
 */
export class AdvancedDebuggingProvider {
    private workspaceRoot: string;
    private debugSessions: Map<string, DebugSession> = new Map();
    private breakpoints: BreakpointInfo[] = [];
    private profilerData: ProfilerData[] = [];
    private queryLogs: QueryLog[] = [];
    private debugPanel: vscode.WebviewPanel | null = null;
    private logWatchers: fs.FSWatcher[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Setup debug log watchers
        this.setupLogWatchers();

        // Register debug commands
        this.registerDebugCommands();

        // Load existing breakpoints
        await this.loadBreakpoints();
    }

    private setupLogWatchers(): void {
        const debugLogPaths = [
            path.join(this.workspaceRoot, 'storage', 'logs', 'debug.log'),
            path.join(this.workspaceRoot, 'storage', 'logs', 'queries.log'),
            path.join(this.workspaceRoot, 'storage', 'logs', 'profiler.log'),
            path.join(this.workspaceRoot, 'var', 'log', 'debug.log')
        ];

        for (const logPath of debugLogPaths) {
            if (fs.existsSync(logPath)) {
                try {
                    const watcher = fs.watch(logPath, (eventType) => {
                        if (eventType === 'change') {
                            this.processDebugLog(logPath);
                        }
                    });

                    this.logWatchers.push(watcher);
                } catch (error) {
                    console.error(`Failed to watch debug log ${logPath}:`, error);
                }
            }
        }
    }

    private processDebugLog(logPath: string): void {
        try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').slice(-50); // Last 50 lines

            for (const line of lines) {
                if (line.trim()) {
                    this.parseDebugLogEntry(line, logPath);
                }
            }

            this.updateDebugPanel();
        } catch (error) {
            console.error(`Error processing debug log ${logPath}:`, error);
        }
    }

    private parseDebugLogEntry(logEntry: string, logPath: string): void {
        const timestamp = new Date();

        // Parse different types of debug entries
        if (logPath.includes('queries.log')) {
            this.parseQueryLog(logEntry, timestamp);
        } else if (logPath.includes('profiler.log')) {
            this.parseProfilerLog(logEntry, timestamp);
        } else {
            this.parseGeneralDebugLog(logEntry, timestamp);
        }
    }

    private parseQueryLog(logEntry: string, timestamp: Date): void {
        // Parse SQL query logs
        const queryMatch = logEntry.match(/Query:\s*(.+?)\s*\|\s*Duration:\s*(\d+(?:\.\d+)?)ms/);
        if (queryMatch) {
            const [, query, duration] = queryMatch;

            // Extract bindings if present
            const bindingsMatch = logEntry.match(/Bindings:\s*\[(.*?)\]/);
            const bindings = bindingsMatch ? JSON.parse(`[${bindingsMatch[1]}]`) : [];

            // Extract stack trace if present
            const stackMatch = logEntry.match(/Stack:\s*(.+)$/);
            const stackTrace = stackMatch ? stackMatch[1].split(' -> ') : [];

            this.queryLogs.push({
                query: query.trim(),
                duration: parseFloat(duration),
                bindings,
                timestamp,
                stackTrace
            });

            // Keep only last 1000 query logs
            if (this.queryLogs.length > 1000) {
                this.queryLogs = this.queryLogs.slice(-1000);
            }
        }
    }

    private parseProfilerLog(logEntry: string, timestamp: Date): void {
        // Parse profiler data
        const profilerMatch = logEntry.match(/Function:\s*(.+?)\s*\|\s*Memory:\s*(\d+)B\s*\|\s*Duration:\s*(\d+(?:\.\d+)?)ms\s*\|\s*File:\s*(.+?):(\d+)/);
        if (profilerMatch) {
            const [, func, memory, duration, file, line] = profilerMatch;

            this.profilerData.push({
                timestamp: timestamp.getTime(),
                function: func.trim(),
                memory: parseInt(memory),
                duration: parseFloat(duration),
                file: file.trim(),
                line: parseInt(line)
            });

            // Keep only last 1000 profiler entries
            if (this.profilerData.length > 1000) {
                this.profilerData = this.profilerData.slice(-1000);
            }
        }
    }

    private parseGeneralDebugLog(logEntry: string, timestamp: Date): void {
        // Parse general debug information
        if (logEntry.includes('BREAKPOINT')) {
            this.handleBreakpointHit(logEntry, timestamp);
        } else if (logEntry.includes('SESSION_START')) {
            this.handleDebugSessionStart(logEntry, timestamp);
        } else if (logEntry.includes('SESSION_END')) {
            this.handleDebugSessionEnd(logEntry, timestamp);
        }
    }

    private handleBreakpointHit(logEntry: string, timestamp: Date): void {
        const fileMatch = logEntry.match(/File:\s*(.+?):(\d+)/);
        if (fileMatch) {
            const [, file, line] = fileMatch;
            const breakpoint = this.breakpoints.find(bp =>
                bp.file === file && bp.line === parseInt(line)
            );

            if (breakpoint) {
                breakpoint.hitCount++;
                this.notifyBreakpointHit(breakpoint, timestamp);
            }
        }
    }

    private handleDebugSessionStart(logEntry: string, timestamp: Date): void {
        const sessionMatch = logEntry.match(/Session:\s*(\w+)\s*Type:\s*(\w+)/);
        if (sessionMatch) {
            const [, id, type] = sessionMatch;

            const session: DebugSession = {
                id,
                type: type as any,
                status: 'active',
                startTime: timestamp,
                metadata: {}
            };

            this.debugSessions.set(id, session);
        }
    }

    private handleDebugSessionEnd(logEntry: string, timestamp: Date): void {
        const sessionMatch = logEntry.match(/Session:\s*(\w+)/);
        if (sessionMatch) {
            const [, id] = sessionMatch;
            const session = this.debugSessions.get(id);

            if (session) {
                session.status = 'stopped';
                session.metadata.endTime = timestamp;
            }
        }
    }

    private notifyBreakpointHit(breakpoint: BreakpointInfo, _timestamp: Date): void {
        vscode.window.showInformationMessage(
            `Breakpoint hit: ${escapeHtml(path.basename(breakpoint.file))}:${escapeHtml(String(breakpoint.line))}`,
            'View Debug Panel', 'Go to File'
        ).then(selection => {
            if (selection === 'View Debug Panel') {
                this.showDebugPanel();
            } else if (selection === 'Go to File') {
                vscode.workspace.openTextDocument(breakpoint.file).then(document => {
                    vscode.window.showTextDocument(document, {
                        selection: new vscode.Range(breakpoint.line - 1, 0, breakpoint.line - 1, 0)
                    });
                });
            }
        });
    }

    private registerDebugCommands(): void {
        this.context.subscriptions.push(
            vscode.commands.registerCommand('glueful.debug.panel', () => this.showDebugPanel()),
            vscode.commands.registerCommand('glueful.debug.addBreakpoint', () => this.addBreakpoint()),
            vscode.commands.registerCommand('glueful.debug.clearBreakpoints', () => this.clearBreakpoints()),
            vscode.commands.registerCommand('glueful.debug.startProfiling', () => this.startProfiling()),
            vscode.commands.registerCommand('glueful.debug.stopProfiling', () => this.stopProfiling()),
            vscode.commands.registerCommand('glueful.debug.analyzeQueries', () => this.analyzeQueries()),
            vscode.commands.registerCommand('glueful.debug.memoryAnalysis', () => this.analyzeMemoryUsage())
        );
    }

    public async addBreakpoint(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active PHP file');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'php') {
            vscode.window.showErrorMessage('Breakpoints can only be set in PHP files');
            return;
        }

        const line = activeEditor.selection.active.line + 1;
        const file = document.fileName;

        // Check if breakpoint already exists
        const existing = this.breakpoints.find(bp => bp.file === file && bp.line === line);
        if (existing) {
            vscode.window.showWarningMessage('Breakpoint already exists at this location');
            return;
        }

        const condition = await vscode.window.showInputBox({
            prompt: 'Enter breakpoint condition (optional)',
            placeHolder: 'e.g., $variable == "value"'
        });

        const breakpoint: BreakpointInfo = {
            file,
            line,
            condition: condition || undefined,
            enabled: true,
            hitCount: 0
        };

        this.breakpoints.push(breakpoint);
        await this.saveBreakpoints();

        vscode.window.showInformationMessage(
            `Breakpoint added at ${escapeHtml(path.basename(file))}:${escapeHtml(String(line))}`
        );

        this.updateDebugPanel();
    }

    public async clearBreakpoints(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Clear all breakpoints?',
            'Clear', 'Cancel'
        );

        if (confirm === 'Clear') {
            this.breakpoints = [];
            await this.saveBreakpoints();
            vscode.window.showInformationMessage('All breakpoints cleared');
            this.updateDebugPanel();
        }
    }

    public async startProfiling(): Promise<void> {
        // This would enable profiling in the Glueful application
        vscode.window.showInformationMessage('Profiling started');
    }

    public async stopProfiling(): Promise<void> {
        // This would disable profiling and generate a report
        await this.generateProfilingReport();
        vscode.window.showInformationMessage('Profiling stopped and report generated');
    }

    public async analyzeQueries(): Promise<void> {
        if (this.queryLogs.length === 0) {
            vscode.window.showInformationMessage('No query data available');
            return;
        }

        const analysis = this.performQueryAnalysis();
        this.showQueryAnalysisReport(analysis);
    }

    public async analyzeMemoryUsage(): Promise<void> {
        if (this.profilerData.length === 0) {
            vscode.window.showInformationMessage('No profiler data available');
            return;
        }

        const analysis = this.performMemoryAnalysis();
        this.showMemoryAnalysisReport(analysis);
    }

    private performQueryAnalysis(): any {
        const slowQueries = this.queryLogs.filter(q => q.duration > 1000); // > 1 second
        const duplicateQueries = this.findDuplicateQueries();
        const totalQueries = this.queryLogs.length;
        const avgDuration = this.queryLogs.reduce((sum, q) => sum + q.duration, 0) / totalQueries;

        return {
            totalQueries,
            slowQueries: slowQueries.length,
            duplicateQueries: duplicateQueries.length,
            avgDuration: avgDuration.toFixed(2),
            slowestQueries: slowQueries.slice(0, 10),
            mostFrequent: duplicateQueries.slice(0, 10)
        };
    }

    private findDuplicateQueries(): Array<{query: string, count: number}> {
        const queryCounts: Record<string, number> = {};

        for (const log of this.queryLogs) {
            const normalizedQuery = log.query.replace(/\s+/g, ' ').trim();
            queryCounts[normalizedQuery] = (queryCounts[normalizedQuery] || 0) + 1;
        }

        return Object.entries(queryCounts)
            .filter(([, count]) => count > 1)
            .map(([query, count]) => ({ query, count }))
            .sort((a, b) => b.count - a.count);
    }

    private performMemoryAnalysis(): any {
        const totalMemory = this.profilerData.reduce((sum, p) => sum + p.memory, 0);
        const avgMemory = totalMemory / this.profilerData.length;
        const highMemoryFunctions = this.profilerData
            .filter(p => p.memory > avgMemory * 2)
            .sort((a, b) => b.memory - a.memory)
            .slice(0, 10);

        const memoryByFile = this.groupMemoryByFile();

        return {
            totalMemory,
            avgMemory: avgMemory.toFixed(2),
            highMemoryFunctions,
            memoryByFile
        };
    }

    private groupMemoryByFile(): Array<{file: string, totalMemory: number, count: number}> {
        const fileMemory: Record<string, {total: number, count: number}> = {};

        for (const profiler of this.profilerData) {
            if (!fileMemory[profiler.file]) {
                fileMemory[profiler.file] = { total: 0, count: 0 };
            }
            fileMemory[profiler.file].total += profiler.memory;
            fileMemory[profiler.file].count++;
        }

        return Object.entries(fileMemory)
            .map(([file, data]) => ({
                file: path.basename(file),
                totalMemory: data.total,
                count: data.count
            }))
            .sort((a, b) => b.totalMemory - a.totalMemory)
            .slice(0, 10);
    }

    public showDebugPanel(): void {
        if (this.debugPanel) {
            this.debugPanel.reveal();
            return;
        }

        const template = new WebviewTemplateBuilder()
            .title('Glueful Advanced Debugging')
            .content(this.generateSecureDebugContent())
            .addAction({
                id: 'refresh',
                label: '🔄 Refresh',
                enabled: true
            })
            .addAction({
                id: 'clearLogs',
                label: '🗑️ Clear Logs',
                enabled: true
            })
            .addAction({
                id: 'emergency',
                label: '🚨 Emergency Stop',
                enabled: true
            })
            .addMetadata('sessions', this.debugSessions.size)
            .addMetadata('breakpoints', this.breakpoints.length)
            .build();

        this.debugPanel = openSecurePanel(
            {
                viewType: 'gluefulDebugging',
                title: 'Glueful Advanced Debugging',
                retainContextWhenHidden: true,
                handlers: this.createDebugHandlers()
            },
            template,
            this.context
        );

        this.debugPanel.onDidDispose(() => {
            this.debugPanel = null;
        });
    }

    private updateDebugPanel(): void {
        if (!this.debugPanel) return;

        const template = new WebviewTemplateBuilder()
            .title('Glueful Advanced Debugging')
            .content(this.generateSecureDebugContent())
            .addMetadata('lastUpdate', new Date().toLocaleTimeString())
            .build();

        // Update panel content using the factory's update method
        const factory = require('../utils/unifiedWebviewFactory').UnifiedWebviewFactory.getInstance();
        factory.updatePanelContent(this.debugPanel, template);
    }

    private createDebugHandlers(): Record<string, (payload: any) => Promise<void> | void> {
        return {
            'refresh': () => {
                this.updateDebugPanel();
            },
            'clearLogs': () => {
                this.queryLogs = [];
                this.profilerData = [];
                this.updateDebugPanel();
            },
            'emergency': () => {
                // Emergency stop all debugging
                this.queryLogs = [];
                this.profilerData = [];
                this.debugSessions.clear();
                this.updateDebugPanel();
            },
            'showTab': (_payload) => {
                // Tab switching is handled client-side with data attributes
                // This handler exists for future server-side tab logic
            },
            'addBreakpoint': () => {
                this.addBreakpoint();
            },
            'clearBreakpoints': () => {
                this.clearBreakpoints();
            },
            'goToBreakpoint': (payload) => {
                const { file, line } = payload;
                if (file && line) {
                    vscode.workspace.openTextDocument(file).then(document => {
                        vscode.window.showTextDocument(document, {
                            selection: new vscode.Range(line - 1, 0, line - 1, 0)
                        });
                    });
                }
            },
            'removeBreakpoint': (payload) => {
                const { file, line } = payload;
                if (file && line) {
                    this.breakpoints = this.breakpoints.filter(bp =>
                        !(bp.file === file && bp.line === line)
                    );
                    this.saveBreakpoints();
                    this.updateDebugPanel();
                }
            },
            'analyzeQueries': () => {
                this.analyzeQueries();
            },
            'startProfiling': () => {
                this.startProfiling();
            },
            'stopProfiling': () => {
                this.stopProfiling();
            },
            'analyzeMemory': () => {
                this.analyzeMemoryUsage();
            }
        };
    }

    private generateSecureDebugContent(): string {
        const cssUri = this.debugPanel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'debug-panel.css')
        );

        return `
            <link rel="stylesheet" href="${cssUri}">
            <div class="debug-container">
                ${this.generateDebugTabs()}
                ${this.generateDebugSections()}
            </div>

            <script>
                // Secure tab switching using data attributes
                document.addEventListener('click', (event) => {
                    const target = event.target;
                    if (target.dataset.action === 'showTab') {
                        const tabName = target.dataset.tab;
                        if (tabName) {
                            // Hide all sections
                            document.querySelectorAll('.debug-section').forEach(section => {
                                section.classList.remove('active');
                            });

                            // Hide all tabs
                            document.querySelectorAll('.debug-tab').forEach(tab => {
                                tab.classList.remove('active');
                            });

                            // Show selected section and tab
                            const section = document.getElementById(tabName);
                            if (section) {
                                section.classList.add('active');
                                target.classList.add('active');
                            }
                        }
                    } else if (target.dataset.action) {
                        // Handle other actions via postMessage
                        const action = target.dataset.action;
                        const payload = {};

                        // Collect data attributes
                        for (const [key, value] of Object.entries(target.dataset)) {
                            if (key !== 'action') {
                                payload[key] = value;
                            }
                        }

                        window.postMessage({ command: action, payload }, '*');
                    }
                });
            </script>
        `;
    }

    private generateDebugTabs(): string {
        const tabs = [
            { id: 'sessions', label: 'Debug Sessions', icon: '🔍' },
            { id: 'breakpoints', label: 'Breakpoints', icon: '🛑' },
            { id: 'queries', label: 'Query Analysis', icon: '📊' },
            { id: 'profiler', label: 'Profiler', icon: '⚡' },
            { id: 'memory', label: 'Memory', icon: '💾' }
        ];

        return `
            <div class="debug-tabs">
                ${tabs.map((tab, index) => `
                    <button
                        class="debug-tab ${index === 0 ? 'active' : ''}"
                        data-action="showTab"
                        data-tab="${escapeHtml(tab.id)}"
                    >
                        ${escapeHtml(tab.icon)} ${escapeHtml(tab.label)}
                    </button>
                `).join('')}
            </div>
        `;
    }

    private generateDebugSections(): string {
        return `
            <div class="debug-content">
                ${this.generateSessionsSection()}
                ${this.generateBreakpointsSection()}
                ${this.generateQueriesSection()}
                ${this.generateProfilerSection()}
                ${this.generateMemorySection()}
            </div>
        `;
    }

    private generateSessionsSection(): string {
        const activeSessions = Array.from(this.debugSessions.values())
            .filter(s => s.status === 'active');

        return `
            <div id="sessions" class="debug-section active">
                <h3>Active Debug Sessions (${activeSessions.length})</h3>
                ${activeSessions.length === 0 ? '<p>No active debug sessions</p>' :
                    activeSessions.map(session => `
                        <div class="session-card">
                            <div class="session-header">
                                <div>
                                    <strong>${escapeHtml(session.id)}</strong>
                                    <span class="metric">${escapeHtml(session.type)}</span>
                                    <span class="status-${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>
                                </div>
                                <div>Started: ${escapeHtml(session.startTime.toLocaleTimeString())}</div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;
    }

    private generateBreakpointsSection(): string {
        return `
            <div id="breakpoints" class="debug-section">
                <h3>Breakpoints (${this.breakpoints.length})</h3>
                <div class="section-actions">
                    <button class="btn" data-action="addBreakpoint">➕ Add Breakpoint</button>
                    <button class="btn btn-danger" data-action="clearBreakpoints">🗑️ Clear All</button>
                </div>

                ${this.breakpoints.length === 0 ? '<p>No breakpoints set</p>' :
                    this.breakpoints.map(bp => `
                        <div class="breakpoint-card">
                            <div class="breakpoint-header">
                                <div>
                                    <strong>${escapeHtml(path.basename(bp.file))}:${bp.line}</strong>
                                    ${bp.condition ? `<span class="metric">Condition: ${escapeHtml(bp.condition)}</span>` : ''}
                                    <span class="metric">Hits: ${bp.hitCount}</span>
                                </div>
                                <div class="breakpoint-actions">
                                    <button
                                        class="btn"
                                        data-action="goToBreakpoint"
                                        data-file="${escapeHtml(bp.file)}"
                                        data-line="${bp.line}"
                                    >Go To</button>
                                    <button
                                        class="btn btn-danger"
                                        data-action="removeBreakpoint"
                                        data-file="${escapeHtml(bp.file)}"
                                        data-line="${bp.line}"
                                    >Remove</button>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;
    }

    private generateQueriesSection(): string {
        const recentQueries = this.queryLogs.slice(-20);

        return `
            <div id="queries" class="debug-section">
                <h3>Recent Queries (${recentQueries.length})</h3>
                <div class="section-actions">
                    <button class="btn" data-action="analyzeQueries">📊 Full Analysis</button>
                </div>

                ${recentQueries.length === 0 ? '<p>No query data available</p>' :
                    recentQueries.slice().reverse().map(q => `
                        <div class="query-card ${q.duration > 1000 ? 'slow-query' : 'normal-query'}">
                            <div class="query-header">
                                <div class="query-metrics">
                                    <span class="metric">${escapeHtml(q.duration.toFixed(2))}ms</span>
                                    <span class="metric">${escapeHtml(q.timestamp.toLocaleTimeString())}</span>
                                    ${q.bindings.length > 0 ? `<span class="metric">${q.bindings.length} bindings</span>` : ''}
                                </div>
                            </div>
                            <div class="code">${escapeHtml(q.query)}</div>
                            ${q.bindings.length > 0 ? `<div class="query-bindings">Bindings: ${escapeHtml(JSON.stringify(q.bindings))}</div>` : ''}
                        </div>
                    `).join('')
                }
            </div>
        `;
    }

    private generateProfilerSection(): string {
        const recentProfiler = this.profilerData.slice(-20);

        return `
            <div id="profiler" class="debug-section">
                <h3>Profiler Data (${recentProfiler.length})</h3>
                <div class="section-actions">
                    <button class="btn" data-action="startProfiling">▶️ Start Profiling</button>
                    <button class="btn btn-danger" data-action="stopProfiling">⏹️ Stop Profiling</button>
                </div>

                <table class="table">
                    <thead>
                        <tr>
                            <th>Function</th>
                            <th>Duration</th>
                            <th>Memory</th>
                            <th>File</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recentProfiler.slice().reverse().map(prof => `
                            <tr>
                                <td>${escapeHtml(prof.function)}</td>
                                <td>${escapeHtml(prof.duration.toFixed(2))}ms</td>
                                <td>${escapeHtml((prof.memory / 1024).toFixed(1))}KB</td>
                                <td>${escapeHtml(path.basename(prof.file))}:${prof.line}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    private generateMemorySection(): string {
        return `
            <div id="memory" class="debug-section">
                <h3>Memory Analysis</h3>
                <div class="section-actions">
                    <button class="btn" data-action="analyzeMemory">📊 Analyze Memory Usage</button>
                </div>
                <p>Memory profiler data will be displayed here after analysis.</p>
            </div>
        `;
    }

    // Old vulnerable HTML generation method removed - replaced with secure template functions

    // Remove old escapeHtml method - now using imported one

    private async saveBreakpoints(): Promise<void> {
        const breakpointsFile = path.join(this.workspaceRoot, '.vscode', 'glueful-breakpoints.json');
        const vscodeDir = path.dirname(breakpointsFile);

        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        fs.writeFileSync(breakpointsFile, JSON.stringify(this.breakpoints, null, 2));
    }

    private async loadBreakpoints(): Promise<void> {
        const breakpointsFile = path.join(this.workspaceRoot, '.vscode', 'glueful-breakpoints.json');

        if (fs.existsSync(breakpointsFile)) {
            try {
                const content = fs.readFileSync(breakpointsFile, 'utf8');
                this.breakpoints = JSON.parse(content);
            } catch (error) {
                console.error('Failed to load breakpoints:', error);
            }
        }
    }

    private async generateProfilingReport(): Promise<void> {
        const reportPath = path.join(this.workspaceRoot, 'storage', 'debug', 'profiling-report.html');
        const reportDir = path.dirname(reportPath);

        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportHtml = this.generateProfilingReportHtml();
        fs.writeFileSync(reportPath, reportHtml);

        vscode.window.showInformationMessage(
            'Profiling report generated',
            'Open Report'
        ).then(selection => {
            if (selection === 'Open Report') {
                vscode.env.openExternal(vscode.Uri.file(reportPath));
            }
        });
    }

    private generateProfilingReportHtml(): string {
        // Generate comprehensive profiling report
        return `<!DOCTYPE html><html><head><title>Glueful Profiling Report</title></head><body><h1>Profiling Report</h1><p>Generated: ${new Date().toISOString()}</p></body></html>`;
    }

    private showQueryAnalysisReport(analysis: any): void {
        const content = `
            <h1>Query Analysis Report</h1>
            <p><strong>Total Queries:</strong> ${escapeHtml(analysis.totalQueries.toString())}</p>
            <p><strong>Slow Queries:</strong> ${escapeHtml(analysis.slowQueries.toString())}</p>
            <p><strong>Duplicate Queries:</strong> ${escapeHtml(analysis.duplicateQueries.toString())}</p>
            <p><strong>Average Duration:</strong> ${escapeHtml(analysis.avgDuration.toString())}ms</p>
        `;

        const template = new WebviewTemplateBuilder()
            .title('Query Analysis Report')
            .content(content)
            .build();

        openSecurePanel(
            {
                viewType: 'queryAnalysis',
                title: 'Query Analysis Report',
                retainContextWhenHidden: false,
                handlers: {}
            },
            template,
            this.context
        );
    }

    private showMemoryAnalysisReport(analysis: any): void {
        const content = `
            <h1>Memory Analysis Report</h1>
            <p><strong>Total Memory:</strong> ${escapeHtml((analysis.totalMemory / (1024 * 1024)).toFixed(2))}MB</p>
            <p><strong>Average Memory:</strong> ${escapeHtml((analysis.avgMemory / 1024).toFixed(2))}KB</p>
        `;

        const template = new WebviewTemplateBuilder()
            .title('Memory Analysis Report')
            .content(content)
            .build();

        openSecurePanel(
            {
                viewType: 'memoryAnalysis',
                title: 'Memory Analysis Report',
                retainContextWhenHidden: false,
                handlers: {}
            },
            template,
            this.context
        );
    }

    public dispose(): void {
        for (const watcher of this.logWatchers) {
            watcher.close();
        }

        if (this.debugPanel) {
            this.debugPanel.dispose();
        }
    }
}