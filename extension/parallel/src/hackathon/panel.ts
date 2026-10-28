import * as vscode from 'vscode';
import { session, send, onMessage, isEditor } from '../connection';
import { HackathonState, Recommendation, GitGuardianInfo, WebviewState } from './types';
import { calculateNextBestActions } from './recommendations';
import { inspectGitRepository } from './gitGuardian';
import { renderHackathonHtml } from './hackathonHtml';

export class HackathonManager {
  private static instance: HackathonManager | null = null;
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext | null = null;

  private state: HackathonState | null = null;
  private recommendations: Recommendation[] = [];
  private gitInfo: GitGuardianInfo | null = null;
  private sessionCode = '';

  private constructor() {}

  public static getInstance(): HackathonManager {
    if (!HackathonManager.instance) {
      HackathonManager.instance = new HackathonManager();
    }
    return HackathonManager.instance;
  }

  public init(context: vscode.ExtensionContext): void {
    this.context = context;
    this.setupListeners();
  }

  public open(context: vscode.ExtensionContext): void {
    this.context = context;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.requestServerSync();
      this.refreshGit();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'parallelHackathonMode',
      'Parallel Hackathon Command Center',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = renderHackathonHtml(this.getWebviewState());

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg),
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    this.requestServerSync();
    this.refreshGit();
  }

  private getWebviewState(): WebviewState {
    return {
      state: this.state,
      recommendations: this.recommendations,
      gitInfo: this.gitInfo,
      userRole: session.role || 'guest',
      canEdit: isEditor(),
      userName: session.name || '',
      sessionCode: this.sessionCode || this.state?.code || '',
      serverConnected: !!session.role,
    };
  }

  public setupListeners(): void {
    onMessage('hackathon_sync', (msg) => {
      if (msg.state) {
        this.state = msg.state;
        if (msg.state.code) {
          this.sessionCode = msg.state.code;
        }
      }
      this.recommendations = msg.recommendations || calculateNextBestActions(this.state);
      this.postSync();
    });

    onMessage('created', (msg) => {
      if (msg?.code) {
        this.sessionCode = msg.code;
      }
      this.requestServerSync();
    });

    onMessage('joined', (msg) => {
      if (msg?.code) {
        this.sessionCode = msg.code;
      }
      this.requestServerSync();
    });

    onMessage('peers', () => {
      this.postSync();
    });
  }

  private requestServerSync(): void {
    if (session.role) {
      send({ t: 'hackathon_get' });
    }
  }

  public async refreshGit(): Promise<void> {
    try {
      this.gitInfo = await inspectGitRepository(this.state?.tasks || [], session.name || '');
      if (this.panel) {
        this.panel.webview.postMessage({
          type: 'git_info',
          gitInfo: this.gitInfo,
        });
      }
    } catch {
      // Git inspection failed silently
    }
  }

  private postSync(): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'sync',
        state: this.state,
        recommendations: this.recommendations,
        userRole: session.role || 'guest',
        canEdit: isEditor(),
        sessionCode: this.sessionCode || this.state?.code || '',
        userName: session.name || '',
      });
    }
  }

  private handleWebviewMessage(msg: any): void {
    if (!msg || !msg.command) { return; }

    switch (msg.command) {
      case 'refresh':
        this.requestServerSync();
        this.refreshGit();
        break;

      case 'refresh_git':
        this.refreshGit();
        break;

      case 'request_edit_access':
        vscode.commands.executeCommand('parallel.requestEditAccess');
        break;

      case 'update_setup':
        if (session.role) {
          send({ t: 'hackathon_update_setup', setup: msg.setup });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'create_task':
        if (session.role) {
          send({ t: 'hackathon_task_create', task: msg.task });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'update_task':
        if (session.role) {
          send({ t: 'hackathon_task_update', id: msg.id, updates: msg.updates });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'delete_task':
        if (session.role) {
          send({ t: 'hackathon_task_delete', id: msg.id });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'update_milestone':
        if (session.role) {
          send({ t: 'hackathon_milestone_update', id: msg.id, updates: msg.updates });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'update_deliverable':
        if (session.role) {
          send({ t: 'hackathon_deliverable_update', id: msg.id, updates: msg.updates });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      case 'update_notes':
        if (session.role) {
          send({ t: 'hackathon_notes_update', notes: msg.notes });
        } else {
          vscode.window.showWarningMessage('Not connected to a Parallel session.');
        }
        break;

      default:
        break;
    }
  }
}
