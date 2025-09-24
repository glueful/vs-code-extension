
import * as vscode from 'vscode';
import { getCliParts } from '../utils/cli';
import { getWorkspaceFolder } from '../utils/workspace';
import { escapeHtml } from '../utils/webviewSecurity';

function makeTask(name: string, subcommand: string): vscode.Task {
  const def: any = { type: 'glueful', command: subcommand };

  // Get workspace folder with multi-root support
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    throw new Error('No Glueful workspace folder found');
  }

  // Use ProcessExecution for better Windows compatibility and security
  const { cmd, args } = getCliParts();
  // Tokenize subcommand into args safely (split by whitespace keeping quoted segments)
  const tokens = (subcommand.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []).map(t => t.replace(/^\"|\"$/g, ''));
  const allArgs = [...args, ...tokens];

  // Use ProcessExecution instead of ShellExecution for better security and Windows support
  const exec = new vscode.ProcessExecution(cmd, allArgs, {
    cwd: workspaceFolder.uri.fsPath
  });

  const task = new vscode.Task(def, workspaceFolder, name, 'glueful', exec);
  return task;
}

interface GluefulCommand {
  label: string;
  description: string;
  category: string;
}

const FRAMEWORK_COMMANDS: GluefulCommand[] = [
  // Migration commands
  { label: 'migrate:run', description: 'Run pending migrations', category: 'Migration' },
  { label: 'migrate:create', description: 'Create a new migration file', category: 'Migration' },
  { label: 'migrate:status', description: 'Show migration status', category: 'Migration' },
  { label: 'migrate:rollback', description: 'Rollback migrations', category: 'Migration' },

  // Development commands
  { label: 'serve', description: 'Start development server', category: 'Development' },
  { label: 'version', description: 'Show framework version', category: 'Development' },

  // Cache commands
  { label: 'cache:clear', description: 'Clear application cache', category: 'Cache' },
  { label: 'cache:status', description: 'Show cache status', category: 'Cache' },
  { label: 'cache:get', description: 'Get cache value', category: 'Cache' },
  { label: 'cache:set', description: 'Set cache value', category: 'Cache' },
  { label: 'cache:delete', description: 'Delete cache key', category: 'Cache' },
  { label: 'cache:ttl', description: 'Get cache TTL', category: 'Cache' },
  { label: 'cache:expire', description: 'Set cache expiration', category: 'Cache' },
  { label: 'cache:purge', description: 'Purge cache by pattern', category: 'Cache' },

  // Database commands
  { label: 'database:status', description: 'Show database status', category: 'Database' },
  { label: 'database:reset', description: 'Reset database', category: 'Database' },
  { label: 'database:profile', description: 'Profile database queries', category: 'Database' },

  // Code generation
  { label: 'generate:controller', description: 'Generate controller class', category: 'Generate' },
  { label: 'generate:api-definitions', description: 'Generate API definitions', category: 'Generate' },
  { label: 'generate:key', description: 'Generate application key', category: 'Generate' },

  // Extensions
  { label: 'extensions:info', description: 'Show extension information', category: 'Extensions' },
  { label: 'extensions:enable', description: 'Enable extension', category: 'Extensions' },
  { label: 'extensions:disable', description: 'Disable extension', category: 'Extensions' },
  { label: 'extensions:create', description: 'Create new extension', category: 'Extensions' },
  { label: 'extensions:list', description: 'List extensions', category: 'Extensions' },
  { label: 'extensions:summary', description: 'Show extensions summary', category: 'Extensions' },
  { label: 'extensions:cache', description: 'Cache extensions', category: 'Extensions' },
  { label: 'extensions:clear', description: 'Clear extension cache', category: 'Extensions' },
  { label: 'extensions:why', description: 'Show extension dependencies', category: 'Extensions' },

  // System
  { label: 'install', description: 'Install framework', category: 'System' },
  { label: 'system:check', description: 'Check system requirements', category: 'System' },
  { label: 'system:production', description: 'Optimize for production', category: 'System' },
  { label: 'system:memory-monitor', description: 'Monitor memory usage', category: 'System' },

  // Security
  { label: 'security:check', description: 'Security health check', category: 'Security' },
  { label: 'security:vulnerability-check', description: 'Check for vulnerabilities', category: 'Security' },
  { label: 'security:lockdown', description: 'Enable security lockdown', category: 'Security' },
  { label: 'security:reset-password', description: 'Reset user password', category: 'Security' },
  { label: 'security:report', description: 'Generate security report', category: 'Security' },
  { label: 'security:revoke-tokens', description: 'Revoke authentication tokens', category: 'Security' },
  { label: 'security:scan', description: 'Scan for security issues', category: 'Security' },

  // Notifications & Queue
  { label: 'notifications:process-retries', description: 'Process failed notifications', category: 'Queue' },
  { label: 'queue:work', description: 'Start queue worker', category: 'Queue' },
  { label: 'queue:auto-scale', description: 'Auto-scale queue workers', category: 'Queue' },
  { label: 'queue:scheduler', description: 'Start job scheduler', category: 'Queue' },

  // Archive
  { label: 'archive:manage', description: 'Manage archives', category: 'Archive' },

  // Container
  { label: 'container:debug', description: 'Debug container configuration', category: 'Container' },
  { label: 'container:compile', description: 'Compile container for production', category: 'Container' },
  { label: 'container:validate', description: 'Validate container configuration', category: 'Container' },
  { label: 'container:lazy-status', description: 'Show lazy service status', category: 'Container' },

  // Field analysis
  { label: 'fields:analyze', description: 'Analyze field usage', category: 'Fields' },
  { label: 'fields:validate', description: 'Validate field definitions', category: 'Fields' },
  { label: 'fields:performance', description: 'Analyze field performance', category: 'Fields' },
  { label: 'fields:whitelist-check', description: 'Check field whitelist', category: 'Fields' },

  // Testing
  { label: 'test', description: 'Run test suite', category: 'Testing' },
  { label: 'test:unit', description: 'Run unit tests', category: 'Testing' },
  { label: 'test:integration', description: 'Run integration tests', category: 'Testing' },
  { label: 'test:coverage', description: 'Generate test coverage report', category: 'Testing' },

  // Code quality
  { label: 'analyse', description: 'Run PHPStan analysis', category: 'Quality' },
  { label: 'format', description: 'Format code with PHP-CS-Fixer', category: 'Quality' }
];

async function runCommandWithInput(command: string): Promise<void> {
  let fullCommand = command;

  // Commands that need user input
  if (command === 'generate:controller') {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter controller name (e.g., UserController)',
      placeHolder: 'UserController'
    });
    if (!name) return;
    fullCommand = `${command} ${escapeHtml(name)}`;
  } else if (command === 'migrate:create') {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter migration name (e.g., create_users_table)',
      placeHolder: 'create_users_table'
    });
    if (!name) return;
    fullCommand = `${command} ${escapeHtml(name)}`;
  } else if (command === 'cache:get' || command === 'cache:delete') {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter cache key',
      placeHolder: 'cache.key'
    });
    if (!key) return;
    fullCommand = `${command} ${key}`;
  } else if (command === 'cache:set') {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter cache key',
      placeHolder: 'cache.key'
    });
    if (!key) return;
    const value = await vscode.window.showInputBox({
      prompt: 'Enter cache value',
      placeHolder: 'value'
    });
    if (!value) return;
    fullCommand = `${command} ${key} "${value}"`;
  }

  const task = makeTask(fullCommand, fullCommand);
  await vscode.tasks.executeTask(task);
}

