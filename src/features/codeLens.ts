
import * as vscode from 'vscode';

export function registerControllerCodeLens(ctx: vscode.ExtensionContext) {
  const provider: vscode.CodeLensProvider = {
    provideCodeLenses(doc) {
      if (doc.languageId !== 'php') return [];
      const text = doc.getText();
      const lenses: vscode.CodeLens[] = [];
      const regex = /public\s+function\s+([a-zA-Z0-9_]+)\s*\(/g;
      for (const match of text.matchAll(regex)) {
        const idx = match.index ?? 0;
        const pos = doc.positionAt(idx);
        const range = new vscode.Range(pos, pos);
        const method = match[1];
        lenses.push(new vscode.CodeLens(range, {
          title: 'Glueful: Show Routes for this method',
          command: 'glueful.showRoutesForMethod',
          arguments: [doc.uri, method]
        }));
      }
      return lenses;
    }
  };

  ctx.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'php', scheme: 'file', pattern: '**/src/**/*.php' }, provider),
    vscode.commands.registerCommand('glueful.showRoutesForMethod', async (_uri: vscode.Uri, method: string) => {
      vscode.window.showInformationMessage(`(Demo) Routes for ${method}. Wire this to your manifest index.`);
    })
  );
}
