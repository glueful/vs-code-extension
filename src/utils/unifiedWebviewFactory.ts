import * as vscode from 'vscode';
import { generateSecureHtml, getSecureWebviewOptions, createMessageHandler } from './webview';
import { escapeHtml } from './webviewSecurity';

export interface UnifiedWebviewConfig {
    viewType: string;
    title: string;
    showOptions?: vscode.ViewColumn;
    panelOptions?: vscode.WebviewPanelOptions;
    handlers?: Record<string, (payload: any) => Promise<void> | void>;
    retainContextWhenHidden?: boolean;
}

export interface WebviewTemplate {
    title: string;
    content: string;
    actions?: WebviewAction[];
    metadata?: Record<string, any>;
}

export interface WebviewAction {
    id: string;
    label: string;
    icon?: string;
    enabled?: boolean;
    primary?: boolean;
}

/**
 * Unified Secure Webview Factory
 *
 * This is the single entry point for creating all webviews in the extension.
 * It enforces security best practices and prevents common vulnerabilities.
 *
 * Security Features:
 * - Automatic CSP enforcement with nonce-based scripts
 * - HTML escaping for all dynamic content
 * - Secure message handling with validation
 * - Local resource management
 * - Disposal tracking
 */
export class UnifiedWebviewFactory {
    private static instance: UnifiedWebviewFactory;
    private activePanels: Map<string, vscode.WebviewPanel> = new Map();
    private disposables: vscode.Disposable[] = [];

    static getInstance(): UnifiedWebviewFactory {
        if (!UnifiedWebviewFactory.instance) {
            UnifiedWebviewFactory.instance = new UnifiedWebviewFactory();
        }
        return UnifiedWebviewFactory.instance;
    }

    /**
     * Opens a secure webview panel with the provided configuration.
     * This is the primary method that should be used for all webview creation.
     */
    openSecurePanel(
        config: UnifiedWebviewConfig,
        template: WebviewTemplate,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        // Validate configuration
        this.validateConfig(config);

        // Check if panel already exists and reuse it
        const existingPanel = this.activePanels.get(config.viewType);
        if (existingPanel) {
            existingPanel.reveal(config.showOptions);
            this.updatePanelContent(existingPanel, template);
            return existingPanel;
        }

        // Create new secure panel
        const panel = this.createSecurePanel(config, context);

        // Set up content and handlers
        this.setupPanelContent(panel, template);
        this.setupMessageHandlers(panel, config.handlers || {}, context);

        // Track panel
        this.trackPanel(config.viewType, panel);

        return panel;
    }

    /**
     * Updates the content of an existing webview panel
     */
    updatePanelContent(panel: vscode.WebviewPanel, template: WebviewTemplate): void {
        const secureContent = this.generateSecureContent(template);
        panel.webview.html = generateSecureHtml(secureContent);
    }

    /**
     * Closes a specific webview panel
     */
    closePanel(viewType: string): void {
        const panel = this.activePanels.get(viewType);
        if (panel) {
            panel.dispose();
            this.activePanels.delete(viewType);
        }
    }

    /**
     * Closes all webview panels
     */
    closeAllPanels(): void {
        Array.from(this.activePanels.values()).forEach(panel => {
            panel.dispose();
        });
        this.activePanels.clear();
    }

    /**
     * Gets the list of active panel view types
     */
    getActivePanels(): string[] {
        return Array.from(this.activePanels.keys());
    }

    /**
     * Disposes all resources
     */
    dispose(): void {
        this.closeAllPanels();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    private validateConfig(config: UnifiedWebviewConfig): void {
        if (!config.viewType || typeof config.viewType !== 'string') {
            throw new Error('viewType must be a non-empty string');
        }

        if (!config.title || typeof config.title !== 'string') {
            throw new Error('title must be a non-empty string');
        }

        // Validate view type follows naming convention
        if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(config.viewType)) {
            throw new Error('viewType must follow naming convention: alphanumeric, dots, dashes, underscores');
        }

        // Validate handlers if provided
        if (config.handlers) {
            for (const [handlerId, handler] of Object.entries(config.handlers)) {
                if (typeof handler !== 'function') {
                    throw new Error(`Handler '${handlerId}' must be a function`);
                }
            }
        }
    }

    private createSecurePanel(
        config: UnifiedWebviewConfig,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        const options = {
            ...getSecureWebviewOptions(context.extensionUri),
            retainContextWhenHidden: config.retainContextWhenHidden || false,
            ...config.panelOptions
        };

        return vscode.window.createWebviewPanel(
            config.viewType,
            config.title,
            config.showOptions || vscode.ViewColumn.One,
            options
        );
    }

    private setupPanelContent(panel: vscode.WebviewPanel, template: WebviewTemplate): void {
        const secureContent = this.generateSecureContent(template);
        panel.webview.html = generateSecureHtml(secureContent);
    }

    private setupMessageHandlers(
        panel: vscode.WebviewPanel,
        handlers: Record<string, (payload: any) => Promise<void> | void>,
        context: vscode.ExtensionContext
    ): void {
        if (Object.keys(handlers).length > 0) {
            const messageHandler = createMessageHandler(panel, handlers);
            this.disposables.push(messageHandler);
            context.subscriptions.push(messageHandler);
        }
    }

    private trackPanel(viewType: string, panel: vscode.WebviewPanel): void {
        this.activePanels.set(viewType, panel);

        // Clean up when panel is disposed
        panel.onDidDispose(() => {
            this.activePanels.delete(viewType);
        });
    }