export function registerGluefulTasks(ctx: vscode.ExtensionContext) {
  const provider: vscode.TaskProvider = {
    provideTasks() {
      return FRAMEWORK_COMMANDS.map(cmd => makeTask(cmd.label, cmd.label));
    },
    resolveTask(task: vscode.Task) {
      const sub = (task.definition as any)?.command;
      if (!sub) return undefined;
      return makeTask(task.name || sub, sub);
    }
  };

  ctx.subscriptions.push(vscode.tasks.registerTaskProvider('glueful', provider));

  // Enhanced command picker with categories
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.runTask', async () => {
      const items = FRAMEWORK_COMMANDS.map(cmd => ({
        label: cmd.label,
        description: cmd.description,
        detail: cmd.category
      }));

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select Glueful command to run…',
        matchOnDescription: true,
        matchOnDetail: true
      });
      if (!pick) return;

      await runCommandWithInput(pick.label);
    })
  );

  // Register all individual command handlers
  const commandMappings = [
    // Migration commands
    { command: 'glueful.migrate.run', cli: 'migrate:run' },
    { command: 'glueful.migrate.create', cli: 'migrate:create' },
    { command: 'glueful.migrate.status', cli: 'migrate:status' },
    { command: 'glueful.migrate.rollback', cli: 'migrate:rollback' },

    // Development commands
    { command: 'glueful.serve', cli: 'serve' },
    { command: 'glueful.version', cli: 'version' },

    // Cache commands
    { command: 'glueful.cache.clear', cli: 'cache:clear' },
    { command: 'glueful.cache.status', cli: 'cache:status' },
    { command: 'glueful.cache.get', cli: 'cache:get' },
    { command: 'glueful.cache.set', cli: 'cache:set' },
    { command: 'glueful.cache.delete', cli: 'cache:delete' },
    { command: 'glueful.cache.ttl', cli: 'cache:ttl' },
    { command: 'glueful.cache.expire', cli: 'cache:expire' },
    { command: 'glueful.cache.purge', cli: 'cache:purge' },

    // Database commands
    { command: 'glueful.database.status', cli: 'database:status' },
    { command: 'glueful.database.reset', cli: 'database:reset' },
    { command: 'glueful.database.profile', cli: 'database:profile' },

    // Generate commands
    { command: 'glueful.generate.controller', cli: 'generate:controller' },
    { command: 'glueful.generate.apiDefinitions', cli: 'generate:api-definitions' },
    { command: 'glueful.generate.key', cli: 'generate:key' },

    // Extensions commands
    { command: 'glueful.extensions.info', cli: 'extensions:info' },
    { command: 'glueful.extensions.enable', cli: 'extensions:enable' },
    { command: 'glueful.extensions.disable', cli: 'extensions:disable' },
    { command: 'glueful.extensions.create', cli: 'extensions:create' },
    { command: 'glueful.extensions.list', cli: 'extensions:list' },
    { command: 'glueful.extensions.summary', cli: 'extensions:summary' },
    { command: 'glueful.extensions.cache', cli: 'extensions:cache' },
    { command: 'glueful.extensions.clear', cli: 'extensions:clear' },
    { command: 'glueful.extensions.why', cli: 'extensions:why' },

    // System commands
    { command: 'glueful.install', cli: 'install' },
    { command: 'glueful.system.check', cli: 'system:check' },
    { command: 'glueful.system.production', cli: 'system:production' },
    { command: 'glueful.system.memoryMonitor', cli: 'system:memory-monitor' },

    // Security commands
    { command: 'glueful.security.check', cli: 'security:check' },
    { command: 'glueful.security.vulnerabilityCheck', cli: 'security:vulnerability-check' },
    { command: 'glueful.security.lockdown', cli: 'security:lockdown' },
    { command: 'glueful.security.resetPassword', cli: 'security:reset-password' },
    { command: 'glueful.security.report', cli: 'security:report' },
    { command: 'glueful.security.revokeTokens', cli: 'security:revoke-tokens' },
    { command: 'glueful.security.scan', cli: 'security:scan' },

    // Notifications & Queue commands
    { command: 'glueful.notifications.processRetries', cli: 'notifications:process-retries' },
    { command: 'glueful.queue.work', cli: 'queue:work' },
    { command: 'glueful.queue.autoScale', cli: 'queue:auto-scale' },
    { command: 'glueful.queue.scheduler', cli: 'queue:scheduler' },

    // Archive commands
    { command: 'glueful.archive.manage', cli: 'archive:manage' },

    // Container commands
    { command: 'glueful.container.debug', cli: 'container:debug' },
    { command: 'glueful.container.compile', cli: 'container:compile' },
    { command: 'glueful.container.validate', cli: 'container:validate' },
    { command: 'glueful.container.lazyStatus', cli: 'container:lazy-status' },

    // Field commands
    { command: 'glueful.fields.analyze', cli: 'fields:analyze' },
    { command: 'glueful.fields.validate', cli: 'fields:validate' },
    { command: 'glueful.fields.performance', cli: 'fields:performance' },
    { command: 'glueful.fields.whitelistCheck', cli: 'fields:whitelist-check' },

    // Testing commands
    { command: 'glueful.test', cli: 'test' },
    { command: 'glueful.test.unit', cli: 'test:unit' },
    { command: 'glueful.test.integration', cli: 'test:integration' },
    { command: 'glueful.test.coverage', cli: 'test:coverage' },

    // Quality commands
    { command: 'glueful.analyze', cli: 'analyse' },
    { command: 'glueful.format', cli: 'format' }
  ];

  // Register all command handlers
  commandMappings.forEach(({ command, cli }) => {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(command, () => runCommandWithInput(cli))
    );
  });
}
