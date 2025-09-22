
import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { debounce } from '../utils/debounce';
import { RobustRouteParser } from '../utils/routeParser';

type RouteItem = {
  method: string;
  path: string;
  handler: string;
  middleware?: string[];
  name?: string;
  type?: 'static' | 'dynamic';
  group?: string;
  compiled?: boolean;
};

type Manifest = {
  routes?: RouteItem[];
  static?: RouteItem[];
  dynamic?: RouteItem[];
  generated_at?: number;
  environment?: string;
};

type GroupedRoutes = {
  [category: string]: RouteItem[];
};

export class GluefulRoutesProvider implements vscode.TreeDataProvider<RouteNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RouteNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private routes: RouteItem[] = [];
  private groupedRoutes: GroupedRoutes = {};
  private watchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    this.load().catch(console.error);
    this.watch();
  }

  async refresh() {
    await this.load();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(n: RouteNode) { return n; }

  getChildren(element?: RouteNode): RouteNode[] {
    if (!element) {
      // Root level - show categories
      const categories = Object.keys(this.groupedRoutes);
      if (categories.length === 0) {
        return this.routes.map(r => new RouteNode(`${r.method} ${r.path}`, r));
      }
      return categories.map(cat => new RouteNode(cat, undefined, cat));
    }

    if (element.category) {
      // Show routes in this category
      const categoryRoutes = this.groupedRoutes[element.category] || [];
      return categoryRoutes.map(r => new RouteNode(`${r.method} ${r.path}`, r));
    }

    return [];
  }

  private async manifestPath(): Promise<string | undefined> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return;

    // Check for compiled route cache first (production format)
    const cacheDir = path.join(ws, 'storage', 'cache');
    const env = process.env.APP_ENV || 'development';
    const compiledCache = path.join(cacheDir, `routes_${env === 'production' ? 'prod' : 'dev'}.php`);

    try {
      await fsp.access(compiledCache);
      return compiledCache;
    } catch {
      // File doesn't exist, continue to JSON manifests
    }

    // Fall back to JSON manifests
    const candidates = [
      'bootstrap/cache/routes.manifest.json',
      'storage/cache/routes.manifest.json',
      'var/cache/routes.manifest.json',
      'storage/cache/routes.json'
    ].map(p => path.join(ws, p));

    for (const candidate of candidates) {
      try {
        await fsp.access(candidate);
        return candidate;
      } catch {
        // File doesn't exist, try next
      }
    }
    return undefined;
  }

  private async parseCompiledRoutes(filePath: string): Promise<RouteItem[]> {
    try {
      const content = await fsp.readFile(filePath, 'utf8');
      const routes: RouteItem[] = [];

      // Parse PHP route cache - look for route definitions
      // This is a simplified parser for the compiled route format
      const routePattern = /['"]([A-Z]+)['"]\s*=>\s*\[([^\]]+)\]/g;
      let match;

      while ((match = routePattern.exec(content)) !== null) {
        const method = match[1];
        const routeData = match[2];

        // Extract path and handler from route data
        const pathMatch = routeData.match(/['"]([^'"]+)['"]/);
        const handlerMatch = routeData.match(/handler['"]\s*=>\s*['"]([^'"]+)['"]/);

        if (pathMatch && handlerMatch) {
          routes.push({
            method,
            path: pathMatch[1],
            handler: handlerMatch[1],
            type: pathMatch[1].includes('{') ? 'dynamic' : 'static',
            compiled: true
          });
        }
      }

      return routes;
    } catch (error) {
      console.error('Error parsing compiled routes:', error);
      return [];
    }
  }

  private async parseAttributeRoutes(): Promise<RouteItem[]> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return [];

    const routes: RouteItem[] = [];

    try {
      // Look for PHP files with Route attributes
      const srcDir = path.join(ws, 'src');
      try {
        await fsp.access(srcDir);
      } catch {
        return [];
      }

      const phpFiles = await this.findPhpFiles(srcDir);

      for (const file of phpFiles) {
        const content = await fsp.readFile(file, 'utf8');
        const fileRoutes = this.extractAttributeRoutes(content, file);
        routes.push(...fileRoutes);
      }
    } catch (error) {
      console.error('Error parsing attribute routes:', error);
    }

    return routes;
  }

  private async findPhpFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fsp.readdir(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fsp.stat(fullPath);

        if (stat.isDirectory()) {
          const subdirFiles = await this.findPhpFiles(fullPath);
          files.push(...subdirFiles);
        } else if (entry.endsWith('.php')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory may not exist or be accessible
    }

    return files;
  }

  private extractAttributeRoutes(content: string, filePath: string): RouteItem[] {
    const parser = new RobustRouteParser();

    try {
      const parsedRoutes = parser.extractAttributeRoutes(content, filePath, {
        supportMultiline: true,
        strictParsing: false,
        extractLineNumbers: true
      });

      // Convert ParsedRoute to RouteItem format
      return parsedRoutes.map(route => ({
        method: route.method,
        path: route.path,
        handler: route.handler,
        middleware: route.middleware,
        name: route.name,
        type: route.type
      }));
    } catch (error) {
      console.error(`Failed to parse routes in ${filePath}:`, error);

      // Fallback to original simple parsing
      return this.extractAttributeRoutesLegacy(content, filePath);
    }
  }

  private extractAttributeRoutesLegacy(content: string, filePath: string): RouteItem[] {
    const routes: RouteItem[] = [];

    // Look for #[Route] attributes (original simple regex)
    const routePattern = /#\[Route\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"](?:,\s*(.+?))?\)\]\s*(?:public\s+)?function\s+(\w+)/g;
    let match;

    while ((match = routePattern.exec(content)) !== null) {
      const path = match[1];
      const method = match[2];
      const options = match[3] || '';
      const functionName = match[4];

      // Extract class name from file path
      const className = this.extractClassName(content, filePath);
      const handler = `${className}@${functionName}`;

      // Parse middleware from options
      const middlewareMatch = options.match(/middleware:\s*\[([^\]]+)\]/);
      const middleware = middlewareMatch ?
        middlewareMatch[1].split(',').map(m => m.trim().replace(/['"]/g, '')) :
        undefined;

      // Parse route name
      const nameMatch = options.match(/name:\s*['"]([^'"]+)['"]/);
      const name = nameMatch ? nameMatch[1] : undefined;

      routes.push({
        method: method.toUpperCase(),
        path,
        handler,
        middleware,
        name,
        type: path.includes('{') ? 'dynamic' : 'static'
      });
    }

    return routes;
  }

  private extractClassName(content: string, filePath: string): string {
    // Try to extract class name from namespace and class declaration
    const namespaceMatch = content.match(/namespace\s+([^;]+);/);
    const classMatch = content.match(/class\s+(\w+)/);

    if (namespaceMatch && classMatch) {
      return `${namespaceMatch[1]}\\${classMatch[1]}`;
    } else if (classMatch) {
      return classMatch[1];
    }

    // Fall back to file name
    return path.basename(filePath, '.php');
  }

  private async load() {
    const manifestFile = await this.manifestPath();
    if (!manifestFile) {
      // Try to parse attribute-based routes if no manifest
      this.routes = await this.parseAttributeRoutes();
      this.groupRoutes();
      return;
    }

    try {
      if (manifestFile.endsWith('.php')) {
        // Parse compiled route cache
        this.routes = await this.parseCompiledRoutes(manifestFile);
      } else {
        // Parse JSON manifest
        const raw = await fsp.readFile(manifestFile, 'utf8');
        const data: Manifest = JSON.parse(raw);

        // Handle different manifest formats
        if (data.routes) {
          this.routes = data.routes;
        } else if (data.static && data.dynamic) {
          this.routes = [...data.static, ...data.dynamic];
        } else {
          this.routes = [];
        }
      }

      // Supplement with attribute routes if not already comprehensive
      if (this.routes.length === 0) {
        this.routes = await this.parseAttributeRoutes();
      }

      this.groupRoutes();

    } catch (error) {
      console.error('Error loading routes:', error);
      this.routes = [];
      this.groupedRoutes = {};
    }
  }

  private groupRoutes() {
    this.groupedRoutes = {};

    for (const route of this.routes) {
      // Group by method or custom category
      let category = route.method || 'Unknown';

      // Add performance category
      if (route.type === 'static') {
        category = `${category} (Static)`;
      } else if (route.type === 'dynamic') {
        category = `${category} (Dynamic)`;
      }

      if (!this.groupedRoutes[category]) {
        this.groupedRoutes[category] = [];
      }
      this.groupedRoutes[category].push(route);
    }

    // Sort routes within each category
    for (const category in this.groupedRoutes) {
      this.groupedRoutes[category].sort((a, b) =>
        (a.path + a.method).localeCompare(b.path + b.method)
      );
    }
  }

  private watch() {
    const refreshDebounced = debounce(() => this.refresh(), 300);

    // Watch for route cache files
    const cacheWatcher = vscode.workspace.createFileSystemWatcher('**/storage/cache/routes_*.php');
    cacheWatcher.onDidChange(refreshDebounced);
    cacheWatcher.onDidCreate(refreshDebounced);
    cacheWatcher.onDidDelete(refreshDebounced);
    this.watchers.push(cacheWatcher);

    // Watch for route manifest files
    const manifestWatcher = vscode.workspace.createFileSystemWatcher('**/*routes*.{json,manifest.json}');
    manifestWatcher.onDidChange(refreshDebounced);
    manifestWatcher.onDidCreate(refreshDebounced);
    manifestWatcher.onDidDelete(refreshDebounced);
    this.watchers.push(manifestWatcher);

    // Watch for PHP files with route attributes
    const phpWatcher = vscode.workspace.createFileSystemWatcher('**/src/**/*.php');
    phpWatcher.onDidChange(refreshDebounced);
    phpWatcher.onDidCreate(refreshDebounced);
    phpWatcher.onDidDelete(refreshDebounced);
    this.watchers.push(phpWatcher);
  }

  public dispose() {
    // Dispose all watchers
    this.watchers.forEach(watcher => watcher.dispose());
    this.watchers = [];

    // Dispose event emitter
    this._onDidChangeTreeData.dispose();
  }
}

class RouteNode extends vscode.TreeItem {
  constructor(label: string, public readonly route?: RouteItem, public readonly category?: string) {
    super(label, category ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

    if (category) {
      // This is a category node
      this.contextValue = 'glueful.category';
      this.iconPath = new vscode.ThemeIcon('folder');
      return;
    }

    if (!route) return;

    this.description = route.handler;
    this.contextValue = 'glueful.route';

    // Enhanced tooltip with more information
    const tooltipLines = [
      `**Handler:** ${route.handler}`,
      `**Type:** ${route.type || 'unknown'} ${route.compiled ? '(compiled)' : ''}`,
      `**Middleware:** ${(route.middleware ?? []).join(', ') || '—'}`
    ];

    if (route.name) {
      tooltipLines.push(`**Name:** ${route.name}`);
    }

    this.tooltip = new vscode.MarkdownString(tooltipLines.join('\n\n'));

    // Set icon based on route type and method
    if (route.type === 'static') {
      this.iconPath = new vscode.ThemeIcon('zap');
    } else if (route.type === 'dynamic') {
      this.iconPath = new vscode.ThemeIcon('gear');
    } else {
      this.iconPath = new vscode.ThemeIcon('link');
    }

    // Command to open controller
    this.command = {
      command: 'vscode.open',
      title: 'Open Controller',
      arguments: [guessControllerUri(route.handler)]
    };
  }
}

function guessControllerUri(handler: string | undefined): vscode.Uri | undefined {
  if (!handler) return;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const fqcn = (handler.split('@')[0] || '').replace(/^\\?/, '');
  if (!fqcn) return;
  const rel = 'src/' + fqcn.replace(/^App\\?/, '').replace(/\\/g, '/') + '.php';
  return vscode.Uri.file(path.join(root, rel));
}