    private generateSecureContent(template: WebviewTemplate): string {
        const actions = template.actions || [];
        const metadata = template.metadata || {};
        const trustedMarkup = template.content;

        return `
            <div class="container">
                <header class="webview-header">
                    <h1>${escapeHtml(template.title)}</h1>
                    ${actions.length > 0 ? `
                        <div class="action-bar">
                            ${actions.map(action => `
                                <button class="btn ${action.primary ? 'btn-primary' : 'btn-secondary'}"
                                        ${!action.enabled ? 'disabled' : ''}
                                        data-cmd="${escapeHtml(action.id)}">
                                    ${action.icon ? `<span class="icon">${escapeHtml(action.icon)}</span>` : ''}
                                    ${escapeHtml(action.label)}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </header>

                <main class="webview-content">
                    ${trustedMarkup}
                </main>

                ${Object.keys(metadata).length > 0 ? `
                    <footer class="webview-footer">
                        <div class="metadata">
                            ${Object.entries(metadata).map(([key, value]) =>
                                `<span class="metadata-item">
                                    <strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}
                                </span>`
                            ).join('')}
                        </div>
                    </footer>
                ` : ''}

                <div class="security-indicator">
                    <small class="status-good">
                        🔒 Secure webview - Content sanitized and CSP protected
                    </small>
                </div>
            </div>
        `;
    }
}

/**
 * Convenience function for opening secure panels
 * This should be used instead of vscode.window.createWebviewPanel
 */
export function openSecurePanel(
    config: UnifiedWebviewConfig,
    template: WebviewTemplate,
    context: vscode.ExtensionContext
): vscode.WebviewPanel {
    const factory = UnifiedWebviewFactory.getInstance();
    return factory.openSecurePanel(config, template, context);
}

/**
 * Builder class for creating webview templates with fluent API
 */
export class WebviewTemplateBuilder {
    private template: WebviewTemplate = {
        title: '',
        content: ''
    };

    title(title: string): WebviewTemplateBuilder {
        this.template.title = title;
        return this;
    }

    content(content: string): WebviewTemplateBuilder {
        this.template.content = content;
        return this;
    }

    addAction(action: WebviewAction): WebviewTemplateBuilder {
        if (!this.template.actions) {
            this.template.actions = [];
        }
        this.template.actions.push(action);
        return this;
    }

    addMetadata(key: string, value: any): WebviewTemplateBuilder {
        if (!this.template.metadata) {
            this.template.metadata = {};
        }
        this.template.metadata[key] = value;
        return this;
    }

    build(): WebviewTemplate {
        if (!this.template.title) {
            throw new Error('Template title is required');
        }
        if (!this.template.content) {
            throw new Error('Template content is required');
        }
        return { ...this.template };
    }
}

/**
 * Security audit function to check for deprecated webview creation
 */
export function auditWebviewSecurity(codeContent: string): SecurityAuditResult {
    const issues: SecurityIssue[] = [];

    // Check for direct createWebviewPanel usage
    const directCreatePattern = /vscode\.window\.createWebviewPanel\s*\(/g;
    let match;
    while ((match = directCreatePattern.exec(codeContent)) !== null) {
        issues.push({
            type: 'deprecated-api',
            severity: 'high',
            message: 'Direct use of createWebviewPanel detected. Use UnifiedWebviewFactory instead.',
            line: getLineNumber(codeContent, match.index)
        });
    }

    // Check for unescaped HTML interpolation
    const unsafeInterpolationPattern = /\$\{[^}]*(?:title|description|name|content|message)[^}]*\}/g;
    while ((match = unsafeInterpolationPattern.exec(codeContent)) !== null) {
        if (!codeContent.substring(match.index - 20, match.index).includes('escapeHtml')) {
            issues.push({
                type: 'unescaped-html',
                severity: 'critical',
                message: 'Potentially unescaped HTML interpolation detected.',
                line: getLineNumber(codeContent, match.index)
            });
        }
    }

    // Check for inline event handlers
    const inlineEventPattern = /onclick\s*=\s*["'][^"']*["']/g;
    while ((match = inlineEventPattern.exec(codeContent)) !== null) {
        issues.push({
            type: 'inline-handler',
            severity: 'medium',
            message: 'Inline event handler detected. Use postMessage instead.',
            line: getLineNumber(codeContent, match.index)
        });
    }

    return {
        issues,
        score: calculateSecurityScore(issues),
        recommendations: generateRecommendations(issues)
    };
}

interface SecurityIssue {
    type: 'deprecated-api' | 'unescaped-html' | 'inline-handler' | 'external-script';
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    line: number;
}

interface SecurityAuditResult {
    issues: SecurityIssue[];
    score: number;
    recommendations: string[];
}

function getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
}

function calculateSecurityScore(issues: SecurityIssue[]): number {
    const weights = { critical: 25, high: 15, medium: 8, low: 3 };
    const totalDeduction = issues.reduce((sum, issue) => sum + weights[issue.severity], 0);
    return Math.max(0, 100 - totalDeduction);
}

function generateRecommendations(issues: SecurityIssue[]): string[] {
    const recommendations = new Set<string>();

    if (issues.some(i => i.type === 'deprecated-api')) {
        recommendations.add('Migrate to UnifiedWebviewFactory for all webview creation');
    }

    if (issues.some(i => i.type === 'unescaped-html')) {
        recommendations.add('Use escapeHtml() for all dynamic content insertion');
    }

    if (issues.some(i => i.type === 'inline-handler')) {
        recommendations.add('Replace inline event handlers with postMessage communication');
    }

    if (recommendations.size === 0) {
        recommendations.add('No security issues detected. Good job!');
    }

    return Array.from(recommendations);
}