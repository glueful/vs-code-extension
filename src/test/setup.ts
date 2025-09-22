import { vi } from 'vitest';

// Mock VS Code API
const mockVscode = {
    window: {
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        createWebviewPanel: vi.fn(),
        createStatusBarItem: vi.fn(() => ({
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
            text: '',
            tooltip: '',
            command: '',
            backgroundColor: undefined
        }))
    },
    workspace: {
        workspaceFolders: [],
        createFileSystemWatcher: vi.fn(() => ({
            onDidCreate: vi.fn(),
            onDidChange: vi.fn(),
            onDidDelete: vi.fn(),
            dispose: vi.fn()
        })),
        openTextDocument: vi.fn(),
        getConfiguration: vi.fn(() => ({
            get: vi.fn(),
            update: vi.fn()
        }))
    },
    commands: {
        registerCommand: vi.fn(),
        executeCommand: vi.fn()
    },
    languages: {
        createDiagnosticCollection: vi.fn(() => ({
            set: vi.fn(),
            clear: vi.fn(),
            dispose: vi.fn()
        }))
    },
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path, toString: () => path })),
        joinPath: vi.fn()
    },
    Range: vi.fn(),
    Diagnostic: vi.fn(),
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ViewColumn: {
        One: 1,
        Two: 2,
        Three: 3
    },
    ThemeColor: vi.fn()
};

vi.mock('vscode', () => mockVscode);

// Mock file system operations
vi.mock('fs', () => ({
    promises: {
        access: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn()
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
}));

// Mock path operations
vi.mock('path', () => ({
    join: vi.fn((...args: string[]) => args.join('/')),
    dirname: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn(),
    resolve: vi.fn()
}));

export { mockVscode };