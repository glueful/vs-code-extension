import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SecureWebviewManager, escapeHtml } from '../utils/webviewSecurity';

interface DocumentationEntry {
    title: string;
    path: string;
    url?: string;
    type: 'guide' | 'reference' | 'tutorial' | 'cookbook';
    tags: string[];
    description: string;
    lastModified: Date;
}

interface CodeContext {
    type: 'class' | 'method' | 'interface' | 'trait';
    name: string;
    namespace?: string;
    file: string;
    line: number;
}

/**
 * Documentation Integration Feature
 *
 * Provides integrated documentation support for Glueful framework:
 * - Context-aware help system
 * - Framework cookbook integration
 * - API documentation lookup
 * - Interactive tutorials
 * - Code examples and snippets
 * - Real-time documentation search
 */
export class DocumentationIntegrationProvider {
    private documentationIndex: DocumentationEntry[] = [];
    private workspaceRoot: string;
    private frameworkDocsPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        // Look for framework docs in vendor directory (composer installation)
        this.frameworkDocsPath = path.join(this.workspaceRoot, 'vendor', 'glueful', 'framework', 'docs');

        this.initialize();
    }

    private async initialize(): Promise<void> {
        // Build documentation index (online + local)
        await this.buildDocumentationIndex();

        // Register hover providers for contextual help
        this.registerHoverProviders();

        // Register commands
        this.registerCommands();

        // Watch for local documentation changes (if any)
        this.setupDocumentationWatcher();
    }

    private async buildDocumentationIndex(): Promise<void> {
        this.documentationIndex = [];

        // Add online documentation entries
        await this.addOnlineDocumentation();

        // Check for local documentation (fallback)
        const docPaths = [
            // Primary: Composer vendor directory
            path.join(this.workspaceRoot, 'vendor', 'glueful', 'framework', 'docs'),
            path.join(this.workspaceRoot, 'vendor', 'glueful', 'framework', 'docs', 'cookbook'),

            // Secondary: Project docs
            path.join(this.workspaceRoot, 'docs'),

            // Legacy/Development paths
            this.frameworkDocsPath
        ];

        for (const docPath of docPaths) {
            if (fs.existsSync(docPath)) {
                await this.indexDocumentationDirectory(docPath);
            }
        }
    }

    private async addOnlineDocumentation(): Promise<void> {
        // Glueful Framework Online Documentation - matching actual files
        const onlineDocs: DocumentationEntry[] = [
            // Getting Started & Setup
            {
                title: 'Getting Started',
                path: 'getting-started',
                url: 'https://glueful.com/docs/getting-started',
                type: 'guide',
                tags: ['setup', 'installation', 'quickstart'],
                description: 'Quick start guide for Glueful framework',
                lastModified: new Date()
            },
            {
                title: 'Setup and Installation',
                path: '00-setup',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/00-setup.md',
                type: 'cookbook',
                tags: ['setup', 'installation', 'composer', 'requirements'],
                description: 'Complete setup and installation guide',
                lastModified: new Date()
            },

            // Core Framework
            {
                title: 'Routing',
                path: '01-routing',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/01-routing.md',
                type: 'cookbook',
                tags: ['routing', 'routes', 'middleware', 'attributes', 'http'],
                description: 'Complete guide to routing in Glueful',
                lastModified: new Date()
            },
            {
                title: 'Middleware',
                path: '02-middleware',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/02-middleware.md',
                type: 'cookbook',
                tags: ['middleware', 'http', 'psr15', 'request', 'response', 'pipeline'],
                description: 'Middleware development and PSR-15 integration',
                lastModified: new Date()
            },
            {
                title: 'Dependency Injection & Services',
                path: '03-di-and-services',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/03-di-and-services.md',
                type: 'cookbook',
                tags: ['di', 'dependency injection', 'services', 'container', 'providers', 'psr11'],
                description: 'Service container and dependency injection guide',
                lastModified: new Date()
            },
            {
                title: 'Error Handling',
                path: '04-error-handling',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/04-error-handling.md',
                type: 'cookbook',
                tags: ['error', 'exception', 'handling', 'debug', 'logging'],
                description: 'Comprehensive error handling and debugging',
                lastModified: new Date()
            },
            {
                title: 'Testing',
                path: '05-testing',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/05-testing.md',
                type: 'cookbook',
                tags: ['testing', 'phpunit', 'mocking', 'integration', 'tdd'],
                description: 'Testing strategies and implementation',
                lastModified: new Date()
            },
            {
                title: 'Deployment',
                path: '06-deployment',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/06-deployment.md',
                type: 'cookbook',
                tags: ['deployment', 'production', 'server', 'configuration', 'optimization'],
                description: 'Production deployment and configuration',
                lastModified: new Date()
            },

            // Data & Infrastructure
            {
                title: 'Logging',
                path: '07-logging',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/07-logging.md',
                type: 'cookbook',
                tags: ['logging', 'monolog', 'debug', 'psr3', 'monitoring'],
                description: 'Logging configuration and best practices',
                lastModified: new Date()
            },
            {
                title: 'Caching',
                path: '08-caching',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/08-caching.md',
                type: 'cookbook',
                tags: ['cache', 'redis', 'performance', 'optimization', 'psr6'],
                description: 'Caching strategies and implementation',
                lastModified: new Date()
            },
            {
                title: 'Queues and Jobs',
                path: '09-queues-and-jobs',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/09-queues-and-jobs.md',
                type: 'cookbook',
                tags: ['queue', 'jobs', 'background', 'async', 'processing', 'workers'],
                description: 'Background job processing and queue management',
                lastModified: new Date()
            },
            {
                title: 'Validation',
                path: '10-validation',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/10-validation.md',
                type: 'cookbook',
                tags: ['validation', 'forms', 'input', 'sanitization', 'rules'],
                description: 'Data validation and sanitization',
                lastModified: new Date()
            },
            {
                title: 'Database',
                path: '11-database',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/11-database.md',
                type: 'cookbook',
                tags: ['database', 'query', 'builder', 'migrations', 'sql', 'orm'],
                description: 'Database operations, query builder, and migrations',
                lastModified: new Date()
            },

            // Security & Auth
            {
                title: 'Security',
                path: '12-security',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/12-security.md',
                type: 'cookbook',
                tags: ['security', 'authentication', 'authorization', 'csrf', 'xss', 'protection'],
                description: 'Security best practices and protection measures',
                lastModified: new Date()
            },

            // Event System
            {
                title: 'Events',
                path: '13-events',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/13-events.md',
                type: 'cookbook',
                tags: ['events', 'listeners', 'dispatch', 'async', 'observers'],
                description: 'Event system and listener architecture',
                lastModified: new Date()
            },

            // CLI & Extensions
            {
                title: 'Console Commands',
                path: '14-console-commands',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/14-console-commands.md',
                type: 'cookbook',
                tags: ['cli', 'commands', 'console', 'glueful', 'terminal'],
                description: 'Creating and managing Glueful console commands',
                lastModified: new Date()
            },
            {
                title: 'Extensions',
                path: '15-extensions',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/15-extensions.md',
                type: 'cookbook',
                tags: ['extensions', 'plugins', 'packages', 'modules', 'providers'],
                description: 'Building and managing framework extensions',
                lastModified: new Date()
            },

            // Advanced Features
            {
                title: 'Image Processing',
                path: '16-image-processing',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/16-image-processing.md',
                type: 'cookbook',
                tags: ['image', 'processing', 'upload', 'resize', 'manipulation'],
                description: 'Image upload and processing capabilities',
                lastModified: new Date()
            },
            {
                title: 'Distributed Locks',
                path: '17-distributed-locks',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/17-distributed-locks.md',
                type: 'cookbook',
                tags: ['locks', 'distributed', 'concurrency', 'redis', 'synchronization'],
                description: 'Distributed locking mechanisms',
                lastModified: new Date()
            },
            {
                title: 'Notifications',
                path: '18-notifications',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/18-notifications.md',
                type: 'cookbook',
                tags: ['notifications', 'email', 'sms', 'push', 'channels'],
                description: 'Multi-channel notification system',
                lastModified: new Date()
            },
            {
                title: 'Configuration',
                path: '19-configuration',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/19-configuration.md',
                type: 'cookbook',
                tags: ['configuration', 'config', 'environment', 'settings', 'env'],
                description: 'Configuration management and environment settings',
                lastModified: new Date()
            },

            // Analytics & Monitoring
            {
                title: 'Sessions & Analytics',
                path: '20-sessions-analytics',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/20-sessions-analytics.md',
                type: 'cookbook',
                tags: ['sessions', 'analytics', 'tracking', 'metrics', 'reporting'],
                description: 'Session management and analytics tracking',
                lastModified: new Date()
            },
            {
                title: 'API Metrics',
                path: '21-api-metrics',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/21-api-metrics.md',
                type: 'cookbook',
                tags: ['api', 'metrics', 'monitoring', 'performance', 'tracking'],
                description: 'API performance metrics and monitoring',
                lastModified: new Date()
            },
            {
                title: 'Performance',
                path: '22-performance',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/22-performance.md',
                type: 'cookbook',
                tags: ['performance', 'optimization', 'profiling', 'monitoring', 'speed'],
                description: 'Performance optimization and profiling techniques',
                lastModified: new Date()
            },

            // File Handling
            {
                title: 'File Uploads',
                path: '23-file-uploads',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/23-file-uploads.md',
                type: 'cookbook',
                tags: ['file', 'upload', 'validation', 'storage', 'handling'],
                description: 'File upload handling and validation',
                lastModified: new Date()
            },
            {
                title: 'Storage',
                path: '24-storage',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/24-storage.md',
                type: 'cookbook',
                tags: ['storage', 'filesystem', 'cloud', 's3', 'files'],
                description: 'File storage systems and cloud integration',
                lastModified: new Date()
            },

            // Permissions
            {
                title: 'Permissions and Authorization',
                path: '25-permissions-and-authorization',
                url: 'https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/25-permissions-and-authorization.md',
                type: 'cookbook',
                tags: ['permissions', 'authorization', 'rbac', 'policies', 'gate', 'access'],
                description: 'Advanced permission system with Gate and policies',
                lastModified: new Date()
            }
        ];

        this.documentationIndex.push(...onlineDocs);
    }

    private async indexDocumentationDirectory(basePath: string): Promise<void> {
        const files = await this.findMarkdownFiles(basePath);

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const entry = this.parseDocumentationFile(file, content, basePath);
                if (entry) {
                    this.documentationIndex.push(entry);
                }
            } catch (error) {
                console.error(`Failed to index documentation file ${file}:`, error);
            }
        }
    }

    private async findMarkdownFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        const scan = (currentDir: string) => {
            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scan(fullPath);
                } else if (item.endsWith('.md')) {
                    files.push(fullPath);
                }
            }
        };

        try {
            scan(dir);
        } catch (error) {
            console.error(`Failed to scan directory ${dir}:`, error);
        }

        return files;
    }

    private parseDocumentationFile(filePath: string, content: string, basePath: string): DocumentationEntry | null {
        const relativePath = path.relative(basePath, filePath);

        // Extract title from first # heading
        const titleMatch = content.match(/^#\\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

        // Determine type based on path
        let type: 'guide' | 'reference' | 'tutorial' | 'cookbook' = 'guide';
        if (relativePath.includes('cookbook')) type = 'cookbook';
        else if (relativePath.includes('tutorial')) type = 'tutorial';
        else if (relativePath.includes('reference') || relativePath.includes('api')) type = 'reference';

        // Extract tags from content
        const tags = this.extractTags(content, relativePath);

        // Extract description
        const description = this.extractDescription(content);

        // Get file stats
        const stats = fs.statSync(filePath);

        // Check if this is from vendor and try to map to online URL
        let url: string | undefined;
        if (filePath.includes('vendor/glueful/framework/docs')) {
            const fileName = path.basename(filePath);
            if (filePath.includes('cookbook')) {
                // Map to GitHub cookbook URL
                url = `https://github.com/glueful/framework/blob/v1.0.0/docs/cookbook/${fileName}`;
            } else {
                // Map to GitHub docs URL
                url = `https://github.com/glueful/framework/blob/v1.0.0/docs/${fileName}`;
            }
        }

        return {
            title,
            path: filePath,
            url,
            type,
            tags,
            description,
            lastModified: stats.mtime
        };
    }

    private extractTags(content: string, filePath: string): string[] {
        const tags: string[] = [];

        // Extract from file path
        const pathSegments = filePath.split(path.sep);
        tags.push(...pathSegments.filter(seg => seg !== '..' && seg !== 'docs' && !seg.endsWith('.md')));

        // Extract from content headers
        const headers = content.match(/^#{2,6}\\s+(.+)$/gm) || [];
        for (const header of headers) {
            const text = header.replace(/^#+\\s+/, '').toLowerCase();
            if (text.length > 2 && text.length < 20) {
                tags.push(text);
            }
        }

        // Extract code keywords
        const codeBlocks = content.match(/```php([\\s\\S]*?)```/g) || [];
        for (const block of codeBlocks) {
            const phpKeywords = block.match(/\\b(class|interface|trait|function|method)\\s+(\\w+)/g) || [];
            for (const keyword of phpKeywords) {
                const match = keyword.match(/\\w+\\s+(\\w+)/);
                if (match) {
                    tags.push(match[1].toLowerCase());
                }
            }
        }

        return [...new Set(tags)]; // Remove duplicates
    }

    private extractDescription(content: string): string {
        // Get first paragraph after title
        const lines = content.split('\\n');
        let inContent = false;

        for (const line of lines) {
            if (line.startsWith('#')) {
                inContent = true;
                continue;
            }

            if (inContent && line.trim() && !line.startsWith('#')) {
                return line.trim().substring(0, 200);
            }
        }

        return '';
    }

    private registerHoverProviders(): void {
        // PHP hover provider for Glueful classes
        const phpHoverProvider = vscode.languages.registerHoverProvider('php', {
            provideHover: (document, position) => this.providePhpHover(document, position)
        });

        this.context.subscriptions.push(phpHoverProvider);
    }

    private async providePhpHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;

        const word = document.getText(wordRange);

        // Check if it's a Glueful class or method
        const context = this.getCodeContext(document, position, word);
        if (!context) return null;

        const documentation = await this.findRelevantDocumentation(context);
        if (!documentation.length) return null;

        const markdownContent = this.formatHoverDocumentation(documentation, context);
        return new vscode.Hover(markdownContent);
    }

    private getCodeContext(document: vscode.TextDocument, position: vscode.Position, word: string): CodeContext | null {
        const lineText = document.lineAt(position.line).text;

        // Check for class usage
        if (lineText.includes('new ' + word) || lineText.includes('::class') || lineText.includes('extends ' + word)) {
            return {
                type: 'class',
                name: word,
                file: document.fileName,
                line: position.line + 1
            };
        }

        // Check for method calls
        if (lineText.includes('->' + word) || lineText.includes('::' + word)) {
            return {
                type: 'method',
                name: word,
                file: document.fileName,
                line: position.line + 1
            };
        }

        // Check if it's a Glueful namespace
        if (word.startsWith('Glueful\\\\') || lineText.includes('use Glueful\\\\')) {
            return {
                type: 'class',
                name: word,
                namespace: 'Glueful',
                file: document.fileName,
                line: position.line + 1
            };
        }

        return null;
    }

    private async findRelevantDocumentation(context: CodeContext): Promise<DocumentationEntry[]> {
        const relevantDocs: DocumentationEntry[] = [];

        for (const doc of this.documentationIndex) {
            const score = this.calculateRelevanceScore(doc, context);
            if (score > 0.3) {
                relevantDocs.push(doc);
            }
        }

        return relevantDocs.sort((a, b) =>
            this.calculateRelevanceScore(b, context) - this.calculateRelevanceScore(a, context)
        ).slice(0, 3);
    }

    private calculateRelevanceScore(doc: DocumentationEntry, context: CodeContext): number {
        let score = 0;

        // Exact name match
        if (doc.tags.includes(context.name.toLowerCase())) {
            score += 1.0;
        }

        // Partial name match
        if (doc.title.toLowerCase().includes(context.name.toLowerCase())) {
            score += 0.7;
        }

        // Context type match
        if (doc.tags.includes(context.type)) {
            score += 0.5;
        }

        // Namespace match
        if (context.namespace && doc.tags.includes(context.namespace.toLowerCase())) {
            score += 0.3;
        }

        return score;
    }

    private formatHoverDocumentation(docs: DocumentationEntry[], context: CodeContext): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        markdown.appendMarkdown(`### ${context.name} Documentation\\n\\n`);

        for (const doc of docs.slice(0, 2)) {
            if (doc.url) {
                // Link to online documentation
                markdown.appendMarkdown(`**[${doc.title}](${doc.url})**\\n`);
            } else {
                // Link to local file
                markdown.appendMarkdown(`**[${doc.title}](${vscode.Uri.file(doc.path)})**\\n`);
            }

            if (doc.description) {
                markdown.appendMarkdown(`${doc.description}\\n\\n`);
            }
        }

        if (docs.length > 2) {
            markdown.appendMarkdown(`[View all ${docs.length} related documents...](command:glueful.docs.search?${encodeURIComponent(context.name)})\\n`);
        }

        return markdown;
    }

    private registerCommands(): void {
        const commands = [
            vscode.commands.registerCommand('glueful.docs.search', (query?: string) => this.searchDocumentation(query)),
            vscode.commands.registerCommand('glueful.docs.browse', () => this.browseDocumentation()),
            vscode.commands.registerCommand('glueful.docs.cookbook', () => this.showCookbook()),
            vscode.commands.registerCommand('glueful.docs.tutorials', () => this.showTutorials()),
            vscode.commands.registerCommand('glueful.docs.quickHelp', () => this.showQuickHelp()),
            vscode.commands.registerCommand('glueful.docs.contextHelp', () => this.showContextualHelp()),
            vscode.commands.registerCommand('glueful.docs.refresh', () => this.refreshDocumentation())
        ];

        this.context.subscriptions.push(...commands);
    }

    private async searchDocumentation(query?: string): Promise<void> {
        if (!query) {
            query = await vscode.window.showInputBox({
                prompt: 'Search Glueful documentation',
                placeHolder: 'Enter search terms...'
            });
        }

        if (!query) return;

        const results = this.documentationIndex.filter(doc =>
            doc.title.toLowerCase().includes(query!.toLowerCase()) ||
            doc.description.toLowerCase().includes(query!.toLowerCase()) ||
            doc.tags.some(tag => tag.includes(query!.toLowerCase()))
        );

        if (results.length === 0) {
            vscode.window.showInformationMessage(`No documentation found for "${query}"`);
            return;
        }

        const items = results.map(doc => ({
            label: doc.title,
            description: doc.type,
            detail: doc.description,
            doc
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${results.length} results for "${query}"`
        });

        if (selected) {
            await this.openDocumentation(selected.doc);
        }
    }

    private async browseDocumentation(): Promise<void> {
        const categories = {
            'All Documentation': this.documentationIndex,
            'Guides': this.documentationIndex.filter(d => d.type === 'guide'),
            'Cookbook': this.documentationIndex.filter(d => d.type === 'cookbook'),
            'Tutorials': this.documentationIndex.filter(d => d.type === 'tutorial'),
            'Reference': this.documentationIndex.filter(d => d.type === 'reference')
        };

        const categoryItems = Object.entries(categories).map(([name, docs]) => ({
            label: name,
            description: `${docs.length} documents`,
            docs
        }));

        const selectedCategory = await vscode.window.showQuickPick(categoryItems, {
            placeHolder: 'Browse documentation by category'
        });

        if (!selectedCategory) return;

        const docItems = selectedCategory.docs.map(doc => ({
            label: doc.title,
            description: doc.type,
            detail: doc.description,
            doc
        }));

        const selectedDoc = await vscode.window.showQuickPick(docItems, {
            placeHolder: `Select from ${selectedCategory.label}`
        });

        if (selectedDoc) {
            await this.openDocumentation(selectedDoc.doc);
        }
    }

    private async showCookbook(): Promise<void> {
        const cookbookDocs = this.documentationIndex.filter(d => d.type === 'cookbook');

        if (cookbookDocs.length === 0) {
            vscode.window.showInformationMessage('No cookbook entries found');
            return;
        }

        const manager = SecureWebviewManager.getInstance();
        const content = this.generateCookbookContent(cookbookDocs);

        manager.createSecureWebview({
            viewType: 'gluefulCookbook',
            title: 'Glueful Cookbook',
            showOptions: vscode.ViewColumn.Two,
            handlers: {
                'openDoc': async (payload) => {
                    const { path: docPath, isUrl } = payload;
                    if (isUrl) {
                        vscode.env.openExternal(vscode.Uri.parse(docPath));
                    } else {
                        const uri = vscode.Uri.file(docPath);
                        await vscode.window.showTextDocument(uri);
                    }
                }
            }
        }, content, this.context);
    }

    private generateCookbookContent(docs: DocumentationEntry[]): string {
        return `
            <div class="container">
                <h1>Glueful Framework Cookbook</h1>
                <p>Practical examples and recipes for common development tasks</p>

                <div class="grid">
                    ${docs.map(doc => `
                        <div class="card cookbook-item"
                             style="cursor: pointer;"
                             data-action="openDoc"
                             data-path="${escapeHtml(doc.url || doc.path)}"
                             data-is-url="${!!doc.url}">
                            <div class="cookbook-title">
                                <h3>${escapeHtml(doc.title)}</h3>
                            </div>
                            <div class="cookbook-description">
                                <p>${escapeHtml(doc.description)}</p>
                            </div>
                            <div class="cookbook-tags">
                                ${doc.tags.slice(0, 5).map(tag =>
                                    `<span class="btn btn-secondary" style="margin: 2px; padding: 4px 8px; font-size: 0.8em;">${escapeHtml(tag)}</span>`
                                ).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${docs.length === 0 ? `
                    <div class="card text-center">
                        <h3>No Documentation Found</h3>
                        <p>No cookbook entries are available at this time.</p>
                    </div>
                ` : ''}

                <div class="card">
                    <h3>Security Note</h3>
                    <p class="status-good">
                        ✅ All content is properly sanitized to prevent XSS attacks.
                    </p>
                </div>
            </div>
        `;
    }

    private async showTutorials(): Promise<void> {
        const tutorials = this.documentationIndex.filter(d => d.type === 'tutorial');

        const items = tutorials.map(tutorial => ({
            label: tutorial.title,
            description: 'Tutorial',
            detail: tutorial.description,
            tutorial
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a tutorial to start'
        });

        if (selected) {
            await this.openDocumentation(selected.tutorial);
        }
    }

    private async showQuickHelp(): Promise<void> {
        const helpItems = [
            {
                label: '$(book) Browse Documentation',
                description: 'Browse all available documentation',
                command: 'glueful.docs.browse'
            },
            {
                label: '$(search) Search Documentation',
                description: 'Search through documentation',
                command: 'glueful.docs.search'
            },
            {
                label: '$(mortar-board) View Tutorials',
                description: 'Step-by-step learning guides',
                command: 'glueful.docs.tutorials'
            },
            {
                label: '$(book) Cookbook Recipes',
                description: 'Practical examples and patterns',
                command: 'glueful.docs.cookbook'
            },
            {
                label: '$(question) Context Help',
                description: 'Get help for current code context',
                command: 'glueful.docs.contextHelp'
            }
        ];

        const selected = await vscode.window.showQuickPick(helpItems, {
            placeHolder: 'Choose help option'
        });

        if (selected) {
            vscode.commands.executeCommand(selected.command);
        }
    }

    private async showContextualHelp(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor');
            return;
        }

        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position);

        if (!wordRange) {
            vscode.window.showInformationMessage('No word at cursor position');
            return;
        }

        const word = editor.document.getText(wordRange);
        await this.searchDocumentation(word);
    }

    private async openDocumentation(doc: DocumentationEntry): Promise<void> {
        try {
            if (doc.url) {
                // Open online documentation in browser
                await vscode.env.openExternal(vscode.Uri.parse(doc.url));
            } else {
                // Open local documentation file
                const document = await vscode.workspace.openTextDocument(doc.path);
                await vscode.window.showTextDocument(document, vscode.ViewColumn.Two);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open documentation: ${error}`);
        }
    }

    private setupDocumentationWatcher(): void {
        // Watch vendor/glueful/framework/docs for documentation changes
        const vendorDocsPath = path.join(this.workspaceRoot, 'vendor', 'glueful', 'framework', 'docs');

        // Only set up watcher if the vendor docs exist
        if (fs.existsSync(vendorDocsPath)) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vendorDocsPath, '**/*.md')
            );

            watcher.onDidChange(() => this.refreshDocumentation());
            watcher.onDidCreate(() => this.refreshDocumentation());
            watcher.onDidDelete(() => this.refreshDocumentation());

            this.context.subscriptions.push(watcher);
        }

        // Also watch project docs if they exist
        const projectDocsPath = path.join(this.workspaceRoot, 'docs');
        if (fs.existsSync(projectDocsPath)) {
            const projectWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(projectDocsPath, '**/*.md')
            );

            projectWatcher.onDidChange(() => this.refreshDocumentation());
            projectWatcher.onDidCreate(() => this.refreshDocumentation());
            projectWatcher.onDidDelete(() => this.refreshDocumentation());

            this.context.subscriptions.push(projectWatcher);
        }
    }

    private async refreshDocumentation(): Promise<void> {
        await this.buildDocumentationIndex();
        vscode.window.showInformationMessage(`Documentation index refreshed (${this.documentationIndex.length} documents)`);
    }

    // Public API
    public getDocumentationIndex(): DocumentationEntry[] {
        return this.documentationIndex;
    }

    public async findDocumentationFor(query: string): Promise<DocumentationEntry[]> {
        return this.documentationIndex.filter(doc =>
            doc.title.toLowerCase().includes(query.toLowerCase()) ||
            doc.tags.some(tag => tag.includes(query.toLowerCase()))
        );
    }

    public async getContextualHelp(codeContext: CodeContext): Promise<DocumentationEntry[]> {
        return this.findRelevantDocumentation(codeContext);
    }
}