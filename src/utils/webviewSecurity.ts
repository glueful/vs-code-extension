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
            existingPanel.webview.html = generateSecureHtml(content);
            return existingPanel;
        }

        // Create new secure webview panel
        const panel = vscode.window.createWebviewPanel(
            config.viewType,
            config.title,
            config.showOptions || vscode.ViewColumn.One,
            {
                ...getSecureWebviewOptions(context.extensionUri),
                ...config.panelOptions
            }
        );

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
        panel.webview.html = generateSecureHtml(content);

        return panel;
    }

    updateContent(viewType: string, content: string): void {
        const panel = this.panels.get(viewType);
        if (panel) {
            panel.webview.html = generateSecureHtml(content);
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
        return escapeHtml(JSON.stringify(data, null, 2));
    }
    return escapeHtml(String(data));
}