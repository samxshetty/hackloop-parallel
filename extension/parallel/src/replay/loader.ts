import * as vscode from 'vscode';
import { onMessage, send, connect, session } from '../connection';
import { ReplayData } from './types';
import { showReplayPanel, getLastActiveReplay } from './panel';
import { renderReplayHtml } from './viewerHtml';

let lastReplayId: string | null = null;
let lastSessionCode: string | null = null;
let lastReplayData: ReplayData | null = null;
let lastReplayReceivedAt = 0;
let extContext: vscode.ExtensionContext | null = null;

export function validateReplay(data: any): data is ReplayData {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (data.v !== 1) {
    return false;
  }
  if (typeof data.id !== 'string' || !/^[a-f0-9]{12}$/.test(data.id)) {
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

export function saveLastReplayId(id: string): void {
  if (!id || typeof id !== 'string') {
    return;
  }
  lastReplayId = id;
  try {
    extContext?.workspaceState.update('parallel.lastReplayId', id);
    extContext?.globalState.update('parallel.lastReplayId', id);
  } catch {
    // Ignore storage update errors
  }
}

export function saveLastName(name: string): void {
  if (!name || typeof name !== 'string') {
    return;
  }
  try {
    extContext?.workspaceState.update('parallel.lastName', name);
    extContext?.globalState.update('parallel.lastName', name);
  } catch {
    // Ignore storage update errors
  }
}


export function saveLastSessionCode(code: string): void {
  if (!code || typeof code !== 'string') {
    return;
  }
  lastSessionCode = code;
  try {
    extContext?.workspaceState.update('parallel.lastSessionCode', code);
    extContext?.globalState.update('parallel.lastSessionCode', code);
  } catch {
    // Ignore storage update errors
  }
}

export function getLastSessionCode(): string {
  return lastSessionCode ||
    extContext?.workspaceState.get<string>('parallel.lastSessionCode') ||
    extContext?.globalState.get<string>('parallel.lastSessionCode') ||
    '';
}

export function getSavedName(): string {
  return session.name ||
    extContext?.workspaceState.get<string>('parallel.lastName') ||
    extContext?.globalState.get<string>('parallel.lastName') ||
    '';
}

export async function requestReplay(id?: string): Promise<void> {
  const name = getSavedName();
  const code = getLastSessionCode();
  try {
    await connect();
  } catch {
    // Connection attempt made; proceed with send if socket is open
  }
  send({ t: 'replay_get', id: id || 'last', name, code });
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

export async function findLatestLocalReplay(userName?: string): Promise<ReplayData | null> {
  try {
    const uris = await vscode.workspace.findFiles('**/recordings/*.json');
    if (!uris || uris.length === 0) {
      return null;
    }

    const candidates: { uri: vscode.Uri; mtime: number }[] = [];
    for (const uri of uris) {
      const fileName = uri.path.split('/').pop() || '';
      if (/^[a-f0-9]{12}\.json$/.test(fileName)) {
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          candidates.push({ uri, mtime: stat.mtime });
        } catch {
          // Ignore inaccessible files
        }
      }
    }

    candidates.sort((a, b) => b.mtime - a.mtime);

    for (const cand of candidates) {
      try {
        const bytes = await vscode.workspace.fs.readFile(cand.uri);
        const text = new TextDecoder('utf-8').decode(bytes);
        if (!text || !text.trim()) {
          continue;
        }
        const parsed = JSON.parse(text);
        if (validateReplay(parsed)) {
          if (!userName || (Array.isArray(parsed.participants) && parsed.participants.includes(userName))) {
            return parsed;
          }
        }
      } catch {
        // Skip empty or malformed files
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function registerReplayLoader(context: vscode.ExtensionContext): void {
  extContext = context;
  lastReplayId = context.workspaceState.get<string>('parallel.lastReplayId') ||
    context.globalState.get<string>('parallel.lastReplayId') ||
    null;
  lastSessionCode = context.workspaceState.get<string>('parallel.lastSessionCode') ||
    context.globalState.get<string>('parallel.lastSessionCode') ||
    null;

  let lastReplayErrorAt = 0;
  onMessage('error', (msg: any) => {
    if (msg?.msg === 'no replay') {
      lastReplayErrorAt = Date.now();
    }
  });

  // On replay_ready: remember the id and offer to open
  onMessage('replay_ready', async (msg: any) => {
    if (msg && typeof msg.id === 'string') {
      saveLastReplayId(msg.id);
      if (typeof msg.code === 'string') {
        saveLastSessionCode(msg.code);
      }
      const pick = await vscode.window.showInformationMessage('Session ended. Open replay?', 'Open Replay');
      if (pick === 'Open Replay') {
        await requestReplay(msg.id);
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
      saveLastReplayId(msg.data.id);
      lastReplayData = msg.data;
      lastReplayReceivedAt = Date.now();
      if (extContext) {
        showReplayPanel(extContext, msg.data);
      }
    } else {
      vscode.window.showErrorMessage('Invalid replay data received (expected version 1).');
    }
  });

  // Command: Open Last Replay
  const openLast = vscode.commands.registerCommand('parallel.openLastReplay', async () => {
    if (session.name) {
      saveLastName(session.name);
    }
    const beforeTime = Date.now();
    const targetId = lastReplayId ||
      extContext?.workspaceState.get<string>('parallel.lastReplayId') ||
      extContext?.globalState.get<string>('parallel.lastReplayId') ||
      'last';
    const userName = getSavedName();
    const code = getLastSessionCode();

    // 1. Try requesting from server over WebSocket
    try {
      await connect();
      send({ t: 'replay_get', id: targetId, name: userName, code });

      // Wait up to 1.5 seconds for response from server
      const timeoutAt = Date.now() + 1500;
      while (Date.now() < timeoutAt) {
        if (lastReplayReceivedAt >= beforeTime) {
          return;
        }
        if (lastReplayErrorAt >= beforeTime) {
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    } catch {
      // Server not reachable or failed; proceed to local fallback
    }

    // 2. Discover and load from local saved recordings in workspace
    const local = await findLatestLocalReplay(userName);
    if (local && extContext) {
      saveLastReplayId(local.id);
      lastReplayData = local;
      showReplayPanel(extContext, local);
      return;
    }

    vscode.window.showWarningMessage('No recent replay available in this session.');
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
        saveLastReplayId(replayData.id);
        lastReplayData = replayData;
        showReplayPanel(extContext, replayData);
      } else {
        vscode.window.showErrorMessage('Invalid replay file format (expected version 1).');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to read replay file: ${err?.message || err}`);
    }
  });

  // Command: Export Replay as HTML
  const exportHtml = vscode.commands.registerCommand('parallel.exportReplayHtml', async (replay?: ReplayData) => {
    const replayToExport = replay || getLastActiveReplay() || lastReplayData;
    if (!replayToExport) {
      vscode.window.showWarningMessage('No replay data to export. Open or load a replay first.');
      return;
    }

    const defaultFileName = `replay-${replayToExport.code || 'session'}-${replayToExport.id.slice(0, 8)}.html`;
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
      const htmlContent = renderReplayHtml(replayToExport, true);
      const bytes = new TextEncoder().encode(htmlContent);
      await vscode.workspace.fs.writeFile(saveUri, bytes);

      const action = await vscode.window.showInformationMessage(
        `Replay exported to ${saveUri.fsPath}`,
        'Open in Browser'
      );
      if (action === 'Open in Browser') {
        await vscode.env.openExternal(saveUri);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to export replay: ${err?.message || err}`);
    }
  });

  context.subscriptions.push(openLast, openFile, exportHtml);
}
