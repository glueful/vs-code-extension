import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsp } from 'fs';
import { runCliWithErrorHandling } from '../utils/cli';
import { debounce } from '../utils/debounce';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';
import { escapeHtml } from '../utils/webviewSecurity';

interface SecurityScanResult {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    type: string;
    message: string;
    rule: string;
    fix?: string;
}

interface VulnerabilityReport {
    package: string;
    version: string;
    vulnerability: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    fixVersion?: string;
}

interface SecurityMetrics {
    lastScan: Date | null;
    totalIssues: number;
    criticalIssues: number;
    vulnerabilities: number;
    securityScore: number;
}

/**
 * Security Integration Feature
 *
 * Integrates with Glueful framework security tools:
 * - Code security scanning and vulnerability detection
 * - Dependency vulnerability checking
 * - Security policy validation
 * - Real-time security alerts
 * - Security best practices enforcement
 * - Automated security fixes
 */
export class SecurityIntegrationProvider {
    private diagnostics: vscode.DiagnosticCollection;
    private scanResults: SecurityScanResult[] = [];
    private vulnerabilities: VulnerabilityReport[] = [];
    private metrics: SecurityMetrics = {
        lastScan: null,
        totalIssues: 0,
        criticalIssues: 0,
        vulnerabilities: 0,
        securityScore: 100
    };

