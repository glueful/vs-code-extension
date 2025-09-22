import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface TestSuite {
  name: string;
  description: string;
  command: string;
  pattern?: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'All Tests',
    description: 'Run complete test suite',
    command: 'test'
  },
  {
    name: 'Unit Tests',
    description: 'Run unit tests only',
    command: 'test:unit',
    pattern: 'tests/Unit'
  },
  {
    name: 'Integration Tests',
    description: 'Run integration tests only',
    command: 'test:integration',
    pattern: 'tests/Integration'
  },
  {
    name: 'Coverage Report',
    description: 'Generate test coverage report',
    command: 'test:coverage'
  }
];

function cliPath(): string {
  const cfg = vscode.workspace.getConfiguration('glueful');
  return cfg.get<string>('cliPath') || 'php vendor/bin/glueful';
}

function makeTestTask(name: string, command: string, group?: vscode.TaskGroup): vscode.Task {
  const def: any = { type: 'glueful', command };
  const cmd = `${cliPath()} ${command}`;
  const exec = new vscode.ShellExecution(cmd, {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  const task = new vscode.Task(def, vscode.TaskScope.Workspace, name, 'glueful', exec, '$phpunit');

  if (group) {
    task.group = group;
  }

  return task;
}

function makePhpUnitTask(name: string, args: string = '', group?: vscode.TaskGroup): vscode.Task {
  const def: any = { type: 'phpunit', args };
  const cmd = `vendor/bin/phpunit ${args}`;
  const exec = new vscode.ShellExecution(cmd, {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  const task = new vscode.Task(def, vscode.TaskScope.Workspace, name, 'phpunit', exec, '$phpunit');

  if (group) {
    task.group = group;
  }

  return task;
}

async function findTestFiles(pattern?: string): Promise<string[]> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return [];

  const testDir = pattern ?
    path.join(workspaceFolder.uri.fsPath, pattern) :
    path.join(workspaceFolder.uri.fsPath, 'tests');

  if (!fs.existsSync(testDir)) return [];

  const findTestsRecursively = (dir: string): string[] => {
    const files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...findTestsRecursively(fullPath));
      } else if (entry.endsWith('Test.php')) {
        files.push(fullPath);
      }
    }

    return files;
  };

  return findTestsRecursively(testDir);
}

async function runSpecificTest(testFile: string): Promise<void> {
  const task = makePhpUnitTask(
    `Test: ${path.basename(testFile)}`,
    testFile,
    vscode.TaskGroup.Test
  );
  await vscode.tasks.executeTask(task);
}

async function runTestMethod(testFile: string, methodName: string): Promise<void> {
  const task = makePhpUnitTask(
    `Test: ${path.basename(testFile)}::${methodName}`,
    `${testFile} --filter ${methodName}`,
    vscode.TaskGroup.Test
  );
  await vscode.tasks.executeTask(task);
}

