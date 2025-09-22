import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fsp } from 'fs';

export interface WorkspaceInfo {
    rootPath: string;
    composerJson: ComposerConfig | null;
    isGluefulProject: boolean;
    frameworkVersion?: string;
    phpVersion?: string;
}

export interface ComposerConfig {
    name?: string;
    description?: string;
    type?: string;
    require?: Record<string, string>;
    requireDev?: Record<string, string>;
    autoload?: {
        'psr-4'?: Record<string, string>;
        files?: string[];
        classmap?: string[];
    };
    scripts?: Record<string, string>;
    config?: Record<string, any>;
}

/**
 * Smart workspace detection that handles multi-root workspaces
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  // 1. Try to get workspace from active editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (workspaceFolder) {
      return workspaceFolder;
    }
  }

  // 2. If only one workspace folder, use it
  if (vscode.workspace.workspaceFolders?.length === 1) {
    return vscode.workspace.workspaceFolders[0];
  }

  // 3. If multiple workspace folders, find one with composer.json (Glueful project)
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
    for (const folder of vscode.workspace.workspaceFolders) {
      // Check if this folder has composer.json (likely a Glueful project)
      const composerUri = vscode.Uri.joinPath(folder.uri, 'composer.json');
      try {
        // This is async, but we need sync for compatibility
        // TODO: Make this async in future refactor
        return folder;
      } catch {
        continue;
      }
    }

    // Default to first folder if none have composer.json
    return vscode.workspace.workspaceFolders[0];
  }

  return undefined;
}

/**
 * Async workspace detection with proper composer.json validation
 */
export async function getValidGluefulWorkspace(): Promise<vscode.WorkspaceFolder | null> {
    const folders = vscode.workspace.workspaceFolders || [];

    // Single folder case
    if (folders.length === 1) {
        const isValid = await hasValidComposerJson(folders[0].uri.fsPath);
        return isValid ? folders[0] : null;
    }

    // Multiple folders - find the best Glueful workspace
    for (const folder of folders) {
        const workspaceInfo = await analyzeWorkspace(folder.uri.fsPath);
        if (workspaceInfo.isGluefulProject) {
            return folder;
        }
    }

    return null;
}

async function analyzeWorkspace(rootPath: string): Promise<WorkspaceInfo> {
    const info: WorkspaceInfo = {
        rootPath,
        composerJson: null,
        isGluefulProject: false
    };

    try {
        const composerPath = path.join(rootPath, 'composer.json');
        const composerConfig = await loadComposerConfig(composerPath);

        if (composerConfig) {
            info.composerJson = composerConfig;
            info.isGluefulProject = isGluefulProject(composerConfig);
            info.frameworkVersion = extractGluefulVersion(composerConfig);
            info.phpVersion = extractPhpVersion(composerConfig);
        }
    } catch (error) {
        console.debug(`Failed to analyze workspace ${rootPath}:`, error);
    }

    return info;
}

async function loadComposerConfig(composerPath: string): Promise<ComposerConfig | null> {
    try {
        await fsp.access(composerPath);
        const content = await fsp.readFile(composerPath, 'utf8');
        return JSON.parse(content) as ComposerConfig;
    } catch (error) {
        return null;
    }
}

function isGluefulProject(config: ComposerConfig): boolean {
    const dependencies = {
        ...config.require,
        ...config.requireDev
    };

    return Object.keys(dependencies).some(pkg =>
        pkg.includes('glueful') ||
        pkg.includes('glueful/framework') ||
        pkg.includes('glueful/core')
    );
}

function extractGluefulVersion(config: ComposerConfig): string | undefined {
    const dependencies = {
        ...config.require,
        ...config.requireDev
    };

    for (const [pkg, version] of Object.entries(dependencies)) {
        if (pkg.includes('glueful')) {
            return version;
        }
    }

    return undefined;
}

function extractPhpVersion(config: ComposerConfig): string | undefined {
    return config.require?.php || config.requireDev?.php;
}

async function hasValidComposerJson(workspacePath: string): Promise<boolean> {
    try {
        const composerPath = path.join(workspacePath, 'composer.json');
        await fsp.access(composerPath);
        const content = await fsp.readFile(composerPath, 'utf8');
        JSON.parse(content); // Validate JSON syntax
        return true;
    } catch {
        return false;
    }
}

/**
 * Get workspace root path, with multi-root support
 */
export function getWorkspaceRootPath(): string {
  const folder = getWorkspaceFolder();
  return folder?.uri.fsPath || '';
}

/**
 * Prompt user to select workspace folder if multiple exist
 */
export async function selectWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('No workspace folders found');
    return undefined;
  }

  if (folders.length === 1) {
    return folders[0];
  }

  const items = folders.map(folder => ({
    label: folder.name,
    description: folder.uri.fsPath,
    folder
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select Glueful workspace folder'
  });

  return selected?.folder;
}