    private workspaceRoot: string;
    private statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.diagnostics = vscode.languages.createDiagnosticCollection('glueful-security');

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            80
        );

        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Watch for security report files
        const reportWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/storage/security/**/*.json')
        );

        const loadReportsDebounced = debounce(() => this.loadSecurityReports(), 300);
        reportWatcher.onDidChange(loadReportsDebounced);
        reportWatcher.onDidCreate(loadReportsDebounced);

        // Watch for composer.json changes (dependency updates)
        const composerWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/composer.json')
        );

        composerWatcher.onDidChange(() => this.scheduleVulnerabilityCheck());

        this.context.subscriptions.push(reportWatcher, composerWatcher, this.diagnostics);

        // Register commands
        this.registerCommands();

        // Initial setup
        await this.loadSecurityReports();
        this.updateStatusBar();
    }

    private registerCommands(): void {
        const commands = [
            vscode.commands.registerCommand('glueful.security.scan', () => this.runSecurityScan()),
            vscode.commands.registerCommand('glueful.security.vulnerabilityCheck', () => this.runVulnerabilityCheck()),
            vscode.commands.registerCommand('glueful.security.showReport', () => this.showSecurityReport()),
            vscode.commands.registerCommand('glueful.security.fixIssue', (uri, range, fix) => this.fixSecurityIssue(uri, range, fix)),
            vscode.commands.registerCommand('glueful.security.showPolicies', () => this.showSecurityPolicies()),
            vscode.commands.registerCommand('glueful.security.lockdown', () => this.runSecurityLockdown()),
            vscode.commands.registerCommand('glueful.security.auditLogs', () => this.showAuditLogs())
        ];

        this.context.subscriptions.push(...commands);
    }

    private async loadSecurityReports(): Promise<void> {
        const reportFiles = [
            path.join(this.workspaceRoot, 'storage', 'security', 'scan-results.json'),
            path.join(this.workspaceRoot, 'storage', 'security', 'vulnerability-report.json')
        ];

        this.scanResults = [];
        this.vulnerabilities = [];

        for (const reportFile of reportFiles) {
            try {
                await fsp.access(reportFile);
                const content = await fsp.readFile(reportFile, 'utf8');
                const report = JSON.parse(content);

                if (reportFile.includes('scan-results')) {
                    this.processScanResults(report);
                } else if (reportFile.includes('vulnerability-report')) {
                    this.processVulnerabilityReport(report);
                }
            } catch (error) {
                // File doesn't exist or couldn't be read - this is normal
                console.debug(`Security report file not found: ${reportFile}`);
            }
        }

        this.updateDiagnostics();
        this.updateMetrics();
        this.updateStatusBar();
    }

    private processScanResults(report: any): void {
        if (!report.results || !Array.isArray(report.results)) return;

        for (const result of report.results) {
            this.scanResults.push({
                file: result.file,
                line: result.line || 1,
                column: result.column || 1,
                severity: this.mapSeverity(result.severity),
                type: result.type || 'security',
                message: result.message,
                rule: result.rule,
                fix: result.fix
            });
        }
    }

    private processVulnerabilityReport(report: any): void {
        if (!report.vulnerabilities || !Array.isArray(report.vulnerabilities)) return;

        for (const vuln of report.vulnerabilities) {
            this.vulnerabilities.push({
                package: vuln.package,
                version: vuln.version,
                vulnerability: vuln.vulnerability,
                severity: vuln.severity,
                description: vuln.description,
                fixVersion: vuln.fixVersion
            });
        }
    }

    private mapSeverity(severity: string): 'error' | 'warning' | 'info' {
        switch (severity?.toLowerCase()) {
            case 'critical':
            case 'high':
            case 'error':
                return 'error';
            case 'medium':
            case 'warning':
                return 'warning';
            default:
                return 'info';
        }
    }

    private updateDiagnostics(): void {
        this.diagnostics.clear();

        const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

        for (const result of this.scanResults) {
            const uri = vscode.Uri.file(path.join(this.workspaceRoot, result.file));

            if (!diagnosticMap.has(uri.toString())) {
                diagnosticMap.set(uri.toString(), []);
            }

            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(
                    result.line - 1,
                    result.column - 1,
                    result.line - 1,
                    result.column + 10
                ),
                `[${result.rule}] ${result.message}`,
                result.severity === 'error'
                    ? vscode.DiagnosticSeverity.Error
                    : result.severity === 'warning'
                        ? vscode.DiagnosticSeverity.Warning
                        : vscode.DiagnosticSeverity.Information
            );

            diagnostic.source = 'Glueful Security';
            diagnostic.code = result.rule;

            diagnosticMap.get(uri.toString())!.push(diagnostic);
        }

        for (const [uriString, diagnostics] of diagnosticMap) {
            this.diagnostics.set(vscode.Uri.parse(uriString), diagnostics);
        }
    }

    private updateMetrics(): void {
        this.metrics.lastScan = new Date();
        this.metrics.totalIssues = this.scanResults.length;
        this.metrics.criticalIssues = this.scanResults.filter(r => r.severity === 'error').length;
        this.metrics.vulnerabilities = this.vulnerabilities.length;

        // Calculate security score (100 - weighted issues)
        const score = Math.max(0, 100 - (
            this.metrics.criticalIssues * 10 +
            this.scanResults.filter(r => r.severity === 'warning').length * 3 +
            this.metrics.vulnerabilities * 5
        ));

        this.metrics.securityScore = Math.min(100, score);
    }

    private updateStatusBar(): void {
        const score = this.metrics.securityScore;
        let icon = '$(shield)';
        let color: vscode.ThemeColor | undefined;

        if (score < 70) {
            icon = '$(error)';
            color = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (score < 85) {
            icon = '$(warning)';
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        this.statusBarItem.text = `${icon} Security ${score}`;
        this.statusBarItem.backgroundColor = color;
        this.statusBarItem.tooltip = `Security Score: ${score}/100\n` +
                                   `Issues: ${this.metrics.totalIssues}\n` +
                                   `Critical: ${this.metrics.criticalIssues}\n` +
                                   `Vulnerabilities: ${this.metrics.vulnerabilities}`;

        this.statusBarItem.command = 'glueful.security.showReport';
        this.statusBarItem.show();
    }

    private async runSecurityScan(): Promise<void> {
        vscode.window.showInformationMessage('Running security scan...');

        try {
            const result = await runCliWithErrorHandling([
                'security:scan',
                '--format=json',
                '--output=storage/security/scan-results.json'
            ], { showErrors: true });

            if (result.success) {
                await this.loadSecurityReports();
                vscode.window.showInformationMessage('Security scan completed');
            } else {
                vscode.window.showErrorMessage(`Security scan failed: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Security scan failed: ${error}`);
        }
    }

    private async runVulnerabilityCheck(): Promise<void> {
        vscode.window.showInformationMessage('Checking for vulnerabilities...');

        try {
            const result = await runCliWithErrorHandling([
                'security:vulnerability-check',
                '--format=json',
                '--output=storage/security/vulnerability-report.json'
            ], { showErrors: true });

            if (result.success) {
                await this.loadSecurityReports();
                vscode.window.showInformationMessage('Vulnerability check completed');
            } else {
                vscode.window.showErrorMessage(`Vulnerability check failed: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Vulnerability check failed: ${error}`);
        }
    }

    private async scheduleVulnerabilityCheck(): Promise<void> {
        // Auto-run vulnerability check when composer.json changes
        setTimeout(() => this.runVulnerabilityCheck(), 1000);
    }

    private async showSecurityReport(): Promise<void> {
        const template = new WebviewTemplateBuilder()
            .title('Security Report')
            .content(this.generateSecurityReportContent())
            .addMetadata('Total Issues', this.metrics.totalIssues)
            .addMetadata('Critical Issues', this.metrics.criticalIssues)
            .addMetadata('Security Score', `${this.metrics.securityScore}/100`)
            .build();

        const panel = openSecurePanel(
            {
                viewType: 'securityReport',
                title: 'Security Report',
                handlers: {
                    'fixIssue': async (payload) => {
                        const { file, line, fix } = payload;
                        const uri = vscode.Uri.file(path.join(this.workspaceRoot, file));
                        const range = new vscode.Range(line - 1, 0, line - 1, 100);
                        await this.fixSecurityIssue(uri, range, fix);
                    }
                }
            },
            template,
            this.context
        );

        this.context.subscriptions.push(panel);
    }

    private generateSecurityReportContent(): string {
        const criticalIssues = this.scanResults.filter(r => r.severity === 'error');
        const warnings = this.scanResults.filter(r => r.severity === 'warning');
        const criticalVulns = this.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high');

        return `
            <div class="container">
                <h1>Security Report</h1>

                <div class="score ${this.metrics.securityScore >= 85 ? 'good' : this.metrics.securityScore >= 70 ? 'warning' : 'danger'}">
                    Security Score: ${this.metrics.securityScore}/100
                </div>

                <div class="metric-summary">
                    <p><strong>Total Issues:</strong> ${this.metrics.totalIssues}</p>
                    <p><strong>Critical Issues:</strong> ${this.metrics.criticalIssues}</p>
                    <p><strong>Vulnerabilities:</strong> ${this.metrics.vulnerabilities}</p>
                    <p><strong>Last Scan:</strong> ${this.metrics.lastScan?.toLocaleString() || 'Never'}</p>
                </div>

                <h2>Critical Security Issues</h2>
                ${criticalIssues.length === 0 ? '<p>No critical issues found.</p>' : criticalIssues.map(issue => `
                    <div class="card critical">
                        <h4>[${escapeHtml(issue.rule)}] ${escapeHtml(issue.message)}</h4>
                        <p><strong>File:</strong> ${escapeHtml(issue.file)}:${issue.line}</p>
                        <p><strong>Type:</strong> ${escapeHtml(issue.type)}</p>
                        ${issue.fix ? `<button class="btn" data-action="fixIssue" data-file="${escapeHtml(issue.file)}" data-line="${issue.line}" data-fix="${escapeHtml(issue.fix)}">Auto Fix</button>` : ''}
                    </div>
                `).join('')}

                <h2>Vulnerabilities</h2>
                ${this.vulnerabilities.length === 0 ? '<p>No vulnerabilities found.</p>' : `
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Package</th>
                                <th>Version</th>
                                <th>Vulnerability</th>
                                <th>Severity</th>
                                <th>Fix Version</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.vulnerabilities.map(vuln => `
                                <tr class="severity-${vuln.severity}">
                                    <td>${escapeHtml(vuln.package)}</td>
                                    <td>${escapeHtml(vuln.version)}</td>
                                    <td>${escapeHtml(vuln.vulnerability)}</td>
                                    <td>${escapeHtml(vuln.severity.toUpperCase())}</td>
                                    <td>${escapeHtml(vuln.fixVersion || 'N/A')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}

                <h2>Warnings</h2>
                ${warnings.map(warning => `
                    <div class="card warning">
                        <h4>[${escapeHtml(warning.rule)}] ${escapeHtml(warning.message)}</h4>
                        <p><strong>File:</strong> ${escapeHtml(warning.file)}:${warning.line}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private async fixSecurityIssue(uri: vscode.Uri, range: vscode.Range, fix: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            await editor.edit(editBuilder => {
                editBuilder.replace(range, fix);
            });

            vscode.window.showInformationMessage('Security issue fixed');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply fix: ${error}`);
        }
    }

    private async showSecurityPolicies(): Promise<void> {
        const content = `
            <div class="container">
                <h1>Security Policies</h1>

                <div class="card enabled">
                    <h3>Input Validation <span class="toggle status-good">✅ Enabled</span></h3>
                    <p>Automatically validate and sanitize user inputs</p>
                </div>

                <div class="card enabled">
                    <h3>HTTPS Enforcement <span class="toggle status-good">✅ Enabled</span></h3>
                    <p>Force HTTPS in production environments</p>
                </div>

                <div class="card enabled">
                    <h3>Rate Limiting <span class="toggle status-good">✅ Enabled</span></h3>
                    <p>Prevent brute force attacks and API abuse</p>
                </div>

                <div class="card disabled">
                    <h3>Content Security Policy <span class="toggle status-error">❌ Disabled</span></h3>
                    <p>Control resource loading to prevent XSS attacks</p>
                </div>

                <div class="card enabled">
                    <h3>SQL Injection Protection <span class="toggle status-good">✅ Enabled</span></h3>
                    <p>Use prepared statements and input validation</p>
                </div>

                <div class="card enabled">
                    <h3>Authentication Token Security <span class="toggle status-good">✅ Enabled</span></h3>
                    <p>Secure JWT tokens with proper expiration</p>
                </div>
            </div>
        `;

        const template = new WebviewTemplateBuilder()
            .title('Security Policies')
            .content(content)
            .build();

        const panel = openSecurePanel(
            {
                viewType: 'securityPolicies',
                title: 'Security Policies',
                handlers: {}
            },
            template,
            this.context
        );

        this.context.subscriptions.push(panel);
    }

    private async runSecurityLockdown(): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'This will apply security lockdown measures. Continue?',
            'Yes',
            'No'
        );

        if (confirmed === 'Yes') {
            try {
                const result = await runCliWithErrorHandling(['security:lockdown'], { showErrors: true });

                if (result.success) {
                    vscode.window.showInformationMessage('Security lockdown completed successfully');
                } else {
                    vscode.window.showErrorMessage(`Security lockdown failed: ${result.stderr}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Security lockdown failed: ${error}`);
            }
        }
    }

    private async showAuditLogs(): Promise<void> {
        try {
            const logPath = path.join(this.workspaceRoot, 'storage', 'logs', 'security.log');

            try {
                await fsp.access(logPath);
                const document = await vscode.workspace.openTextDocument(logPath);
                await vscode.window.showTextDocument(document);
            } catch {
                vscode.window.showInformationMessage('No security audit logs found');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open audit logs: ${error}`);
        }
    }

    // Public API
    public getSecurityMetrics(): SecurityMetrics {
        return this.metrics;
    }

    public getScanResults(): SecurityScanResult[] {
        return this.scanResults;
    }

    public getVulnerabilities(): VulnerabilityReport[] {
        return this.vulnerabilities;
    }

    public async quickSecurityCheck(): Promise<string[]> {
        const issues: string[] = [];

        if (this.metrics.criticalIssues > 0) {
            issues.push(`${this.metrics.criticalIssues} critical security issues`);
        }

        if (this.metrics.vulnerabilities > 0) {
            issues.push(`${this.metrics.vulnerabilities} known vulnerabilities`);
        }

        if (this.metrics.securityScore < 70) {
            issues.push(`Low security score: ${this.metrics.securityScore}/100`);
        }

        return issues;
    }

    public dispose() {
        // Context subscriptions are automatically disposed by VS Code
        // This method provides explicit cleanup if needed
        this.diagnostics.dispose();
    }

}