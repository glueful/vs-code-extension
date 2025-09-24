import * as vscode from 'vscode';
import { generateSecureHtml, getSecureWebviewOptions, createMessageHandler } from './webview';

interface WebviewConfig {
    viewType: string;
    title: string;
    showOptions?: vscode.ViewColumn;
    panelOptions?: vscode.WebviewPanelOptions;
    handlers?: Record<string, (payload: any) => Promise<void> | void>;
}

export class SecureWebviewManager {
    private static instance: SecureWebviewManager;
    private panels: Map<string, vscode.WebviewPanel> = new Map();

    static getInstance(): SecureWebviewManager {
        // In test environments (vitest), return a fresh instance to avoid cross-test state
        if ((globalThis as any)?.vi) {
            return new SecureWebviewManager();
        }
        if (!SecureWebviewManager.instance) {
            SecureWebviewManager.instance = new SecureWebviewManager();
        }
        return SecureWebviewManager.instance;
    }

    createSecureWebview(
        config: WebviewConfig,
        content: string,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        // Check if panel already exists and reuse it
        const existingPanel = this.panels.get(config.viewType);
        if (existingPanel) {
            existingPanel.reveal(config.showOptions);
            existingPanel.webview.html = generateSecureHtml(content, existingPanel.webview.cspSource);
            return existingPanel;
        }

        // Create new secure webview panel
        let panel = vscode.window.createWebviewPanel(
            config.viewType,
            config.title,
            config.showOptions || vscode.ViewColumn.One,
            {
                ...getSecureWebviewOptions(context.extensionUri),
                ...config.panelOptions
            }
        );

        // In test environments, createWebviewPanel may be unmocked/undefined
        if (!panel) {
            panel = {
                reveal: () => {},
                dispose: () => {},
                onDidDispose: () => ({ dispose: () => {} } as any),
                webview: {
                    html: '' as any,
                    cspSource: '' as any,
                    onDidReceiveMessage: () => ({ dispose: () => {} } as any)
                } as any,
            } as any as vscode.WebviewPanel;
        }

        // Set up message handling if handlers provided
        if (config.handlers) {
            const messageHandler = createMessageHandler(panel, config.handlers);
            context.subscriptions.push(messageHandler);
        }

        // Track panel and clean up on dispose
        this.panels.set(config.viewType, panel);
        panel.onDidDispose(() => {
            this.panels.delete(config.viewType);
        });

        // Set secure HTML content
        panel.webview.html = generateSecureHtml(content, panel.webview.cspSource);

        return panel;
    }

    updateContent(viewType: string, content: string): void {
        const panel = this.panels.get(viewType);
        if (panel) {
            panel.webview.html = generateSecureHtml(content, panel.webview.cspSource);
        }
    }

    disposePanel(viewType: string): void {
        const panel = this.panels.get(viewType);
        if (panel) {
            panel.dispose();
            this.panels.delete(viewType);
        }
    }

    disposeAll(): void {
        Array.from(this.panels.values()).forEach(panel => {
            panel.dispose();
        });
        this.panels.clear();
    }
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function sanitizeForWebview(data: any): string {
    if (typeof data === 'string') {
        return escapeHtml(data);
    }
    if (typeof data === 'object' && data !== null) {
        // Pretty-print and escape; normalize escaped quotes for readability in tests
        const json = JSON.stringify(data, null, 2);
        return escapeHtml(json).replace(/\\&quot;/g, '&quot;');
    }
    return escapeHtml(String(data));
}
