import * as vscode from 'vscode';
import { session, send, connect, onMessage, isEditor } from '../connection';
import { DashboardState, ActivityEvent, ReplaySummary, PendingEditRequest } from './types';
import { renderDashboardHtml } from './dashboardHtml';
import { showReplayPanel } from '../replay/panel';
import { findLatestLocalReplay } from '../replay/loader';

export class AdminDashboardManager {
  private static instance: AdminDashboardManager | null = null;
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext | null = null;

  // Real-time state
  private sessionStatus: 'active' | 'idle' | 'disconnected' = 'idle';
  private sessionCode = '';
  private sessionHost = '';
  private sessionStartedAt: number | null = null;
  private pendingRequests: PendingEditRequest[] = [];
  private participants: { name: string; role: string; canEdit: boolean }[] = [];
  private timeline: ActivityEvent[] = [];
  private replays: ReplaySummary[] = [];
  private serverConnected = false;
  private lastLatencyMs: number | null = null;
  private lastError: string | null = null;
  private pingStart = 0;

  private constructor() {}

  public static getInstance(): AdminDashboardManager {
    if (!AdminDashboardManager.instance) {
      AdminDashboardManager.instance = new AdminDashboardManager();
    }
    return AdminDashboardManager.instance;
  }

  public init(context: vscode.ExtensionContext): void {
    this.context = context;
    this.setupListeners();
  }

