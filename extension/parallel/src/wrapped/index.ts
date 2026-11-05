import * as vscode from 'vscode';
import { WrappedData } from './types';
import { renderWrappedHtml } from './wrappedHtml';

let activeWrapped: WrappedData | null = null;
let currentPanel: vscode.WebviewPanel | null = null;

export function getLastActiveWrapped(): WrappedData | null {
  return activeWrapped;
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

  panel.webview.onDidReceiveMessage((msg) => {
    if (!msg) return;
    if (msg.command === 'openReplay') {
      vscode.commands.executeCommand('parallel.openLastReplay');
    } else if (msg.command === 'exportHtml') {
      vscode.commands.executeCommand('parallel.exportWrappedHtml', data);
    }
  }, undefined, context.subscriptions);

  return panel;
}
