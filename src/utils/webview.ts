import * as vscode from 'vscode';

export function nonce(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function secureHtml(panel: vscode.WebviewPanel, body: (nonce: string) => string, ctx?: vscode.ExtensionContext): void {
  const n = nonce();
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${n}';">`;

  let bridgeScript = '';
  if (ctx) {
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', 'webview-bridge.js'));
    bridgeScript = `<script nonce="${n}" src="${scriptUri}"></script>`;
  }

  panel.webview.html = `<!doctype html><html><head>${csp}<meta charset="utf-8"></head><body>${body(n)}${bridgeScript}</body></html>`;
}

export function createMessageHandler(panel: vscode.WebviewPanel, handlers: Record<string, (payload: any) => Promise<void> | void>): vscode.Disposable {
  return panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.type !== 'cmd') {
      if (message?.type === 'error') {
        console.error('Webview error:', message.message, message.stack);
      }
      return;
    }

    const handler = handlers[message.id];
    if (handler) {
      try {
        await handler(message.payload);
      } catch (error) {
        console.error(`Error handling webview command '${message.id}':`, error);
      }
    } else {
      console.warn(`No handler found for webview command: ${message.id}`);
    }
  });
}

export function getSecureWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions & vscode.WebviewPanelOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: false, // Better performance
    localResourceRoots: [
      vscode.Uri.joinPath(extensionUri, 'media'),
      vscode.Uri.joinPath(extensionUri, 'out', 'media')
    ]
  };
}

export function generateSecureHtml(content: string): string {
  const scriptNonce = nonce();
  const styleNonce = nonce();

  // Content Security Policy - no external resources, only local ones
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${scriptNonce}'`,
    `style-src 'nonce-${styleNonce}' 'unsafe-inline'`, // unsafe-inline needed for dynamic styles
    "img-src vscode-resource: https: data:",
    "font-src vscode-resource:",
    "connect-src 'none'"
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Glueful Extension</title>
    <style nonce="${styleNonce}">
        /* Base styles will be injected here */
        ${getBaseStyles()}
    </style>
</head>
<body>
    ${content}
    <script nonce="${scriptNonce}">
        // VS Code API setup
        const vscode = acquireVsCodeApi();

        // Safe message posting
        function postMessage(command, data = {}) {
            vscode.postMessage({ command, ...data });
        }

        // Error boundary
        window.addEventListener('error', (e) => {
            console.error('Webview error:', e.error);
            postMessage('error', { message: e.error?.message || 'Unknown error' });
        });
    </script>
</body>
</html>`;
}

function getBaseStyles(): string {
  return `
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        margin: 0;
        padding: 20px;
        line-height: 1.5;
    }

    .container {
        max-width: 1200px;
        margin: 0 auto;
    }

    .card {
        background: var(--vscode-editor-widget-background);
        border: 1px solid var(--vscode-widget-border);
        border-radius: 6px;
        padding: 20px;
        margin-bottom: 20px;
    }

    .btn {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: inherit;
        font-family: inherit;
    }

    .btn:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .input {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 8px 12px;
        font-size: inherit;
        font-family: inherit;
        width: 100%;
        box-sizing: border-box;
    }

    .input:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }

    .table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }

    .table th,
    .table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-widget-border);
    }

    .table th {
        background: var(--vscode-editor-widget-background);
        font-weight: 600;
    }

    .table tbody tr:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .status-good { color: var(--vscode-testing-iconPassed); }
    .status-warning { color: var(--vscode-testing-iconQueued); }
    .status-error { color: var(--vscode-testing-iconFailed); }

    .grid {
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .text-center { text-align: center; }
    .mb-4 { margin-bottom: 1rem; }
    .mt-4 { margin-top: 1rem; }
  `;
}