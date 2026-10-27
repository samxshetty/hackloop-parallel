import * as vscode from 'vscode';
import { onMessage, send } from '../connection';
import { ReplayData } from './types';
import { showReplayPanel } from './panel';

let lastReplayId: string | null = null;
let extContext: vscode.ExtensionContext | null = null;

export function validateReplay(data: any): data is ReplayData {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (data.v !== 1) {
    return false;
  }
  if (typeof data.id !== 'string' || !data.id) {
    return false;
  }
  if (typeof data.code !== 'string') {
    return false;
  }
  if (typeof data.startedAt !== 'number') {
    return false;
  }
  if (!Array.isArray(data.participants)) {
    return false;
  }
  if (!Array.isArray(data.events)) {
    return false;
  }
  if (!Array.isArray(data.snapshots)) {
    return false;
  }
  return true;
}

export function requestReplay(id: string): void {
  send({ t: 'replay_get', id });
}

export function parseReplayFromHtml(html: string): ReplayData | null {
  try {
    const match = html.match(/<script\s+id=["']replay-data["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i);
    if (!match || !match[1]) {
      return null;
    }
    const jsonStr = match[1].trim();
    const parsed = JSON.parse(jsonStr);
    return validateReplay(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function registerReplayLoader(context: vscode.ExtensionContext): void {
  extContext = context;

  // On replay_ready: remember the id and offer to open
  onMessage('replay_ready', async (msg: any) => {
    if (msg && typeof msg.id === 'string') {
      lastReplayId = msg.id;
      const pick = await vscode.window.showInformationMessage('Session ended. Open replay?', 'Open Replay');
      if (pick === 'Open Replay') {
        requestReplay(msg.id);
      }
    }
  });

  // On summary: display session summary card notification
  onMessage('summary', (msg: any) => {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    const durationSec = Math.round((msg.duration || 0) / 1000);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationStr = `${mins}m ${secs}s`;
    const participantsStr = Array.isArray(msg.participants) && msg.participants.length > 0
      ? msg.participants.join(', ')
      : 'None';
    vscode.window.showInformationMessage(
      `Session Summary: Duration ${durationStr} · ${msg.edits || 0} edits · Suggestions: ${msg.accepted || 0} accepted, ${msg.rejected || 0} rejected (${msg.suggested || 0} total) · Participants: ${participantsStr}`
    );
  });

  // On replay: validate shape (v === 1) and open viewer
  onMessage('replay', (msg: any) => {
    if (validateReplay(msg?.data)) {
      if (extContext) {
        showReplayPanel(extContext, msg.data);
      }
    } else {
      vscode.window.showErrorMessage('Invalid replay data received (expected version 1).');
    }
  });

  // Command: Open Last Replay
  const openLast = vscode.commands.registerCommand('parallel.openLastReplay', () => {
    if (!lastReplayId) {
      vscode.window.showWarningMessage('No recent replay available in this session.');
      return;
    }
    requestReplay(lastReplayId);
  });

  // Command: Open Replay File
  const openFile = vscode.commands.registerCommand('parallel.openReplayFile', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        'Replays (*.json, *.html)': ['json', 'html'],
      },
      openLabel: 'Open Replay',
    });

    if (!uris || uris.length === 0) {
      return;
    }
    const fileUri = uris[0];

    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const content = new TextDecoder('utf-8').decode(bytes);

      let replayData: ReplayData | null = null;
      if (fileUri.path.endsWith('.html')) {
        replayData = parseReplayFromHtml(content);
      } else {
        const parsed = JSON.parse(content);
        if (validateReplay(parsed)) {
          replayData = parsed;
        }
      }

      if (replayData && extContext) {
        showReplayPanel(extContext, replayData);
      } else {
        vscode.window.showErrorMessage('Invalid replay file format (expected version 1).');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to read replay file: ${err?.message || err}`);
    }
  });

  context.subscriptions.push(openLast, openFile);
}
