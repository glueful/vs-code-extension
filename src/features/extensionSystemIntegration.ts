import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { openSecurePanel, WebviewTemplateBuilder } from '../utils/unifiedWebviewFactory';
import { escapeHtml } from '../utils/webviewSecurity';

interface GluefulExtension {
    // From composer.json
    name: string;
    version: string;
    description?: string;
    author?: string;
    provider?: string; // Main ServiceProvider class from extra.glueful.provider

    // Extension metadata (from registerMeta)
    slug?: string;

    // Runtime status (from config/extensions.php parsing)
    enabled: boolean;
}

interface ExtensionCommand {
    name: string;
    description: string;
    signature: string;
    category: string;
}

interface ExtensionComposer {
    name: string;
    version?: string;
    description?: string;
    author?: string;
    authors?: Array<{name: string}>;
    type?: string; // "glueful-extension"
    autoload?: {
        'psr-4'?: Record<string, string>;
    };
    extra?: {
        glueful?: {
            provider?: string; // Main ServiceProvider class
            commands?: ExtensionCommand[];
            hooks?: string[];
            config?: Record<string, any>;
        };
    };
    require?: Record<string, string>;
}

interface ExtensionRegistry {
    enabled: string[];
    disabled: string[];
    available: Record<string, GluefulExtension>;
}

/**
 * Extension System Integration Feature
 *
 * Provides comprehensive extension management for Glueful framework:
 * - Extension discovery and registration
 * - Enable/disable extension management
 * - Extension development tools
 * - Dependency management
 * - Extension marketplace integration
 * - Custom extension scaffolding
 */
