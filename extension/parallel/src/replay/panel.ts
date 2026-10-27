import * as vscode from 'vscode';
import { ReplayData } from './types';
import { renderReplayHtml } from './viewerHtml';

let activeReplay: ReplayData | null = null;

export function getLastActiveReplay(): ReplayData | null {
  return activeReplay;
}

export function showReplayPanel(context: vscode.ExtensionContext, data: ReplayData): void {
  activeReplay = data;

  const panel = vscode.window.createWebviewPanel(
    'parallelReplay',
    `Replay: ${data.code} (${data.id})`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = renderReplayHtml(data, false);

  panel.webview.onDidReceiveMessage((msg) => {
    if (msg?.command === 'exportHtml') {
      vscode.commands.executeCommand('parallel.exportReplayHtml', data);
    }
  }, undefined, context.subscriptions);
}