export function registerTestingFeatures(ctx: vscode.ExtensionContext) {
  // Task provider for Glueful tests
  const testProvider: vscode.TaskProvider = {
    provideTasks() {
      const tasks: vscode.Task[] = [];

      // Add Glueful framework test commands
      TEST_SUITES.forEach(suite => {
        tasks.push(makeTestTask(suite.name, suite.command, vscode.TaskGroup.Test));
      });

      // Add PHPUnit tasks
      tasks.push(makePhpUnitTask('PHPUnit: All Tests', '', vscode.TaskGroup.Test));
      tasks.push(makePhpUnitTask('PHPUnit: Unit Tests', 'tests/Unit', vscode.TaskGroup.Test));
      tasks.push(makePhpUnitTask('PHPUnit: Integration Tests', 'tests/Integration', vscode.TaskGroup.Test));

      return tasks;
    },
    resolveTask(task: vscode.Task) {
      const command = (task.definition as any)?.command;
      const args = (task.definition as any)?.args;

      if (task.definition.type === 'glueful' && command) {
        return makeTestTask(task.name || command, command, vscode.TaskGroup.Test);
      } else if (task.definition.type === 'phpunit') {
        return makePhpUnitTask(task.name || 'PHPUnit', args || '', vscode.TaskGroup.Test);
      }

      return undefined;
    }
  };

  ctx.subscriptions.push(vscode.tasks.registerTaskProvider('glueful-test', testProvider));

  // Test discovery and runner commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.run', async () => {
      const suiteItems = TEST_SUITES.map(suite => ({
        label: suite.name,
        description: suite.description,
        suite
      }));

      const pick = await vscode.window.showQuickPick(suiteItems, {
        placeHolder: 'Select test suite to run…'
      });

      if (!pick) return;

      const task = makeTestTask(pick.suite.name, pick.suite.command, vscode.TaskGroup.Test);
      await vscode.tasks.executeTask(task);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.file', async () => {
      const testFiles = await findTestFiles();

      if (testFiles.length === 0) {
        vscode.window.showInformationMessage('No test files found');
        return;
      }

      const fileItems = testFiles.map(file => ({
        label: path.basename(file),
        description: path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', file),
        file
      }));

      const pick = await vscode.window.showQuickPick(fileItems, {
        placeHolder: 'Select test file to run…'
      });

      if (!pick) return;

      await runSpecificTest(pick.file);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.method', async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const document = activeEditor.document;
      const filePath = document.fileName;

      if (!filePath.endsWith('Test.php')) {
        vscode.window.showErrorMessage('Current file is not a test file');
        return;
      }

      const content = document.getText();
      const methodMatches = content.matchAll(/public\s+function\s+(test\w+)\s*\(/g);
      const methods = Array.from(methodMatches, match => match[1]);

      if (methods.length === 0) {
        vscode.window.showInformationMessage('No test methods found in current file');
        return;
      }

      const methodItems = methods.map(method => ({
        label: method,
        description: 'Test method'
      }));

      const pick = await vscode.window.showQuickPick(methodItems, {
        placeHolder: 'Select test method to run…'
      });

      if (!pick) return;

      await runTestMethod(filePath, pick.label);
    })
  );

  // Code lens for test methods
  const testCodeLensProvider: vscode.CodeLensProvider = {
    provideCodeLenses(document) {
      if (!document.fileName.endsWith('Test.php')) {
        return [];
      }

      const codeLenses: vscode.CodeLens[] = [];
      const content = document.getText();
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const methodMatch = line.match(/public\s+function\s+(test\w+)\s*\(/);
        if (methodMatch) {
          const methodName = methodMatch[1];
          const range = new vscode.Range(index, 0, index, line.length);

          // Run test method
          codeLenses.push(new vscode.CodeLens(range, {
            title: '$(play) Run Test',
            command: 'glueful.test.runMethod',
            arguments: [document.fileName, methodName]
          }));

          // Debug test method
          codeLenses.push(new vscode.CodeLens(range, {
            title: '$(debug) Debug Test',
            command: 'glueful.test.debugMethod',
            arguments: [document.fileName, methodName]
          }));
        }
      });

      return codeLenses;
    }
  };

  ctx.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'php', pattern: '**/*Test.php' },
      testCodeLensProvider
    )
  );

  // Direct command handlers for code lens
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.runMethod', async (filePath: string, methodName: string) => {
      await runTestMethod(filePath, methodName);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.debugMethod', async (filePath: string, methodName: string) => {
      // Create debug configuration for the specific test method
      const debugConfig = {
        name: `Debug Test: ${methodName}`,
        type: 'php',
        request: 'launch',
        program: '${workspaceFolder}/vendor/bin/phpunit',
        args: [filePath, '--filter', methodName],
        cwd: '${workspaceFolder}',
        runtimeArgs: ['-dxdebug.start_with_request=yes'],
        env: {
          XDEBUG_MODE: 'debug,develop',
          XDEBUG_CONFIG: 'client_port=${port}'
        }
      };

      await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], debugConfig);
    })
  );

  // Test result output channels
  const testOutput = vscode.window.createOutputChannel('Glueful Tests');
  ctx.subscriptions.push(testOutput);

  // Watch for test file changes
  const testWatcher = vscode.workspace.createFileSystemWatcher('**/tests/**/*Test.php');

  testWatcher.onDidChange((uri) => {
    // Auto-run tests on file save (optional)
    const config = vscode.workspace.getConfiguration('glueful.testing');
    if (config.get('autoRunOnSave', false)) {
      runSpecificTest(uri.fsPath);
    }
  });

  ctx.subscriptions.push(testWatcher);

  // Test coverage commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.coverage', async () => {
      const task = makeTestTask('Generate Coverage Report', 'test:coverage');
      await vscode.tasks.executeTask(task);

      // Try to open coverage report if it exists
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const coverageHtml = path.join(workspaceFolder.uri.fsPath, 'coverage', 'index.html');
        if (fs.existsSync(coverageHtml)) {
          await vscode.env.openExternal(vscode.Uri.file(coverageHtml));
        }
      }
    })
  );

  // Database refresh for testing
  ctx.subscriptions.push(
    vscode.commands.registerCommand('glueful.test.refreshDatabase', async () => {
      const task = makeTestTask('Refresh Test Database', 'database:reset --env=testing');
      await vscode.tasks.executeTask(task);
    })
  );
}