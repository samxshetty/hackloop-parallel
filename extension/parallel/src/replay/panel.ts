import * as vscode from 'vscode';
import { ReplayData } from './types';

export function showReplayPanel(context: vscode.ExtensionContext, data: ReplayData): void {
  const panel = vscode.window.createWebviewPanel(
    'parallelReplay',
    `Replay: ${data.code} (${data.id})`,
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );
  panel.webview.html = `<!DOCTYPE html><html><body><h3>Replay ${data.id}</h3></body></html>`;
}