export class ExtensionSystemIntegrationProvider {
    private workspaceRoot: string;
    private extensionRegistry: ExtensionRegistry;
    private statusBarItem!: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.extensionRegistry = {
            enabled: [],
            disabled: [],
            available: {}
        };

        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            95
        );

        // Scan for extensions
        await this.scanExtensions();

        // Watch for extension changes
        this.setupExtensionWatchers();

        // Update status bar
        this.updateStatusBar();

        this.context.subscriptions.push(this.statusBarItem);
    }

    private async scanExtensions(): Promise<void> {
        this.extensionRegistry.available = {};

        // Scan different extension locations
        const scanPaths = [
            // Local development extensions
            path.join(this.workspaceRoot, 'extensions'),
            // Composer packages
            path.join(this.workspaceRoot, 'vendor'),
            // App extensions (if any)
            path.join(this.workspaceRoot, 'app', 'Extensions')
        ];

        for (const scanPath of scanPaths) {
            if (fs.existsSync(scanPath)) {
                await this.scanExtensionDirectory(scanPath);
            }
        }

        // Load extension registry
        await this.loadExtensionRegistry();
    }

    private async scanExtensionDirectory(directory: string): Promise<void> {
        try {
            const items = fs.readdirSync(directory);

            for (const item of items) {
                const itemPath = path.join(directory, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    const composerPath = path.join(itemPath, 'composer.json');

                    if (fs.existsSync(composerPath)) {
                        await this.loadComposerExtension(composerPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to scan extension directory ${directory}:`, error);
        }
    }


    private async loadComposerExtension(composerPath: string): Promise<void> {
        try {
            const content = fs.readFileSync(composerPath, 'utf8');
            const composer: ExtensionComposer = JSON.parse(content);

            // Check if it's a Glueful extension
            if (composer.type === 'glueful-extension' ||
                (composer.extra && composer.extra.glueful)) {

                const extension: GluefulExtension = {
                    name: composer.name,
                    version: composer.version || '1.0.0',
                    description: composer.description,
                    author: composer.author || composer.authors?.[0]?.name,
                    provider: composer.extra?.glueful?.provider,
                    enabled: false // Will be updated when parsing config/extensions.php
                };

                this.extensionRegistry.available[extension.name] = extension;
            }
        } catch (error) {
            console.error(`Failed to load composer extension ${composerPath}:`, error);
        }
    }

    private async loadExtensionRegistry(): Promise<void> {
        const registryPaths = [
            path.join(this.workspaceRoot, 'config', 'extensions.php'),
            path.join(this.workspaceRoot, 'config', 'serviceproviders.php')
        ];

        for (const registryPath of registryPaths) {
            if (fs.existsSync(registryPath)) {
                await this.parseExtensionRegistry(registryPath);
            }
        }
    }

    private async parseExtensionRegistry(registryPath: string): Promise<void> {
        try {
            const content = fs.readFileSync(registryPath, 'utf8');

            // Parse enabled extensions from PHP configuration
            const enabledMatch = content.match(/'enabled'\s*=>\s*\[([\s\S]*?)\]/);
            if (enabledMatch) {
                const enabledExtensions = enabledMatch[1]
                    .split(',')
                    .map(line => {
                        const match = line.match(/([A-Za-z\\\\]+)::class|'([^']+)'/);
                        return match ? (match[1] || match[2]).replace(/::class$/, '') : null;
                    })
                    .filter((item): item is string => Boolean(item));

                // Update extension enabled status by matching ServiceProvider classes
                for (const extension of Object.values(this.extensionRegistry.available)) {
                    extension.enabled = enabledExtensions.some(enabled =>
                        extension.provider === enabled ||
                        extension.provider?.includes(enabled) ||
                        enabled.includes(extension.name)
                    );
                }

                this.extensionRegistry.enabled = enabledExtensions;
            }
        } catch (error) {
            console.error(`Failed to parse extension registry ${registryPath}:`, error);
        }
    }

    private setupExtensionWatchers(): void {
        const watchPaths = [
            'config/extensions.php',
            'config/serviceproviders.php',
            'extensions/**/*.json',
            'app/Extensions/**/*.json'
        ];

        for (const watchPath of watchPaths) {
            const pattern = new vscode.RelativePattern(this.workspaceRoot, watchPath);
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            watcher.onDidChange(() => this.refreshExtensions());
            watcher.onDidCreate(() => this.refreshExtensions());
            watcher.onDidDelete(() => this.refreshExtensions());

            this.context.subscriptions.push(watcher);
        }
    }

    private async refreshExtensions(): Promise<void> {
        await this.scanExtensions();
        this.updateStatusBar();
    }

    private updateStatusBar(): void {
        const total = Object.keys(this.extensionRegistry.available).length;
        const enabled = Object.values(this.extensionRegistry.available)
            .filter(ext => ext.enabled).length;

        this.statusBarItem.text = `$(extensions) ${enabled}/${total}`;
        this.statusBarItem.tooltip = `Glueful Extensions: ${enabled} enabled, ${total} available`;
        this.statusBarItem.command = 'glueful.extensions.dashboard';
        this.statusBarItem.show();
    }

    public async enableExtension(extensionName: string): Promise<void> {
        const extension = this.extensionRegistry.available[extensionName];
        if (!extension) {
            vscode.window.showErrorMessage(`Extension '${extensionName}' not found`);
            return;
        }

        // Check dependencies
        const missingDeps = await this.checkDependencies(extension);
        if (missingDeps.length > 0) {
            const install = await vscode.window.showWarningMessage(
                `Extension '${extensionName}' requires: ${missingDeps.join(', ')}`,
                'Install Dependencies', 'Cancel'
            );

            if (install === 'Install Dependencies') {
                await this.installDependencies(missingDeps);
            } else {
                return;
            }
        }

        // Enable the extension
        extension.enabled = true;
        await this.updateExtensionRegistry();

        vscode.window.showInformationMessage(`Extension '${escapeHtml(extensionName)}' enabled successfully`);
        this.updateStatusBar();
    }

    public async disableExtension(extensionName: string): Promise<void> {
        const extension = this.extensionRegistry.available[extensionName];
        if (!extension) {
            vscode.window.showErrorMessage(`Extension '${extensionName}' not found`);
            return;
        }

        extension.enabled = false;
        await this.updateExtensionRegistry();

        vscode.window.showInformationMessage(`Extension '${escapeHtml(extensionName)}' disabled successfully`);
        this.updateStatusBar();
    }

    private async checkDependencies(extension: GluefulExtension): Promise<string[]> {
        // In Glueful, dependencies are handled by Composer
        // The framework doesn't track or validate dependencies at the extension level
        // This is handled by composer.json and composer.lock
        return [];
    }

    private async checkComposerDependency(dependency: string): Promise<boolean> {
        const composerLock = path.join(this.workspaceRoot, 'composer.lock');
        if (!fs.existsSync(composerLock)) return false;

        try {
            const content = fs.readFileSync(composerLock, 'utf8');
            const lock = JSON.parse(content);

            return lock.packages?.some((pkg: any) => pkg.name === dependency) || false;
        } catch {
            return false;
        }
    }

    private async installDependencies(dependencies: string[]): Promise<void> {
        // This would typically run composer install for dependencies
        vscode.window.showInformationMessage(
            `Would install dependencies: ${dependencies.join(', ')}`
        );
    }

    private async updateExtensionRegistry(): Promise<void> {
        const configPath = path.join(this.workspaceRoot, 'config', 'extensions.php');

        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage('Extension configuration file not found');
            return;
        }

        // This would update the PHP configuration file
        // For now, just show what would be updated
        const enabled = Object.values(this.extensionRegistry.available)
            .filter(ext => ext.enabled)
            .map(ext => ext.name);

        console.log('Would update extension registry with enabled extensions:', enabled);
    }

    public showExtensionsDashboard(): void {
        // Ensure extensions are scanned
        this.scanExtensions().then(() => {
            const template = new WebviewTemplateBuilder()
                .title('Glueful Extensions')
                .content(this.generateSecureExtensionsContent())
                .addAction({
                    id: 'createExtension',
                    label: '⚡ Create New Extension',
                    enabled: true,
                    primary: true
                })
                .addAction({
                    id: 'refresh',
                    label: '🔄 Refresh',
                    enabled: true
                })
                .addMetadata('Total Extensions', Object.keys(this.extensionRegistry.available).length)
                .addMetadata('Enabled', this.extensionRegistry.enabled.length)
                .build();

            const panel = openSecurePanel(
                {
                    viewType: 'gluefulExtensions',
                    title: 'Glueful Extensions',
                    handlers: this.createExtensionHandlers()
                },
                template,
                this.context
            );

            // Store panel reference if needed for updates
            this.context.subscriptions.push(panel);
        });
    }

    private createExtensionHandlers(): Record<string, (payload: any) => Promise<void> | void> {
        return {
            'createExtension': async () => {
                await this.createExtensionScaffold();
            },
            'refresh': async () => {
                await this.scanExtensions();
                vscode.window.showInformationMessage('Extensions refreshed');
            },
            'enableExtension': async (payload) => {
                const { name } = payload;
                if (name) {
                    await this.enableExtension(name);
                    vscode.window.showInformationMessage(`Extension ${escapeHtml(name)} enabled`);
                }
            },
            'disableExtension': async (payload) => {
                const { name } = payload;
                if (name) {
                    await this.disableExtension(name);
                    vscode.window.showInformationMessage(`Extension ${escapeHtml(name)} disabled`);
                }
            },
            'viewExtension': (payload) => {
                const { name } = payload;
                if (name) {
                    this.viewExtensionDetails(name);
                }
            },
            'configureExtension': (payload) => {
                const { name } = payload;
                if (name) {
                    vscode.window.showInformationMessage(`Configure ${escapeHtml(name)} - Coming soon`);
                }
            }
        };
    }

    private generateSecureExtensionsContent(): string {
        const extensions = Object.values(this.extensionRegistry.available);
        const enabled = extensions.filter(ext => ext.enabled);
        const disabled = extensions.filter(ext => !ext.enabled);

        return `
            <div class="extensions-container">
                ${this.generateExtensionStats(enabled, disabled, extensions)}
                ${this.generateExtensionsGrid(extensions)}
            </div>

            <script>
                // Secure event delegation for extension actions
                document.addEventListener('click', (event) => {
                    const target = event.target.closest('[data-action]');
                    if (!target) return;

                    const action = target.dataset.action;
                    const payload = {};

                    // Collect all data attributes for the payload
                    for (const [key, value] of Object.entries(target.dataset)) {
                        if (key !== 'action') {
                            payload[key] = value;
                        }
                    }

                    // Send message to VS Code
                    window.postMessage({
                        command: action,
                        payload
                    }, '*');
                });
            </script>
        `;
    }

    private generateExtensionStats(enabled: GluefulExtension[], disabled: GluefulExtension[], total: GluefulExtension[]): string {
        return `
            <div class="extension-stats">
                <div class="stat-card">
                    <div class="stat-value">${enabled.length}</div>
                    <div class="stat-label">Enabled</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${disabled.length}</div>
                    <div class="stat-label">Available</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${total.length}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>
        `;
    }

    private generateExtensionsGrid(extensions: GluefulExtension[]): string {
        if (extensions.length === 0) {
            return `
                <div class="no-extensions">
                    <p>No extensions found</p>
                    <button class="btn btn-primary" data-action="createExtension">
                        Create Your First Extension
                    </button>
                </div>
            `;
        }

        return `
            <div class="extensions-grid">
                ${extensions.map(ext => this.generateExtensionCard(ext)).join('')}
            </div>
        `;
    }

    private generateExtensionCard(ext: GluefulExtension): string {
        const providerName = ext.provider ? ext.provider.split('\\').pop() || '' : '';

        return `
            <div class="extension-card ${ext.enabled ? 'enabled' : 'disabled'}">
                <div class="extension-header">
                    <div class="extension-name">${escapeHtml(ext.name)}</div>
                    <div class="extension-version">v${escapeHtml(ext.version)}</div>
                </div>

                <div class="extension-meta">
                    ${ext.author ? `by ${escapeHtml(ext.author)}` : ''}
                    ${providerName ? ` • Provider: ${escapeHtml(providerName)}` : ''}
                </div>

                ${ext.description ? `<div class="extension-description">${escapeHtml(ext.description)}</div>` : ''}

                <div class="extension-actions">
                    ${ext.enabled
                        ? `<button class="btn btn-secondary"
                                  data-action="disableExtension"
                                  data-name="${escapeHtml(ext.name)}">
                              Disable
                           </button>`
                        : `<button class="btn btn-success"
                                  data-action="enableExtension"
                                  data-name="${escapeHtml(ext.name)}">
                              Enable
                           </button>`
                    }
                    <button class="btn btn-primary"
                            data-action="viewExtension"
                            data-name="${escapeHtml(ext.name)}">
                        View Details
                    </button>
                    <button class="btn btn-info"
                            data-action="configureExtension"
                            data-name="${escapeHtml(ext.name)}">
                        ⚙️
                    </button>
                </div>
            </div>
        `;
    }

    private viewExtensionDetails(name: string): void {
        const extension = this.extensionRegistry.available[name];
        if (extension) {
            vscode.window.showInformationMessage(
                `Extension: ${escapeHtml(extension.name)} v${escapeHtml(extension.version)}`,
                'Open Folder'
            ).then(selection => {
                if (selection === 'Open Folder') {
                    // Open extension folder logic
                }
            });
        }
    }


    public async createExtensionScaffold(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter extension name (e.g., my-awesome-extension)',
            validateInput: (value) => {
                if (!value) return 'Extension name is required';
                if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only';
                return null;
            }
        });

        if (!name) return;

        const description = await vscode.window.showInputBox({
            prompt: 'Enter extension description (optional)',
        });

        const author = await vscode.window.showInputBox({
            prompt: 'Enter author name (optional)',
        });

        await this.scaffoldExtension(name, description, author);
    }

    private async scaffoldExtension(name: string, description?: string, author?: string): Promise<void> {
        const extensionsDir = path.join(this.workspaceRoot, 'extensions');
        const extensionDir = path.join(extensionsDir, name);

        // Create extension directory
        if (!fs.existsSync(extensionsDir)) {
            fs.mkdirSync(extensionsDir, { recursive: true });
        }

        if (fs.existsSync(extensionDir)) {
            vscode.window.showErrorMessage(`Extension directory '${escapeHtml(name)}' already exists`);
            return;
        }

        fs.mkdirSync(extensionDir, { recursive: true });

        // Create extension manifest
        const manifest: ExtensionComposer = {
            name,
            version: '1.0.0',
            description: description || `Custom Glueful extension: ${escapeHtml(name)}`,
            author: author || 'Developer',
            type: 'glueful-extension',
            autoload: {
                'psr-4': {
                    [`${escapeHtml(this.toPascalCase(name))}\\`]: 'src/'
                }
            },
            extra: {
                glueful: {
                    provider: `${escapeHtml(this.toPascalCase(name))}\\${escapeHtml(this.toPascalCase(name))}ServiceProvider`
                }
            }
        };

        fs.writeFileSync(
            path.join(extensionDir, 'composer.json'),
            JSON.stringify(manifest, null, 2)
        );

        // Create basic PHP files
        const srcDir = path.join(extensionDir, 'src');
        fs.mkdirSync(srcDir);

        const providerClass = this.generateServiceProvider(name);
        fs.writeFileSync(path.join(srcDir, `${escapeHtml(this.toPascalCase(name))}ServiceProvider.php`), providerClass);

        // Create routes directory
        const routesDir = path.join(extensionDir, 'routes');
        fs.mkdirSync(routesDir);

        const routesFile = this.generateRoutesFile();
        fs.writeFileSync(path.join(routesDir, 'routes.php'), routesFile);

        // Create README
        const readme = this.generateReadme(name, description, author);
        fs.writeFileSync(path.join(extensionDir, 'README.md'), readme);

        vscode.window.showInformationMessage(
            `Extension '${escapeHtml(name)}' created successfully at ${escapeHtml(extensionDir)}`,
            'Open Extension'
        ).then(selection => {
            if (selection === 'Open Extension') {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(extensionDir), true);
            }
        });

        // Refresh extensions
        await this.refreshExtensions();
    }

    private toPascalCase(str: string): string {
        return str.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
    }


    private generateServiceProvider(name: string): string {
        const className = this.toPascalCase(name);
        return `<?php

declare(strict_types=1);

namespace ${className};

use Glueful\\Extensions\\ServiceProvider;

/**
 * ${className} Extension Service Provider
 */
class ${className}ServiceProvider extends ServiceProvider
{
    /**
     * Register services in DI container (called during compilation).
     * Returns service definitions that get compiled into the container.
     */
    public static function services(): array
    {
        return [
            // Define your services here
            // Example:
            // 'my.service' => [
            //     'class' => MyService::class,
            //     'autowire' => true,
            //     'shared' => true,
            // ],
        ];
    }

    /**
     * Register runtime configuration and setup.
     */
    public function register(): void
    {
        // Register configuration, bindings, etc.
    }

    /**
     * Boot after all providers are registered.
     */
    public function boot(): void
    {
        // Load routes
        \$this->loadRoutesFrom(__DIR__.'/../routes/routes.php');

        // Register console commands (if running in console)
        if (\$this->runningInConsole()) {
            // \$this->commands([
            //     Commands\\MyCommand::class,
            // ]);
        }

        // Register extension metadata
        if (\$this->app->has(\\Glueful\\Extensions\\ExtensionManager::class)) {
            \$this->app->get(\\Glueful\\Extensions\\ExtensionManager::class)->registerMeta(self::class, [
                'slug' => '${escapeHtml(name)}',
                'name' => '${escapeHtml(className)} Extension',
                'version' => '1.0.0',
                'description' => 'Custom ${escapeHtml(className)} extension for Glueful',
            ]);
        }
    }
}
`;
    }

    private generateRoutesFile(): string {
        return `<?php

/**
 * Extension Routes
 *
 * Define your extension routes here.
 * The \$router variable is automatically available.
 */

// Example route:
// \$router->get('/my-extension', function() {
//     return ['message' => 'Hello from my extension!'];
// });
`;
    }

    private generateReadme(name: string, description?: string, author?: string): string {
        const className = this.toPascalCase(name);
        return `# ${escapeHtml(className)} Extension

${description || `A custom Glueful framework extension: ${escapeHtml(name)}`}

## Installation

### Local Development Extension

1. This extension is automatically discovered in the \`extensions/\` directory
2. Add the service provider to your \`config/extensions.php\`:

\`\`\`php
'enabled' => [
    // ... other providers
    ${className}\\${className}ServiceProvider::class,
],
\`\`\`

3. Clear the extension cache:

\`\`\`bash
php glueful extensions:cache
\`\`\`

### Composer Package (for distribution)

To convert this to a Composer package:

1. Publish to a Git repository
2. Add to Packagist or your private repository
3. Install via Composer:

\`\`\`bash
composer require your-vendor/${escapeHtml(name)}
\`\`\`

## Commands

Check extension status:

\`\`\`bash
# List all extensions
php glueful extensions:list

# Show detailed info
php glueful extensions:info ${escapeHtml(name)}

# Explain why this extension was loaded
php glueful extensions:why ${escapeHtml(className)}ServiceProvider
\`\`\`

## Usage

TODO: Add usage instructions for your extension

## Configuration

TODO: Add configuration options

## Development

This extension follows the Glueful Extensions architecture:

- **ServiceProvider**: Main entry point in \`src/${className}ServiceProvider.php\`
- **Routes**: HTTP routes in \`routes/routes.php\`
- **Services**: DI container services defined in \`services()\` method
- **Commands**: Console commands registered in \`boot()\` method

## Author

${author || 'Developer'}

## License

MIT
`;
    }

    public getAvailableExtensions(): GluefulExtension[] {
        return Object.values(this.extensionRegistry.available);
    }

    public getEnabledExtensions(): GluefulExtension[] {
        return Object.values(this.extensionRegistry.available).filter(ext => ext.enabled);
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}