import * as vscode from 'vscode';
import { WrappedData } from './types';
import { renderWrappedHtml } from './wrappedHtml';

let activeWrapped: WrappedData | null = null;
let currentPanel: vscode.WebviewPanel | null = null;

export function getLastActiveWrapped(): WrappedData | null {
  return activeWrapped;
}

export async function exportWrappedAsHtml(data: WrappedData): Promise<void> {
  const defaultFileName = `parallel-wrapped-${data.code || 'session'}.html`;
  const defaultUri = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultFileName)
    : vscode.Uri.file(defaultFileName);

  const saveUri = await vscode.window.showSaveDialog({
    filters: { 'HTML File': ['html'] },
    defaultUri,
  });

  if (!saveUri) {
    return;
  }

  try {
    const htmlContent = renderWrappedHtml(data, true);
    const bytes = new TextEncoder().encode(htmlContent);
    await vscode.workspace.fs.writeFile(saveUri, bytes);

    const action = await vscode.window.showInformationMessage(
      `Session Wrapped recap exported to ${saveUri.fsPath}`,
      'Open in Browser'
    );
    if (action === 'Open in Browser') {
      await vscode.env.openExternal(saveUri);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to export Session Wrapped: ${err?.message || err}`);
  }
}

export function showWrappedPanel(context: vscode.ExtensionContext, data: WrappedData): vscode.WebviewPanel {
  activeWrapped = data;

  if (currentPanel) {
    currentPanel.title = `Parallel Wrapped: ${data.code}`;
    currentPanel.webview.html = renderWrappedHtml(data, false);
    currentPanel.reveal(vscode.ViewColumn.Active);
    return currentPanel;
  }

  const panel = vscode.window.createWebviewPanel(
    'parallelWrapped',
    `Parallel Wrapped: ${data.code}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );
  currentPanel = panel;

  panel.onDidDispose(() => {
    currentPanel = null;
  }, null, context.subscriptions);

  panel.webview.html = renderWrappedHtml(data, false);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg) return;
    if (msg.command === 'openReplay') {
      vscode.commands.executeCommand('parallel.openLastReplay');
    } else if (msg.command === 'exportHtml') {
      await exportWrappedAsHtml(data);
    } else if (msg.command === 'savePng' && msg.data) {
      try {
        const defaultFileName = `parallel-wrapped-${data.code || 'session'}.png`;
        const defaultUri = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
          ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultFileName)
          : vscode.Uri.file(defaultFileName);

        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'PNG Image': ['png'] },
          defaultUri,
        });

        if (saveUri) {
          const base64Data = String(msg.data).replace(/^data:image\/png;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          await vscode.workspace.fs.writeFile(saveUri, buffer);
          const action = await vscode.window.showInformationMessage(
            `Session Wrapped card saved to ${saveUri.fsPath}`,
            'Open Image'
          );
          if (action === 'Open Image') {
            await vscode.commands.executeCommand('vscode.open', saveUri);
          }
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to save PNG: ${err?.message || err}`);
      }
    } else if (msg.command === 'pngFailed') {
      vscode.window.showWarningMessage('PNG rasterization is not supported in this webview environment. Falling back to HTML export.');
      await exportWrappedAsHtml(data);
    }
  }, undefined, context.subscriptions);

  return panel;
}
