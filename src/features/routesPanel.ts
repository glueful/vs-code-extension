import * as vscode from 'vscode';
import { runCliWithErrorHandling } from '../utils/cli';
import { debounce } from '../utils/debounce';
import { getWorkspaceRootPath } from '../utils/workspace';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';

type RouteRow = {
  method: string;
  path: string;
  handler: string;
  middleware?: string;
};

function parseRoutesListOutput(stdout: string): RouteRow[] {
  const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: RouteRow[] = [];

  for (const line of lines) {
    const parts = line.split(/\s{2,}|\t+\|?|\s\|\s/).filter(Boolean);
    if (parts.length >= 2) {
      let method = parts[0];
      let routePath = parts[1];
      let handler = parts[2] || '';
      let middleware = parts.slice(3).join(' ').replace(/^\[|\]$/g, '');

      if (!handler && /@[A-Za-z_][A-Za-z0-9_]*/.test(line)) {
        const m = line.match(/[A-Za-z_\\\\]+@[A-Za-z_][A-Za-z0-9_]*/);
        handler = m ? m[0] : '';
      }
      rows.push({ method, path: routePath, handler, middleware });
    }
  }
  return rows;
}

function generateRoutesContent(routes: RouteRow[], currentFilter: string = ''): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] as string));

  const filtered = currentFilter
    ? routes.filter(r =>
        (r.method + ' ' + r.path + ' ' + r.handler + ' ' + (r.middleware || ''))
          .toLowerCase().includes(currentFilter.toLowerCase())
      )
    : routes;

  if (filtered.length === 0) {
    return `
      <div class="container">
        <div class="card text-center">
          <h2>No Routes Found</h2>
          <p>No routes were discovered. Make sure your Glueful application has routes defined.</p>
          <button class="btn" data-cmd="refresh">🔄 Refresh</button>
        </div>
      </div>
    `;
  }

  const rows = filtered.map(r => `
    <tr data-handler="${esc(r.handler)}" data-cmd="openHandler" data-args='${JSON.stringify({ handler: r.handler }).replace(/'/g, '&#39;')}'>
      <td><span class="method-badge method-${r.method.toLowerCase()}">${esc(r.method)}</span></td>
      <td><code class="route-path">${esc(r.path)}</code></td>
      <td><code class="handler">${esc(r.handler)}</code></td>
      <td><span class="middleware">${esc(r.middleware || '')}</span></td>
    </tr>
  `).join('');

  return `
    <div class="container">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>🛣️ Glueful Routes</h1>
          <button class="btn" data-cmd="refresh">🔄 Refresh</button>
        </div>

        <div style="margin-bottom: 15px;">
          <input type="text" class="input" placeholder="🔍 Filter routes..." data-cmd="routes.filter" value="${esc(currentFilter)}">
        </div>

        <table class="table" id="routesTable">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Handler</th>
              <th>Middleware</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="mt-4 text-center">
          <small>Total: ${filtered.length} / ${routes.length} routes</small>
        </div>
      </div>
    </div>

    <style>
      .method-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 0.8em;
        text-transform: uppercase;
      }
      .method-get { background: #10b981; color: white; }
      .method-post { background: #3b82f6; color: white; }
      .method-put { background: #f59e0b; color: white; }
      .method-patch { background: #8b5cf6; color: white; }
      .method-delete { background: #ef4444; color: white; }
      .method-options { background: #6b7280; color: white; }

      .route-path {
        color: var(--vscode-textLink-foreground);
        background: var(--vscode-textCodeBlock-background);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .handler {
        color: var(--vscode-symbolIcon-classForeground);
        background: var(--vscode-textCodeBlock-background);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .middleware {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }

      .table tbody tr {
        cursor: pointer;
      }

      .table tbody tr:hover {
        background: var(--vscode-list-hoverBackground);
      }
    </style>
  `;
}

