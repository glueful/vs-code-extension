import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SecureWebviewManager, escapeHtml } from '../utils/webviewSecurity';

interface ServiceDefinition {
    id: string;
    class?: string;
    factory?: [string, string];
    arguments?: string[];
    shared?: boolean;
    autowire?: boolean;
    alias?: string;
    tags?: Array<{name: string, priority?: number}>;
    file?: string;
    line?: number;
}

interface ContainerInfo {
    services: ServiceDefinition[];
    providers: string[];
    dependencies: Map<string, string[]>;
    circularDeps: string[][];
}

/**
 * Container Analysis Feature
 *
 * Provides DI container integration for Glueful framework:
 * - Service definition discovery and validation
 * - Dependency graph visualization
 * - Service provider analysis
 * - Container compilation status
 * - Circular dependency detection
 */
export class ContainerAnalysisProvider {
    private containerInfo: ContainerInfo | null = null;
    private workspaceRoot: string;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Watch for container configuration changes
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/config/{serviceproviders,extensions}.php')
        );

        configWatcher.onDidChange(() => this.refreshContainerInfo());
        configWatcher.onDidCreate(() => this.refreshContainerInfo());
        configWatcher.onDidDelete(() => this.refreshContainerInfo());

        // Watch service providers
        const providerWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/Providers/**/*.php')
        );

        providerWatcher.onDidChange(() => this.refreshContainerInfo());

        this.context.subscriptions.push(configWatcher, providerWatcher);

        // Initial load
        await this.refreshContainerInfo();
    }

    private async refreshContainerInfo(): Promise<void> {
        try {
            this.containerInfo = await this.analyzeContainer();
            this.updateStatusBar();
        } catch (error) {
            console.error('Failed to analyze container:', error);
        }
    }

    private async analyzeContainer(): Promise<ContainerInfo> {
        const services: ServiceDefinition[] = [];
        const providers: string[] = [];
        const dependencies = new Map<string, string[]>();

        // 1. Parse service configuration files
        await this.parseServiceConfigs(services);

        // 2. Discover service providers
        await this.discoverServiceProviders(providers, services);

        // 3. Build dependency graph
        this.buildDependencyGraph(services, dependencies);

        // 4. Detect circular dependencies
        const circularDeps = this.detectCircularDependencies(dependencies);

        return {
            services,
            providers,
            dependencies,
            circularDeps
        };
    }

    private async parseServiceConfigs(services: ServiceDefinition[]): Promise<void> {
        const configPaths = [
            path.join(this.workspaceRoot, 'config', 'serviceproviders.php'),
            path.join(this.workspaceRoot, 'config', 'extensions.php')
        ];

        for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
                try {
                    await this.parseConfigFile(configPath, services);
                } catch (error) {
                    console.error(`Failed to parse ${configPath}:`, error);
                }
            }
        }
    }

    private async parseConfigFile(filePath: string, services: ServiceDefinition[]): Promise<void> {
        const content = fs.readFileSync(filePath, 'utf8');

        // Parse service provider configuration format
        // These files list enabled providers, not service definitions directly
        if (filePath.includes('serviceproviders.php') || filePath.includes('extensions.php')) {
            // Extract provider class names from the enabled array
            const enabledMatch = content.match(/'enabled'\s*=>\s*\[(.*?)\]/s);
            if (enabledMatch) {
                const providerMatches = enabledMatch[1].matchAll(/([A-Za-z\\\\]+Provider::class|'[^']+Provider')/g);

                for (const match of providerMatches) {
                    const providerClass = match[1].replace(/::class$/, '').replace(/['"]/g, '');

                    // Create a placeholder service entry for the provider
                    const service: ServiceDefinition = {
                        id: providerClass,
                        class: providerClass,
                        file: filePath,
                        autowire: true, // Service providers are typically autowired
                        shared: true
                    };

                    services.push(service);
                }
            }
        } else {
            // Legacy: Parse direct service definitions (for backwards compatibility)
            const serviceMatches = content.matchAll(/'([^']+)'\s*=>\s*\[(.*?)\]/gs);

            for (const match of serviceMatches) {
                const serviceId = match[1];
                const definition = match[2];

                const service: ServiceDefinition = {
                    id: serviceId,
                    file: filePath
                };

                // Parse service definition properties
                if (definition.includes("'class'")) {
                    const classMatch = definition.match(/'class'\s*=>\s*([^,\]]+)/);
                    if (classMatch) {
                        service.class = classMatch[1].replace(/['"]/g, '').replace(/::class$/, '');
                    }
                }

                if (definition.includes("'factory'")) {
                    const factoryMatch = definition.match(/'factory'\s*=>\s*\[([^,]+),\s*'([^']+)'\]/);
                    if (factoryMatch) {
                        service.factory = [
                            factoryMatch[1].replace(/['"]/g, '').replace(/::class$/, ''),
                            factoryMatch[2]
                        ];
                    }
                }

                if (definition.includes("'autowire'")) {
                    service.autowire = definition.includes("'autowire' => true");
                }

                if (definition.includes("'shared'")) {
                    service.shared = definition.includes("'shared' => true");
                }

                services.push(service);
            }
        }
    }

    private async discoverServiceProviders(providers: string[], services: ServiceDefinition[]): Promise<void> {
        const providerPattern = new vscode.RelativePattern(
            this.workspaceRoot,
            '**/Providers/**/*Provider.php'
        );

        const providerFiles = await vscode.workspace.findFiles(providerPattern);

        for (const file of providerFiles) {
            try {
                const content = fs.readFileSync(file.fsPath, 'utf8');

                // Extract provider class name
                const classMatch = content.match(/class\s+(\w+)\s+extends\s+.*ServiceProvider/);
                if (classMatch) {
                    providers.push(classMatch[1]);

                    // Parse services() method if it exists
                    await this.parseProviderServices(file.fsPath, content, services);
                }
            } catch (error) {
                console.error(`Failed to parse provider ${file.fsPath}:`, error);
            }
        }
    }

    private async parseProviderServices(filePath: string, content: string, services: ServiceDefinition[]): Promise<void> {
        // Look for services() method returning array
        const servicesMethodMatch = content.match(/public\s+static\s+function\s+services\(\)\s*:\s*array\s*\{(.*?)\}/s);
        if (!servicesMethodMatch) return;

        const methodBody = servicesMethodMatch[1];
        const returnMatch = methodBody.match(/return\s*\[(.*?)\];/s);
        if (!returnMatch) return;

        const returnArray = returnMatch[1];

        // Parse service definitions (simplified)
        const serviceMatches = returnArray.matchAll(/([^,\[\]]+)\s*=>\s*\[(.*?)\]/gs);

        for (const match of serviceMatches) {
            const serviceId = match[1].trim().replace(/['"]/g, '');
            const definition = match[2];

            const service: ServiceDefinition = {
                id: serviceId,
                file: filePath
            };

            // Parse definition similar to config files
            if (definition.includes("'autowire'")) {
                service.autowire = definition.includes("'autowire' => true");
            }

            if (definition.includes("'shared'")) {
                service.shared = definition.includes("'shared' => true");
            }

            services.push(service);
        }
    }

    private buildDependencyGraph(services: ServiceDefinition[], dependencies: Map<string, string[]>): void {
        for (const service of services) {
            const deps: string[] = [];

            if (service.arguments) {
                for (const arg of service.arguments) {
                    if (arg.startsWith('@')) {
                        deps.push(arg.substring(1));
                    }
                }
            }

            if (service.factory) {
                deps.push(service.factory[0]);
            }

            dependencies.set(service.id, deps);
        }
    }

    private detectCircularDependencies(dependencies: Map<string, string[]>): string[][] {
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const cycles: string[][] = [];

        const visit = (serviceId: string, path: string[]): void => {
            if (visiting.has(serviceId)) {
                // Found a cycle
                const cycleStart = path.indexOf(serviceId);
                if (cycleStart >= 0) {
                    cycles.push(path.slice(cycleStart).concat(serviceId));
                }
                return;
            }

            if (visited.has(serviceId)) {
                return;
            }

            visiting.add(serviceId);
            path.push(serviceId);

            const deps = dependencies.get(serviceId) || [];
            for (const dep of deps) {
                visit(dep, [...path]);
            }

            visiting.delete(serviceId);
            visited.add(serviceId);
        };

        for (const serviceId of dependencies.keys()) {
            if (!visited.has(serviceId)) {
                visit(serviceId, []);
            }
        }

        return cycles;
    }

    private updateStatusBar(): void {
        if (!this.containerInfo) return;

        const statusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        const serviceCount = this.containerInfo.services.length;
        const providerCount = this.containerInfo.providers.length;
        const hasCircularDeps = this.containerInfo.circularDeps.length > 0;

        statusItem.text = `$(package) ${serviceCount} services`;
        statusItem.tooltip = `Container: ${serviceCount} services, ${providerCount} providers` +
                           (hasCircularDeps ? ` (${this.containerInfo.circularDeps.length} circular deps)` : '');

        if (hasCircularDeps) {
            statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        statusItem.command = 'glueful.container.showStatus';
        statusItem.show();

        this.context.subscriptions.push(statusItem);
    }

    // Public API methods for commands
    public getContainerInfo(): ContainerInfo | null {
        return this.containerInfo;
    }

    public async validateContainer(): Promise<vscode.Diagnostic[]> {
        if (!this.containerInfo) {
            return [];
        }

        const diagnostics: vscode.Diagnostic[] = [];

        // Check for circular dependencies
        for (const cycle of this.containerInfo.circularDeps) {
            const message = `Circular dependency detected: ${cycle.join(' -> ')}`;
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                message,
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(diagnostic);
        }

        // Check for missing services
        for (const [serviceId, deps] of this.containerInfo.dependencies) {
            for (const dep of deps) {
                const depExists = this.containerInfo.services.some(s => s.id === dep);
                if (!depExists) {
                    const message = `Service '${serviceId}' depends on missing service '${dep}'`;
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(0, 0, 0, 0),
                        message,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostics.push(diagnostic);
                }
            }
        }

        return diagnostics;
    }

    public async showDependencyGraph(): Promise<void> {
        if (!this.containerInfo) {
            vscode.window.showErrorMessage('Container info not available');
            return;
        }

        const manager = SecureWebviewManager.getInstance();
        const content = this.generateDependencyGraphHtml();

        manager.createSecureWebview({
            viewType: 'containerDependencyGraph',
            title: 'Container Dependency Graph',
            showOptions: vscode.ViewColumn.One
        }, content, this.context);
    }

    private generateDependencyGraphHtml(): string {
        if (!this.containerInfo) {
            return `
                <div class="container">
                    <div class="card text-center">
                        <h2>No Container Information</h2>
                        <p>Container analysis data is not available.</p>
                    </div>
                </div>
            `;
        }

        const nodes = this.containerInfo.services.map(service => ({
            id: escapeHtml(service.id),
            label: escapeHtml(service.id),
            group: service.autowire ? 'autowired' : 'manual'
        }));

        const edges: Array<{from: string, to: string}> = [];
        for (const [serviceId, deps] of this.containerInfo.dependencies) {
            for (const dep of deps) {
                edges.push({
                    from: escapeHtml(dep),
                    to: escapeHtml(serviceId)
                });
            }
        }

        return `
            <div class="container">
                <h1>Container Dependency Graph</h1>

                <div class="card">
                    <h3>Services Overview</h3>
                    <p><strong>Total Services:</strong> ${this.containerInfo.services.length}</p>
                    <p><strong>Dependencies:</strong> ${edges.length}</p>
                </div>

                <div class="card">
                    <h3>Service Dependencies</h3>
                    <div id="dependency-network" style="width: 100%; height: 500px; border: 1px solid var(--vscode-widget-border);">
                        <div style="padding: 20px; text-align: center;">
                            <p>Interactive dependency graph would be displayed here.</p>
                            <p><em>Note: External visualization libraries have been removed for security.</em></p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3>Service List</h3>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Service ID</th>
                                <th>Type</th>
                                <th>Dependencies</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.containerInfo.services.map(service => {
                                const serviceDeps = this.containerInfo!.dependencies.get(service.id) || [];
                                return `
                                    <tr>
                                        <td><code>${escapeHtml(service.id)}</code></td>
                                        <td><span class="status-${service.autowire ? 'good' : 'warning'}">
                                            ${service.autowire ? 'Autowired' : 'Manual'}
                                        </span></td>
                                        <td>${serviceDeps.map(dep => `<code>${escapeHtml(dep)}</code>`).join(', ') || 'None'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="card">
                    <h3>Security Note</h3>
                    <p class="status-warning">
                        ⚠️ Interactive graph visualization has been disabled for security reasons.
                        External JavaScript libraries pose security risks in VS Code extensions.
                    </p>
                </div>
            </div>
        `;
    }

    public dispose(): void {
        // Clean up any webview panels
        const manager = SecureWebviewManager.getInstance();
        manager.disposePanel('containerDependencyGraph');

        // Context subscriptions are automatically disposed by VS Code
        // This method provides explicit cleanup if needed
    }
}