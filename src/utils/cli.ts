import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { getWorkspaceRootPath } from './workspace';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

export function getCliParts(): { cmd: string; args: string[] } {
  const cfg = vscode.workspace.getConfiguration('glueful');
  // Allow forms like: "php vendor/bin/glueful" or "vendor/bin/glueful"
  const raw = cfg.get<string>('cliPath') || 'php vendor/bin/glueful';

  // Handle Windows paths with spaces by properly parsing quoted strings
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const [cmd, ...rest] = parts.map(p => p.replace(/^"(.*)"$/, '$1'));

  return { cmd, args: rest };
}

export async function runCli(
  wsRoot: string,
  subArgs: string[],
  options: { timeout?: number; cwd?: string } = {}
): Promise<CliResult> {
  const { cmd, args } = getCliParts();

  // Sanitize subArgs with strict whitelist
  const safe = subArgs.filter(a => /^[\w:/\-\.,=]+$/.test(a));

  const execOptions = {
    cwd: options.cwd || wsRoot,
    timeout: options.timeout || 30000, // 30 second timeout
    maxBuffer: 1024 * 1024 // 1MB buffer
  };

  return new Promise((resolve) => {
    execFile(cmd, [...args, ...safe], execOptions, (err, stdout, stderr) => {
      const code = (err as any)?.code ?? 0;
      const result: CliResult = {
        code,
        stdout: stdout || '',
        stderr: stderr || (err?.message ?? ''),
        success: code === 0
      };

      // Always resolve, never reject - let caller handle errors
      resolve(result);
    });
  });
}

export async function runCliWithErrorHandling(
  subArgs: string[],
  options: { showErrors?: boolean; wsRoot?: string } = {}
): Promise<CliResult> {
  const wsRoot = options.wsRoot || getWorkspaceRootPath();

  if (!wsRoot) {
    const errorResult: CliResult = {
      code: -1,
      stdout: '',
      stderr: 'No workspace folder found',
      success: false
    };

    if (options.showErrors) {
      vscode.window.showErrorMessage('No Glueful workspace folder found');
    }

    return errorResult;
  }

  const result = await runCli(wsRoot, subArgs);

  // Handle CLI errors with helpful messages
  if (!result.success && options.showErrors) {
    let errorMsg = `Glueful CLI failed (exit code ${result.code})`;

    if (result.stderr) {
      // Show last few lines of stderr for context
      const stderrLines = result.stderr.split('\n').filter(l => l.trim());
      const lastErrors = stderrLines.slice(-3).join('\n');
      errorMsg += `\n\nError output:\n${lastErrors}`;
    }

    if (result.code === 127 || result.stderr.includes('not found')) {
      errorMsg += '\n\nTip: Check your glueful.cliPath setting in VS Code preferences.';
    }

    vscode.window.showErrorMessage(errorMsg, 'Open Settings').then(selection => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'glueful.cliPath');
      }
    });
  }

  return result;
}

export function sanitizeCliArgs(args: string[]): string[] {
  // Strict whitelist - only allow safe characters
  return args.filter(arg => /^[\w:/\-\.,=]+$/.test(arg));
}

export function getWorkspaceRoot(): string {
  return getWorkspaceRootPath();
}