async function getRoutes(): Promise<RouteRow[]> {
  // Try JSON format first (more reliable and less brittle)
  const jsonResult = await runCliWithErrorHandling(['routes:list', '--format=json']);

  if (jsonResult.success && jsonResult.stdout.trim().startsWith('{')) {
    try {
      const data = JSON.parse(jsonResult.stdout);
      if (data.routes && Array.isArray(data.routes)) {
        return data.routes.map((r: any) => ({
          method: r.method || 'UNKNOWN',
          path: r.path || '/',
          handler: r.handler || '',
          middleware: Array.isArray(r.middleware) ? r.middleware.join(', ') : (r.middleware || '')
        }));
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON routes output:', parseError);
    }
  }

  // Fallback to text parsing
  const textResult = await runCliWithErrorHandling(['routes:list'], { showErrors: true });

  if (textResult.success) {
    return parseRoutesListOutput(textResult.stdout);
  }

  // If both failed, return empty array (errors already shown by runCliWithErrorHandling)
  return [];
}

export function registerRoutesPanel(context: vscode.ExtensionContext): void {
  // Debounced refresh function
  const debouncedRefresh = debounce(async () => {
    if (currentPanel) {
      await refreshPanel();
    }
  }, 300);

  let currentPanel: vscode.WebviewPanel | undefined;
  let currentFilter = '';

  const refreshPanel = async () => {
    if (!currentPanel) return;

    // Close existing panel and recreate with fresh content
    currentPanel.dispose();
    currentPanel = undefined;
    await createPanel();
  };

  const createPanel = async () => {
    const routes = await getRoutes();
    const template = new WebviewTemplateBuilder()
      .title('Glueful Routes')
      .content(generateRoutesContent(routes, currentFilter))
      .addAction({
        id: 'refresh',
        label: 'Refresh Routes',
        enabled: true
      })
      .build();

    currentPanel = openSecurePanel(
      {
        viewType: 'gluefulRoutes',
        title: 'Glueful Routes',
        retainContextWhenHidden: false,
        handlers: {
          'refresh': () => refreshPanel(),
          'openHandler': (payload: any) => openHandlerFile(payload?.handler || ''),
          'routes.filter': (payload: any) => {
            currentFilter = String(payload?.value || '').trim();
            refreshPanel();
          }
        }
      },
      template,
      context
    );

    currentPanel.onDidDispose(() => {
      currentPanel = undefined;
    });
  };

  const openHandlerFile = async (handler: string) => {
    try {
      // Parse handler format: App\\Http\\Controllers\\UserController@show
      const [className, methodName] = handler.split('@');
      if (!className) return;

      // Convert namespace to file path
      const relativePath = className.replace(/\\/g, '/').replace(/^App\//, 'src/') + '.php';
      const wsRoot = getWorkspaceRootPath();
      const fullPath = vscode.Uri.file(wsRoot + '/' + relativePath);

      const document = await vscode.workspace.openTextDocument(fullPath);
      const editor = await vscode.window.showTextDocument(document);

      // Try to find the method if specified
      if (methodName) {
        const text = document.getText();

        // More precise method search with word boundaries and visibility modifiers
        const methodPatterns = [
          `\\b(public|protected|private)\\s+function\\s+${methodName}\\b\\s*\\(`,
          `\\bfunction\\s+${methodName}\\b\\s*\\(`, // For functions without visibility
          `\\b${methodName}\\s*\\(.*\\)\\s*{` // Lambda/closure style
        ];

        let match: RegExpMatchArray | null = null;
        for (const pattern of methodPatterns) {
          const regex = new RegExp(pattern, 'g');
          match = regex.exec(text);
          if (match) break;
        }

        if (match && match.index !== undefined) {
          const position = document.positionAt(match.index);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open handler: ${error}`);
    }
  };

  // Register command
  context.subscriptions.push(
    vscode.commands.registerCommand('glueful.routesPanel', createPanel)
  );

  // Watch for route changes and refresh panel
  const routeWatcher = vscode.workspace.createFileSystemWatcher('**/*routes*.{php,json}');
  routeWatcher.onDidChange(debouncedRefresh);
  routeWatcher.onDidCreate(debouncedRefresh);
  routeWatcher.onDidDelete(debouncedRefresh);

  context.subscriptions.push(routeWatcher);
}
