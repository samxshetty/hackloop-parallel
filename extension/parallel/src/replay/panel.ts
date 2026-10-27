import * as vscode from 'vscode';
import { ReplayData } from './types';
import { renderReplayHtml } from './viewerHtml';

export function showReplayPanel(context: vscode.ExtensionContext, data: ReplayData): void {
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
}
