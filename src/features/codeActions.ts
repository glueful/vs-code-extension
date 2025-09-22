
import * as vscode from 'vscode';

export function registerQuickFixes(ctx: vscode.ExtensionContext) {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(doc, range) {
      const wordRange = doc.getWordRangeAtPosition(range.start, /[A-Za-z0-9_@\\]+/);
      if (!wordRange) return;
      const word = doc.getText(wordRange);
      if (!/@[A-Za-z_][A-Za-z0-9_]*/.test(word)) return;
      const method = word.split('@')[1];
      if (!method) return;

      const action = new vscode.CodeAction(`Create method ${method}()`, vscode.CodeActionKind.QuickFix);
      action.command = {
        command: 'glueful.createMethod',
        title: 'Create Controller Method',
        arguments: [doc.uri, method]
      };
      return [action];
    }
  };

  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'php', scheme: 'file' }, provider),
    vscode.commands.registerCommand('glueful.createMethod', async (uri: vscode.Uri, method: string) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      const insertPos = findClassEndBrace(doc) ?? new vscode.Position(doc.lineCount - 1, 0);
      edit.insert(uri, insertPos, `\n\n    public function ${method}(): void\n    {\n        // TODO: implement\n    }\n`);
      await vscode.workspace.applyEdit(edit);
      await doc.save();
      vscode.window.showInformationMessage(`Method ${method}() inserted.`);
    })
  );
}

function findClassEndBrace(doc: vscode.TextDocument): vscode.Position | undefined {
  for (let i = doc.lineCount - 1; i >= 0; i--) {
    if (doc.lineAt(i).text.trim() === '}') return new vscode.Position(i, 0);
  }
}