  public open(context: vscode.ExtensionContext): void {
    this.context = context;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.refreshReplays();
      this.postUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'parallelAdminDashboard',
      'Parallel Admin Dashboard',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = renderDashboardHtml(this.getState());

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg),
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    this.refreshReplays();
    this.postUpdate();
  }

  public logEvent(type: ActivityEvent['type'], description: string, user?: string, isLive = true): void {
    const ev: ActivityEvent = {
      id: Math.random().toString(36).slice(2, 10),
      timestamp: Date.now(),
      type,
      description,
      isLive,
      user,
    };
    this.timeline.push(ev);
    if (this.timeline.length > 100) {
      this.timeline.shift();
    }
    this.postUpdate();
  }

  public onSessionCreated(code: string, hostName: string): void {
    this.sessionStatus = 'active';
    this.sessionCode = code;
    this.sessionHost = hostName;
    this.sessionStartedAt = Date.now();
    this.serverConnected = true;
    this.pendingRequests = [];
    this.participants = [{ name: hostName, role: 'superhost', canEdit: true }];
    this.logEvent('session_start', `Session started by ${hostName} (Code: ${code})`, hostName);
  }

  public onSessionJoined(code: string, userName: string): void {
    this.sessionStatus = 'active';
    this.sessionCode = code;
    this.sessionStartedAt = this.sessionStartedAt || Date.now();
    this.serverConnected = true;
    this.logEvent('joined', `Joined session ${code} as ${userName}`, userName);
  }

  public onPeersUpdated(peers: { name: string; role: string; canEdit?: boolean }[]): void {
    this.participants = peers.map((p) => ({
      name: p.name,
      role: p.role,
      canEdit: !!p.canEdit,
    }));
    // If host identity not set, discover from peers
    const hostPeer = peers.find((p) => p.role === 'superhost' || p.role === 'host');
    if (hostPeer && !this.sessionHost) {
      this.sessionHost = hostPeer.name;
    }
    this.postUpdate();
  }

  public onEditRequest(name: string): void {
    if (!this.pendingRequests.some((r) => r.name === name)) {
      this.pendingRequests.push({ name, requestedAt: Date.now() });
      this.logEvent('edit_request', `${name} requested edit access`, name);
    }
  }

  public onEditGranted(name: string): void {
    this.pendingRequests = this.pendingRequests.filter((r) => r.name !== name);
    const p = this.participants.find((item) => item.name === name);
    if (p) {
      p.canEdit = true;
    }
    this.logEvent('edit_granted', `Edit access granted to ${name}`, name);
  }

  public onEditDenied(name: string): void {
    this.pendingRequests = this.pendingRequests.filter((r) => r.name !== name);
    const p = this.participants.find((item) => item.name === name);
    if (p) {
      p.canEdit = false;
    }
    this.logEvent('edit_denied', `Edit request denied for ${name}`, name);
  }

  public onEditRevoked(name: string): void {
    this.pendingRequests = this.pendingRequests.filter((r) => r.name !== name);
    const p = this.participants.find((item) => item.name === name);
    if (p) {
      p.canEdit = false;
    }
    this.logEvent('edit_revoked', `Edit access revoked from ${name}`, name);
  }

  public onRoleChanged(role: string): void {
    this.logEvent('role_change', `Role updated to ${role}`);
  }

  public onSessionEnded(): void {
    this.sessionStatus = 'idle';
    this.logEvent('session_end', `Session ${this.sessionCode || ''} ended`);
    this.sessionStartedAt = null;
    this.pendingRequests = [];
    this.refreshReplays();
    this.postUpdate();
  }

  public onConnectionClosed(): void {
    this.serverConnected = false;
    this.postUpdate();
  }

  private setupListeners(): void {
    onMessage('created', (msg: any) => {
      this.onSessionCreated(msg.code, session.name || 'superhost');
    });

    onMessage('joined', () => {
      this.onSessionJoined(this.sessionCode, session.name || 'Guest');
    });

    onMessage('peers', (msg: any) => {
      const list = msg.peers ?? (msg.list ?? []).map((n: string) => ({ name: n, role: 'guest', canEdit: false }));
      this.onPeersUpdated(list);
    });

    onMessage('edit_request', (msg: any) => {
      if (msg?.name) {
        this.onEditRequest(msg.name);
      }
    });

    onMessage('edit_granted', (msg: any) => {
      if (msg?.name) {
        this.onEditGranted(msg.name);
      }
    });

    onMessage('edit_denied', (msg: any) => {
      if (msg?.name) {
        this.onEditDenied(msg.name);
      }
    });

    onMessage('edit_revoked', (msg: any) => {
      if (msg?.name) {
        this.onEditRevoked(msg.name);
      }
    });

    onMessage('role', (msg: any) => {
      if (msg?.role) {
        this.onRoleChanged(msg.role);
      }
    });

    onMessage('ended', () => {
      this.onSessionEnded();
    });

    onMessage('closed', () => {
      this.onConnectionClosed();
    });

    onMessage('error', (msg: any) => {
      this.lastError = msg?.msg ?? msg?.message ?? 'Unknown server error';
      this.postUpdate();
    });

    onMessage('pong', () => {
      if (this.pingStart > 0) {
        this.lastLatencyMs = Math.max(1, Date.now() - this.pingStart);
        this.pingStart = 0;
        this.panel?.webview.postMessage({
          type: 'pong',
          latencyMs: this.lastLatencyMs,
        });
      }
    });

    onMessage('replay_list', (msg: any) => {
      if (Array.isArray(msg?.recordings)) {
        this.replays = msg.recordings;
        this.panel?.webview.postMessage({
          type: 'replays',
          replays: this.replays,
        });
      }
    });
  }

  private async handleWebviewMessage(msg: any): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    switch (msg.command) {
      case 'approveRequest': {
        if (session.role !== 'superhost') {
          vscode.window.showErrorMessage('Unauthorized: Only the superhost can approve edit access.');
          return;
        }
        send({ t: 'decide_edit', name: msg.name, approve: true });
        break;
      }

      case 'rejectRequest': {
        if (session.role !== 'superhost') {
          vscode.window.showErrorMessage('Unauthorized: Only the superhost can reject edit access.');
          return;
        }
        send({ t: 'decide_edit', name: msg.name, approve: false });
        break;
      }

      case 'grantEdit': {
        if (session.role !== 'superhost') {
          vscode.window.showErrorMessage('Unauthorized: Only the superhost can grant edit access.');
          return;
        }
        send({ t: 'decide_edit', name: msg.name, approve: true });
        break;
      }

      case 'revokeEdit': {
        if (session.role !== 'superhost') {
          vscode.window.showErrorMessage('Unauthorized: Only the superhost can revoke edit access.');
          return;
        }
        send({ t: 'revoke_edit', name: msg.name });
        break;
      }

      case 'openReplay': {
        if (typeof msg.id === 'string' && msg.id) {
          await this.openReplayById(msg.id);
        }
        break;
      }

      case 'refresh': {
        this.pingServer();
        await this.refreshReplays();
        this.postUpdate();
        break;
      }

      case 'refreshReplays': {
        await this.refreshReplays();
        break;
      }

      case 'reconnect': {
        try {
          await connect();
          this.serverConnected = true;
          this.lastError = null;
          vscode.window.showInformationMessage('Parallel: Connected to server.');
        } catch (err: any) {
          this.serverConnected = false;
          this.lastError = err?.message || String(err);
          vscode.window.showErrorMessage('Parallel: Reconnect failed - ' + this.lastError);
        }
        this.postUpdate();
        break;
      }
    }
  }

  private async openReplayById(id: string): Promise<void> {
    const userName = session.name;
    // 1. Try local disk search first for instant zero-latency loading
    try {
      const uris = await vscode.workspace.findFiles(`**/recordings/${id}.json`);
      if (uris && uris.length > 0) {
        const bytes = await vscode.workspace.fs.readFile(uris[0]);
        const text = new TextDecoder('utf-8').decode(bytes);
        const data = JSON.parse(text);
        if (data && data.v === 1 && data.id === id) {
          if (!userName || (Array.isArray(data.participants) && data.participants.includes(userName)) || session.role === 'superhost') {
            if (this.context) {
              showReplayPanel(this.context, data);
              return;
            }
          }
        }
      }
    } catch {
      // Fall through to server request
    }

    // 2. Request from server
    try {
      await connect();
      send({ t: 'replay_get', id, name: userName });
    } catch {
      vscode.window.showErrorMessage('Cannot connect to server to retrieve replay.');
    }
  }

  public pingServer(): void {
    this.pingStart = Date.now();
    send({ t: 'ping' });
  }

  public async refreshReplays(): Promise<void> {
    const userName = session.name;

    // 1. Query server if connected
    send({ t: 'replay_list', name: userName });

    // 2. Also discover local workspace recordings
    const localSummaries = await this.discoverLocalReplays(userName);
    if (localSummaries.length > 0) {
      // Merge unique by id
      const map = new Map<string, ReplaySummary>();
      for (const r of this.replays) {
        map.set(r.id, r);
      }
      for (const r of localSummaries) {
        map.set(r.id, r);
      }
      this.replays = Array.from(map.values()).sort((a, b) => b.startedAt - a.startedAt);
      this.panel?.webview.postMessage({
        type: 'replays',
        replays: this.replays,
      });
    }
  }

  private async discoverLocalReplays(userName?: string): Promise<ReplaySummary[]> {
    try {
      const uris = await vscode.workspace.findFiles('**/recordings/*.json');
      if (!uris || uris.length === 0) {
        return [];
      }

      const summaries: ReplaySummary[] = [];
      for (const uri of uris) {
        const fileName = uri.path.split('/').pop() || '';
        if (/^[a-f0-9]{12}\.json$/.test(fileName)) {
          try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = new TextDecoder('utf-8').decode(bytes);
            if (!text || !text.trim()) {
              continue;
            }
            const data = JSON.parse(text);
            if (data && data.v === 1 && typeof data.id === 'string') {
              if (!userName || (Array.isArray(data.participants) && data.participants.includes(userName)) || session.role === 'superhost') {
                const stat = await vscode.workspace.fs.stat(uri);
                const startedAt = typeof data.startedAt === 'number' ? data.startedAt : stat.mtime;
                const endedAt = typeof data.endedAt === 'number' ? data.endedAt : stat.mtime;
                summaries.push({
                  id: data.id,
                  code: typeof data.code === 'string' ? data.code : 'UNKNOWN',
                  startedAt,
                  endedAt,
                  duration: Math.max(0, endedAt - startedAt),
                  participants: Array.isArray(data.participants) ? [...data.participants] : [],
                  eventCount: Array.isArray(data.events) ? data.events.length : 0,
                  snapshotCount: Array.isArray(data.snapshots) ? data.snapshots.length : 0,
                });
              }
            }
          } catch {
            continue;
          }
        }
      }
      summaries.sort((a, b) => b.startedAt - a.startedAt);
      return summaries;
    } catch {
      return [];
    }
  }

  public getState(): DashboardState {
    const isSuperhost = session.role === 'superhost';
    const serverUrl = vscode.workspace
      .getConfiguration('parallel')
      .get<string>('serverUrl', 'ws://localhost:8080');

    // Build participant states
    const selfName = session.name || (isSuperhost ? 'superhost' : 'guest');
    let participantsState = this.participants.map((p) => ({
      name: p.name,
      role: p.role,
      canEdit: p.canEdit || p.role === 'superhost' || p.role === 'host',
      isSelf: p.name === selfName,
      status: 'connected' as const,
    }));

    if (session.role && !participantsState.some((p) => p.name === selfName)) {
      participantsState.unshift({
        name: selfName,
        role: session.role,
        canEdit: session.canEdit || isEditor(),
        isSelf: true,
        status: 'connected' as const,
      });
    }

    return {
      session: {
        status: session.role ? 'active' : this.sessionStatus,
        code: this.sessionCode,
        host: this.sessionHost || (isSuperhost ? selfName : '-'),
        role: session.role || null,
        canEdit: isEditor(),
        startedAt: this.sessionStartedAt,
        connectedCount: participantsState.length,
      },
      participants: participantsState,
      pendingRequests: [...this.pendingRequests],
      timeline: [...this.timeline],
      replays: [...this.replays],
      health: {
        serverUrl,
        serverConnected: this.serverConnected || !!session.role,
        latencyMs: this.lastLatencyMs,
        lastPingAt: Date.now(),
        lastError: this.lastError,
        replaysAvailable: this.replays.length,
      },
      currentUser: {
        name: selfName,
        role: session.role || null,
        isSuperhost,
      },
    };
  }

  public postUpdate(): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'update',
        state: this.getState(),
      });
    }
  }
}
