
import * as vscode from 'vscode';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { debounce } from '../utils/debounce';

async function readEnvVar(name: string): Promise<string | undefined> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return;
  const envPath = path.join(ws, '.env');
  try {
    await fsp.access(envPath);
    const content = await fsp.readFile(envPath, 'utf8');
    const line = content.split('\n').find(l => l.trim().startsWith(name + '='));
    if (!line) return;
    return line.split('=')[1]?.trim();
  } catch {
    return;
  }
}

async function hasRoutesManifest(): Promise<boolean> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return false;
  const candidates = [
    'bootstrap/cache/routes.manifest.json',
    'storage/cache/routes.manifest.json',
    'var/cache/routes.manifest.json'
  ].map(p => path.join(ws, p));

  for (const candidate of candidates) {
    try {
      await fsp.access(candidate);
      return true;
    } catch {
      // File doesn't exist, try next
    }
  }
  return false;
}

export function registerStatusBar(ctx: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  item.command = 'glueful.runTask';
  ctx.subscriptions.push(item);

  const refresh = async () => {
    const env = await readEnvVar('APP_ENV') || '—';
    const debug = await readEnvVar('APP_DEBUG');
    const routes = await hasRoutesManifest() ? '✓' : '—';
    item.text = `$(rocket) Glueful: ${env}  $(repo) Routes ${routes}`;
    item.tooltip = new vscode.MarkdownString([
      `**Glueful Status**`,
      ``,
      `• APP_ENV: \`${env}\``,
      `• APP_DEBUG: \`${debug ?? '—'}\``,
      `• Routes manifest: ${routes === '✓' ? 'found' : 'missing'}`,
      ``,
      `Click to run a Glueful task.`
    ].join('\n'));
    item.show();
  };

  refresh().catch(console.error);

  const refreshDebounced = debounce(() => refresh().catch(console.error), 300);

  const watcher = vscode.workspace.createFileSystemWatcher('**/{.env,**/*routes.manifest.json}');
  watcher.onDidCreate(refreshDebounced);
  watcher.onDidChange(refreshDebounced);
  watcher.onDidDelete(refreshDebounced);
  ctx.subscriptions.push(watcher);
}
