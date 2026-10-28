import { WebviewState, Task, Milestone, Deliverable, PulseEvent, ProjectNotes, HackathonSetup, Recommendation, GitGuardianInfo } from './types';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function escapeJsonForHtml(data: any): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\//g, '\\u002f');
}

export function renderHackathonHtml(initialState: WebviewState): string {
  const nonce = getNonce();
  const safeStateJson = escapeJsonForHtml(initialState);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Parallel Hackathon Command Center</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --card-header: var(--vscode-sideBarSectionHeader-background, #2d2d2d);
      --border: var(--vscode-panel-border, #333333);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-danger: #c72e2e;
      --btn-danger-hover: #e03838;
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
      --info: #58a6ff;
      --purple: #bc8cff;
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --font-mono: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
      --font-ui: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-ui);
      font-size: 13px;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100vh;
      overflow: hidden;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-title {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.2px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--btn-sec-bg);
      color: var(--fg);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Countdown Banner */
    .countdown-widget {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 6px;
      background: rgba(14, 99, 156, 0.15);
      border: 1px solid rgba(14, 99, 156, 0.4);
      font-weight: 600;
      font-size: 13px;
    }
    .countdown-widget.urgent {
      background: rgba(248, 81, 73, 0.15);
      border-color: rgba(248, 81, 73, 0.4);
      color: var(--danger);
    }
    .countdown-widget.warning {
      background: rgba(210, 153, 34, 0.15);
      border-color: rgba(210, 153, 34, 0.4);
      color: var(--warning);
    }
    .countdown-time {
      font-family: var(--font-mono);
      font-size: 15px;
    }

    /* Buttons */
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    button:hover { background: var(--btn-hover); }
    button.secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
    }
    button.secondary:hover { background: #4a4d51; }
    button.danger { background: var(--btn-danger); }
    button.danger:hover { background: var(--btn-danger-hover); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Nav Tabs */
    .tabs-nav {
      display: flex;
      gap: 6px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      color: var(--fg);
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      padding: 8px 14px;
      cursor: pointer;
      font-weight: 500;
      font-size: 13px;
      opacity: 0.7;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { background: rgba(255, 255, 255, 0.04); opacity: 1; }
    .tab-btn.active {
      color: #ffffff;
      border-bottom-color: var(--btn-bg);
      opacity: 1;
      font-weight: 600;
    }

    /* Tab Content Area */
    .tab-content {
      flex: 1;
      overflow-y: auto;
      display: none;
      padding-right: 4px;
    }
    .tab-content.active {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Recommendation Cards */
    .rec-card {
      background: rgba(255, 255, 255, 0.02);
      border-left: 4px solid var(--info);
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rec-card.critical { border-left-color: var(--danger); background: rgba(248, 81, 73, 0.05); }
    .rec-card.high { border-left-color: var(--warning); background: rgba(210, 153, 34, 0.05); }
    .rec-card.medium { border-left-color: var(--info); background: rgba(88, 166, 255, 0.05); }
    .rec-card.info { border-left-color: var(--purple); background: rgba(188, 140, 255, 0.05); }

    .rec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .rec-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .rec-badge.critical { background: var(--danger); color: #fff; }
    .rec-badge.high { background: var(--warning); color: #000; }
    .rec-badge.medium { background: var(--info); color: #000; }
    .rec-badge.info { background: var(--purple); color: #000; }

    .rec-title { font-weight: 600; font-size: 13px; }
    .rec-desc { color: var(--fg); opacity: 0.9; font-size: 12px; }
    .rec-action-box {
      background: rgba(0, 0, 0, 0.2);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    /* Grid & Stats */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    .stat-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; font-weight: 600; }
    .stat-value { font-size: 20px; font-weight: 700; font-family: var(--font-mono); }

    /* Kanban Board */
    .kanban-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    input[type="text"], input[type="datetime-local"], input[type="url"], select, textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 12px;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: 1px solid var(--btn-bg);
      border-color: var(--btn-bg);
    }
    .kanban-board {
      display: grid;
      grid-template-columns: repeat(5, minmax(220px, 1fr));
      gap: 12px;
      overflow-x: auto;
      min-height: 400px;
      flex: 1;
    }
    .kanban-col {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      max-height: 100%;
    }
    .kanban-col-header {
      background: var(--card-header);
      padding: 8px 12px;
      font-weight: 600;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      border-radius: 6px 6px 0 0;
    }
    .col-count {
      background: var(--badge-bg);
      color: var(--badge-fg);
      border-radius: 10px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 600;
    }
    .kanban-cards {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
      flex: 1;
    }
    .task-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      cursor: pointer;
      transition: transform 0.1s, border-color 0.1s;
    }
    .task-card:hover {
      border-color: #555;
      transform: translateY(-1px);
    }
    .task-title { font-weight: 600; font-size: 13px; line-height: 1.3; }
    .task-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      font-size: 11px;
    }
    .priority-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .priority-Critical { background: rgba(248, 81, 73, 0.2); color: var(--danger); border: 1px solid var(--danger); }
    .priority-High { background: rgba(210, 153, 34, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .priority-Medium { background: rgba(88, 166, 255, 0.2); color: var(--info); border: 1px solid var(--info); }
    .priority-Low { background: rgba(140, 140, 140, 0.2); color: #888; border: 1px solid #666; }
    .task-assignee {
      opacity: 0.8;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .task-files {
      font-family: var(--font-mono);
      font-size: 10px;
      opacity: 0.6;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task-blocked-box {
      font-size: 11px;
      color: var(--danger);
      background: rgba(248, 81, 73, 0.1);
      padding: 4px 6px;
      border-radius: 3px;
      margin-top: 2px;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-backdrop.open { display: flex; }
    .modal {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      width: 90%;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 15px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .modal-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 70vh;
      overflow-y: auto;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .form-group label {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.8;
      text-transform: uppercase;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    /* Milestones & Deliverables */
    .milestone-item, .deliverable-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      gap: 12px;
    }
    .item-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }
    .item-check {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }
    .item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .item-title { font-weight: 600; font-size: 13px; }
    .item-title.completed { text-decoration: line-through; opacity: 0.6; }
    .item-desc { font-size: 11px; opacity: 0.7; }
    .item-deadline { font-size: 11px; font-family: var(--font-mono); opacity: 0.8; }

    /* Team Pulse & Git Guardian */
    .pulse-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pulse-item {
      padding: 8px 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    .pulse-time { font-size: 10px; opacity: 0.6; font-family: var(--font-mono); white-space: nowrap; }

    .git-box {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card-bg);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .overlap-alert {
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid rgba(248, 81, 73, 0.4);
      color: var(--danger);
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Notes section */
    .notes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 14px;
    }
    .note-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .note-card textarea {
      min-height: 140px;
      resize: vertical;
      font-size: 12px;
      line-height: 1.4;
    }

    /* Permission banner */
    .perm-banner {
      background: rgba(210, 153, 34, 0.15);
      border: 1px solid rgba(210, 153, 34, 0.4);
      color: var(--warning);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="header-title">
        <span>⚡ Parallel Command Center</span>
      </div>
      <div id="badgeRole" class="header-tag">Role: Guest</div>
      <div id="badgeCode" class="header-tag">Session: -</div>
    </div>
    <div class="header-right">
      <div id="countdownWidget" class="countdown-widget">
        <span>⏳ Deadline:</span>
        <span id="countdownDisplay" class="countdown-time">--:--:--</span>
      </div>
      <button id="btnRefresh" class="secondary" title="Sync latest data">↻ Refresh</button>
    </div>
  </div>

  <!-- Read-only notice for guests -->
  <div id="readOnlyBanner" class="perm-banner" style="display: none;">
    <span>🔒 You have read-only view. Request edit access to create/update tasks and notes.</span>
    <button id="btnRequestEdit" class="secondary">Request Edit Access</button>
  </div>

  <!-- Navigation Tabs -->
  <div class="tabs-nav">
    <button class="tab-btn active" data-tab="tab-overview">⚡ Command Center</button>
    <button class="tab-btn" data-tab="tab-tasks">📋 Task Board</button>
    <button class="tab-btn" data-tab="tab-milestones">🎯 Milestones & Deliverables</button>
    <button class="tab-btn" data-tab="tab-pulse">📡 Team Pulse & Git Guardian</button>
    <button class="tab-btn" data-tab="tab-notes">📝 Project Notes</button>
    <button class="tab-btn" data-tab="tab-setup">⚙️ Setup</button>
  </div>

  <!-- TAB 1: Command Center Overview -->
  <div id="tab-overview" class="tab-content active">
    <!-- Standout Recommendations -->
    <div class="card">
      <div class="card-title">
        <span>🧠 Next Best Actions (Recommendation Engine)</span>
        <span style="font-size: 11px; opacity: 0.7;">Deterministic & Explainable</span>
      </div>
      <div id="recContainer" style="display: flex; flex-direction: column; gap: 8px;">
        <div style="opacity: 0.6; font-size: 12px;">Evaluating session status...</div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="grid-4">
      <div class="stat-box">
        <div class="stat-label">Task Progress</div>
        <div id="statTaskProgress" class="stat-value">0 / 0</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Critical / Blocked</div>
        <div id="statBlocked" class="stat-value" style="color: var(--danger);">0</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Milestones Done</div>
        <div id="statMilestones" class="stat-value">0 / 0</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Git Working State</div>
        <div id="statGitStatus" class="stat-value" style="font-size: 14px;">Clean</div>
      </div>
    </div>

    <!-- Quick Overview Sections -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
      <!-- Active Focus -->
      <div class="card">
        <div class="card-title">Active Focus / In Progress Tasks</div>
        <div id="overviewActiveTasks" style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
          <div style="opacity: 0.6;">No tasks currently in progress.</div>
        </div>
      </div>
      <!-- Key Deliverables -->
      <div class="card">
        <div class="card-title">Submission Deliverables Checklist</div>
        <div id="overviewDeliverables" style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
          <div style="opacity: 0.6;">No deliverables tracked yet.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: Task Board -->
  <div id="tab-tasks" class="tab-content">
    <div class="kanban-toolbar">
      <div class="filter-group">
        <input type="text" id="taskSearchInput" placeholder="Search tasks..." style="width: 180px;">
        <select id="taskPriorityFilter">
          <option value="">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select id="taskAssigneeFilter">
          <option value="">All Assignees</option>
        </select>
      </div>
      <button id="btnNewTask">+ New Task</button>
    </div>

    <div class="kanban-board">
      <div class="kanban-col" data-col="Backlog">
        <div class="kanban-col-header">
          <span>Backlog</span>
          <span class="col-count" id="count-Backlog">0</span>
        </div>
        <div class="kanban-cards" id="cards-Backlog"></div>
      </div>
      <div class="kanban-col" data-col="To Do">
        <div class="kanban-col-header">
          <span>To Do</span>
          <span class="col-count" id="count-ToDo">0</span>
        </div>
        <div class="kanban-cards" id="cards-ToDo"></div>
      </div>
      <div class="kanban-col" data-col="In Progress">
        <div class="kanban-col-header">
          <span>In Progress</span>
          <span class="col-count" id="count-InProgress">0</span>
        </div>
        <div class="kanban-cards" id="cards-InProgress"></div>
      </div>
      <div class="kanban-col" data-col="Blocked">
        <div class="kanban-col-header">
          <span style="color: var(--danger);">Blocked</span>
          <span class="col-count" id="count-Blocked" style="background: var(--danger);">0</span>
        </div>
        <div class="kanban-cards" id="cards-Blocked"></div>
      </div>
      <div class="kanban-col" data-col="Done">
        <div class="kanban-col-header">
          <span style="color: var(--success);">Done</span>
          <span class="col-count" id="count-Done" style="background: var(--success);">0</span>
        </div>
        <div class="kanban-cards" id="cards-Done"></div>
      </div>
    </div>
  </div>

  <!-- TAB 3: Milestones & Deliverables -->
  <div id="tab-milestones" class="tab-content">
    <div class="card">
      <div class="card-title">🎯 Project Milestones</div>
      <div id="milestonesList" style="display: flex; flex-direction: column; gap: 8px;"></div>
    </div>

    <div class="card">
      <div class="card-title">📦 Final Submission Deliverables</div>
      <div id="deliverablesList" style="display: flex; flex-direction: column; gap: 8px;"></div>
    </div>
  </div>

  <!-- TAB 4: Team Pulse & Git Guardian -->
  <div id="tab-pulse" class="tab-content">
    <!-- Git Guardian Inspector -->
    <div class="card">
      <div class="card-title">
        <span>🛡️ Git Guardian (Safe Workspace & Overlap Inspector)</span>
        <button id="btnRefreshGit" class="secondary" style="font-size: 11px;">Inspect Git</button>
      </div>

      <div id="gitOverlapAlerts"></div>

      <div class="grid-4" style="margin-top: 6px;">
        <div class="stat-box">
          <div class="stat-label">Active Branch</div>
          <div id="gitBranch" class="stat-value" style="font-size: 14px;">-</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Uncommitted Files</div>
          <div id="gitUncommitted" class="stat-value">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Merge Conflicts</div>
          <div id="gitConflicts" class="stat-value" style="color: var(--danger);">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Teammate Overlaps</div>
          <div id="gitOverlapsCount" class="stat-value" style="color: var(--warning);">0</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;">
        <div class="git-box">
          <div style="font-weight: 600; font-size: 12px;">Local Changed Files</div>
          <div id="gitChangedList" style="font-family: var(--font-mono); font-size: 11px; max-height: 140px; overflow-y: auto;">
            <div style="opacity: 0.6;">No changes detected.</div>
          </div>
        </div>
        <div class="git-box">
          <div style="font-weight: 600; font-size: 12px;">Recent Commits</div>
          <div id="gitCommitList" style="font-size: 11px; max-height: 140px; overflow-y: auto;">
            <div style="opacity: 0.6;">No recent commits.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Team Pulse Feed -->
    <div class="card">
      <div class="card-title">📡 Team Pulse Activity Feed</div>
      <div id="pulseFeed" class="pulse-list" style="max-height: 350px; overflow-y: auto;">
        <div style="opacity: 0.6; font-size: 12px;">No activity logged yet.</div>
      </div>
    </div>
  </div>

  <!-- TAB 5: Project Notes -->
  <div id="tab-notes" class="tab-content">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 12px; opacity: 0.8;">Collaborative shared documentation for submission and judging.</span>
      <button id="btnSaveNotes" class="btn">💾 Save All Notes</button>
    </div>
    <div class="notes-grid">
      <div class="note-card">
        <label style="font-weight: 600;">Problem Statement</label>
        <textarea id="noteProblem" placeholder="What pain point does this hackathon project solve?"></textarea>
      </div>
      <div class="note-card">
        <label style="font-weight: 600;">Proposed Solution</label>
        <textarea id="noteSolution" placeholder="How does your project solve it?"></textarea>
      </div>
      <div class="note-card">
        <label style="font-weight: 600;">Architecture Decisions</label>
        <textarea id="noteArchitecture" placeholder="Tech stack, databases, frameworks, hosting, trade-offs..."></textarea>
      </div>
      <div class="note-card">
        <label style="font-weight: 600;">API Contracts & Integrations</label>
        <textarea id="noteApis" placeholder="Endpoints, payload formats, third-party APIs used..."></textarea>
      </div>
      <div class="note-card">
        <label style="font-weight: 600;">Known Risks & Mitigations</label>
        <textarea id="noteRisks" placeholder="Identified bottlenecks, fallback options for live demo..."></textarea>
      </div>
      <div class="note-card">
        <label style="font-weight: 600;">2-Minute Demo Script</label>
        <textarea id="noteDemoScript" placeholder="Hook (0-15s), Core workflow (15-90s), Impact & Tech (90-120s)..."></textarea>
      </div>
    </div>
  </div>

  <!-- TAB 6: Setup -->
  <div id="tab-setup" class="tab-content">
    <div class="card" style="max-width: 600px;">
      <div class="card-title">⚙️ Hackathon & Session Configuration</div>
      <div id="setupHostNotice" style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">
        Only session hosts can update these settings.
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div class="form-group">
          <label>Hackathon Name</label>
          <input type="text" id="setupHackathonName" placeholder="e.g. HackLoop 2026">
        </div>
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="setupProjectName" placeholder="e.g. Parallel Hackathon Mode">
        </div>
        <div class="form-group">
          <label>Project Description</label>
          <textarea id="setupDescription" rows="2" placeholder="Brief project summary..."></textarea>
        </div>
        <div class="form-group">
          <label>Repository URL</label>
          <input type="url" id="setupRepoUrl" placeholder="https://github.com/org/repo">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Time</label>
            <input type="datetime-local" id="setupStartTime">
          </div>
          <div class="form-group">
            <label>Deadline (Countdown Target)</label>
            <input type="datetime-local" id="setupDeadline">
          </div>
        </div>
        <div class="form-group">
          <label>Team Members (comma separated)</label>
          <input type="text" id="setupTeamMembers" placeholder="Alice, Bob, Charlie">
        </div>
        <div class="form-group">
          <label>Key Goals (comma separated)</label>
          <input type="text" id="setupGoals" placeholder="Clean UI, Working Replay, Live Demo">
        </div>
        <div style="margin-top: 10px;">
          <button id="btnSaveSetup">Save Hackathon Setup</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Task Modal (Create / Edit) -->
  <div id="taskModalBackdrop" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <span id="modalTaskTitleText">Create Task</span>
        <button id="btnModalClose" class="secondary" style="padding: 2px 6px;">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="modalTaskId">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="modalTaskTitle" placeholder="Task title">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="modalTaskDesc" rows="2" placeholder="Details..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Status</label>
            <select id="modalTaskStatus">
              <option value="Backlog">Backlog</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Done">Done</option>
            </select>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select id="modalTaskPriority">
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Assignee</label>
            <input type="text" id="modalTaskAssignee" placeholder="Teammate name">
          </div>
          <div class="form-group">
            <label>Milestone</label>
            <select id="modalTaskMilestone">
              <option value="">None</option>
              <option value="m1">1. Ideation & Scope</option>
              <option value="m2">2. MVP Foundation</option>
              <option value="m3">3. Core Integration</option>
              <option value="m4">4. Testing & Polishing</option>
              <option value="m5">5. Demo Rehearsal</option>
              <option value="m6">6. Final Submission</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Acceptance Criteria</label>
          <input type="text" id="modalTaskCriteria" placeholder="How do we know it's done?">
        </div>
        <div class="form-group" id="modalBlockedGroup" style="display: none;">
          <label style="color: var(--danger);">Blocked Reason *</label>
          <input type="text" id="modalTaskBlockedReason" placeholder="What is blocking this task?">
        </div>
        <div class="form-group">
          <label>Relevant Files (comma separated)</label>
          <input type="text" id="modalTaskFiles" placeholder="e.g. server/server.js, src/index.ts">
        </div>
      </div>
      <div class="modal-footer">
        <button id="btnModalDelete" class="danger" style="display: none; margin-right: auto;">Delete</button>
        <button id="btnModalCancel" class="secondary">Cancel</button>
        <button id="btnModalSave">Save Task</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      let state = ${safeStateJson};

      // Cache DOM Elements
      const badgeRole = document.getElementById('badgeRole');
      const badgeCode = document.getElementById('badgeCode');
      const countdownWidget = document.getElementById('countdownWidget');
      const countdownDisplay = document.getElementById('countdownDisplay');
      const readOnlyBanner = document.getElementById('readOnlyBanner');
      const btnRequestEdit = document.getElementById('btnRequestEdit');
      const btnRefresh = document.getElementById('btnRefresh');

      // Tabs
      const tabBtns = document.querySelectorAll('.tab-btn');
      const tabContents = document.querySelectorAll('.tab-content');

      // Command Center
      const recContainer = document.getElementById('recContainer');
      const statTaskProgress = document.getElementById('statTaskProgress');
      const statBlocked = document.getElementById('statBlocked');
      const statMilestones = document.getElementById('statMilestones');
      const statGitStatus = document.getElementById('statGitStatus');
      const overviewActiveTasks = document.getElementById('overviewActiveTasks');
      const overviewDeliverables = document.getElementById('overviewDeliverables');

      // Task Board
      const taskSearchInput = document.getElementById('taskSearchInput');
      const taskPriorityFilter = document.getElementById('taskPriorityFilter');
      const taskAssigneeFilter = document.getElementById('taskAssigneeFilter');
      const btnNewTask = document.getElementById('btnNewTask');

      // Modal
      const taskModalBackdrop = document.getElementById('taskModalBackdrop');
      const modalTaskTitleText = document.getElementById('modalTaskTitleText');
      const btnModalClose = document.getElementById('btnModalClose');
      const btnModalCancel = document.getElementById('btnModalCancel');
      const btnModalSave = document.getElementById('btnModalSave');
      const btnModalDelete = document.getElementById('btnModalDelete');
      const modalTaskId = document.getElementById('modalTaskId');
      const modalTaskTitle = document.getElementById('modalTaskTitle');
      const modalTaskDesc = document.getElementById('modalTaskDesc');
      const modalTaskStatus = document.getElementById('modalTaskStatus');
      const modalTaskPriority = document.getElementById('modalTaskPriority');
      const modalTaskAssignee = document.getElementById('modalTaskAssignee');
      const modalTaskMilestone = document.getElementById('modalTaskMilestone');
      const modalTaskCriteria = document.getElementById('modalTaskCriteria');
      const modalBlockedGroup = document.getElementById('modalBlockedGroup');
      const modalTaskBlockedReason = document.getElementById('modalTaskBlockedReason');
      const modalTaskFiles = document.getElementById('modalTaskFiles');

      // Milestones & Deliverables
      const milestonesList = document.getElementById('milestonesList');
      const deliverablesList = document.getElementById('deliverablesList');

      // Pulse & Git
      const pulseFeed = document.getElementById('pulseFeed');
      const btnRefreshGit = document.getElementById('btnRefreshGit');
      const gitOverlapAlerts = document.getElementById('gitOverlapAlerts');
      const gitBranch = document.getElementById('gitBranch');
      const gitUncommitted = document.getElementById('gitUncommitted');
      const gitConflicts = document.getElementById('gitConflicts');
      const gitOverlapsCount = document.getElementById('gitOverlapsCount');
      const gitChangedList = document.getElementById('gitChangedList');
      const gitCommitList = document.getElementById('gitCommitList');

      // Notes
      const btnSaveNotes = document.getElementById('btnSaveNotes');
      const noteProblem = document.getElementById('noteProblem');
      const noteSolution = document.getElementById('noteSolution');
      const noteArchitecture = document.getElementById('noteArchitecture');
      const noteApis = document.getElementById('noteApis');
      const noteRisks = document.getElementById('noteRisks');
      const noteDemoScript = document.getElementById('noteDemoScript');

      // Setup
      const setupHostNotice = document.getElementById('setupHostNotice');
      const setupHackathonName = document.getElementById('setupHackathonName');
      const setupProjectName = document.getElementById('setupProjectName');
      const setupDescription = document.getElementById('setupDescription');
      const setupRepoUrl = document.getElementById('setupRepoUrl');
      const setupStartTime = document.getElementById('setupStartTime');
      const setupDeadline = document.getElementById('setupDeadline');
      const setupTeamMembers = document.getElementById('setupTeamMembers');
      const setupGoals = document.getElementById('setupGoals');
      const btnSaveSetup = document.getElementById('btnSaveSetup');

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function isHost() {
        return state.userRole === 'superhost' || state.userRole === 'host';
      }

      function canMutate() {
        return isHost() || state.canEdit;
      }

      // Tab Switching
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          const target = document.getElementById(btn.dataset.tab);
          if (target) target.classList.add('active');
        });
      });

      // Countdown Timer
      function updateCountdown() {
        const deadlineStr = state.state?.setup?.deadline;
        if (!deadlineStr) {
          countdownDisplay.textContent = 'No deadline set';
          countdownWidget.className = 'countdown-widget';
          return;
        }
        const deadline = new Date(deadlineStr).getTime();
        if (isNaN(deadline)) {
          countdownDisplay.textContent = 'Invalid date';
          return;
        }
        const diff = deadline - Date.now();
        if (diff <= 0) {
          countdownDisplay.textContent = 'DEADLINE REACHED';
          countdownWidget.className = 'countdown-widget urgent';
          return;
        }
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        countdownDisplay.textContent = (hours < 10 ? '0' : '') + hours + ':' +
                                      (mins < 10 ? '0' : '') + mins + ':' +
                                      (secs < 10 ? '0' : '') + secs;

        if (hours < 2) {
          countdownWidget.className = 'countdown-widget urgent';
        } else if (hours < 6) {
          countdownWidget.className = 'countdown-widget warning';
        } else {
          countdownWidget.className = 'countdown-widget';
        }
      }
      setInterval(updateCountdown, 1000);

      // Render Functions
      function renderHeader() {
        badgeRole.textContent = 'Role: ' + (state.userRole || 'guest') + (state.canEdit && state.userRole === 'guest' ? ' (editor)' : '');
        badgeCode.textContent = 'Session: ' + (state.sessionCode || '-');
        if (!canMutate()) {
          readOnlyBanner.style.display = 'flex';
          btnNewTask.style.display = 'none';
          btnSaveNotes.disabled = true;
          btnSaveSetup.disabled = true;
        } else {
          readOnlyBanner.style.display = 'none';
          btnNewTask.style.display = 'inline-flex';
          btnSaveNotes.disabled = false;
          btnSaveSetup.disabled = !isHost();
        }
        updateCountdown();
      }

      function renderRecommendations() {
        const recs = state.recommendations || [];
        if (recs.length === 0) {
          recContainer.innerHTML = '<div style="opacity: 0.6; font-size: 12px;">All systems running smoothly! No urgent actions flagged.</div>';
          return;
        }
        recContainer.innerHTML = recs.map(r => {
          return '<div class="rec-card ' + escapeHtml(r.urgency) + '">' +
            '<div class="rec-header">' +
              '<span class="rec-title">' + escapeHtml(r.title) + '</span>' +
              '<span class="rec-badge ' + escapeHtml(r.urgency) + '">' + escapeHtml(r.urgency) + '</span>' +
            '</div>' +
            '<div class="rec-desc">' + escapeHtml(r.description) + '</div>' +
            '<div class="rec-action-box">' +
              '<span><strong>Why:</strong> ' + escapeHtml(r.reason) + '</span>' +
              '<span><strong>Action:</strong> ' + escapeHtml(r.suggestedAction) + '</span>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      function renderStats() {
        const tasks = state.state?.tasks || [];
        const milestones = state.state?.milestones || [];
        const deliverables = state.state?.deliverables || [];

        const doneTasks = tasks.filter(t => t.status === 'Done').length;
        statTaskProgress.textContent = doneTasks + ' / ' + tasks.length;

        const blockedTasks = tasks.filter(t => t.status === 'Blocked').length;
        statBlocked.textContent = blockedTasks;

        const doneM = milestones.filter(m => m.completed).length;
        statMilestones.textContent = doneM + ' / ' + milestones.length;

        const gitInfo = state.gitInfo;
        if (!gitInfo || !gitInfo.isGitRepo) {
          statGitStatus.textContent = 'No Git repo';
          statGitStatus.style.color = 'var(--fg)';
        } else if (gitInfo.unresolvedConflicts.length > 0) {
          statGitStatus.textContent = gitInfo.unresolvedConflicts.length + ' Conflicts';
          statGitStatus.style.color = 'var(--danger)';
        } else if (gitInfo.uncommittedChanges > 0) {
          statGitStatus.textContent = gitInfo.uncommittedChanges + ' Dirty files';
          statGitStatus.style.color = 'var(--warning)';
        } else {
          statGitStatus.textContent = 'Clean (' + (gitInfo.currentBranch || 'HEAD') + ')';
          statGitStatus.style.color = 'var(--success)';
        }

        // Active Tasks overview
        const inProg = tasks.filter(t => t.status === 'In Progress');
        if (inProg.length === 0) {
          overviewActiveTasks.innerHTML = '<div style="opacity: 0.6;">No tasks in progress. Pick one from the board!</div>';
        } else {
          overviewActiveTasks.innerHTML = inProg.map(t => {
            return '<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<span>' + escapeHtml(t.title) + '</span>' +
              '<span style="opacity:0.8;">' + escapeHtml(t.assignee || 'Unassigned') + '</span>' +
            '</div>';
          }).join('');
        }

        // Deliverables overview
        if (deliverables.length === 0) {
          overviewDeliverables.innerHTML = '<div style="opacity: 0.6;">No deliverables defined.</div>';
        } else {
          overviewDeliverables.innerHTML = deliverables.map(d => {
            return '<div style="display:flex; justify-content:space-between; padding:4px 0;">' +
              '<span style="' + (d.completed ? 'text-decoration:line-through; opacity:0.6;' : '') + '">' + (d.completed ? '✅ ' : '⏳ ') + escapeHtml(d.label) + '</span>' +
              '<span style="font-family:var(--font-mono); font-size:11px; opacity:0.7;">' + (d.url ? escapeHtml(d.url) : 'Pending URL') + '</span>' +
            '</div>';
          }).join('');
        }
      }

      function renderKanban() {
        const tasks = state.state?.tasks || [];
        const search = (taskSearchInput.value || '').toLowerCase();
        const pFilter = taskPriorityFilter.value;
        const aFilter = taskAssigneeFilter.value;

        // Populate Assignee filter options dynamically
        const currentAssigneeVal = taskAssigneeFilter.value;
        const allAssignees = Array.from(new Set(tasks.map(t => t.assignee).filter(Boolean)));
        taskAssigneeFilter.innerHTML = '<option value="">All Assignees</option>' +
          allAssignees.map(a => '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>').join('');
        taskAssigneeFilter.value = currentAssigneeVal;

        const cols = ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Done'];
        const colMap = {
          'Backlog': document.getElementById('cards-Backlog'),
          'To Do': document.getElementById('cards-ToDo'),
          'In Progress': document.getElementById('cards-InProgress'),
          'Blocked': document.getElementById('cards-Blocked'),
          'Done': document.getElementById('cards-Done'),
        };
        const countMap = {
          'Backlog': document.getElementById('count-Backlog'),
          'To Do': document.getElementById('count-ToDo'),
          'In Progress': document.getElementById('count-InProgress'),
          'Blocked': document.getElementById('count-Blocked'),
          'Done': document.getElementById('count-Done'),
        };

        cols.forEach(col => {
          if (colMap[col]) colMap[col].innerHTML = '';
          if (countMap[col]) countMap[col].textContent = '0';
        });

        const counts = { 'Backlog': 0, 'To Do': 0, 'In Progress': 0, 'Blocked': 0, 'Done': 0 };

        tasks.forEach(t => {
          if (counts[t.status] !== undefined) counts[t.status]++;

          // Filter checks
          if (search && !t.title.toLowerCase().includes(search) && !(t.description || '').toLowerCase().includes(search)) return;
          if (pFilter && t.priority !== pFilter) return;
          if (aFilter && t.assignee !== aFilter) return;

          const card = document.createElement('div');
          card.className = 'task-card';
          card.innerHTML =
            '<div class="task-title">' + escapeHtml(t.title) + '</div>' +
            '<div class="task-meta">' +
              '<span class="priority-badge priority-' + escapeHtml(t.priority) + '">' + escapeHtml(t.priority) + '</span>' +
              '<span class="task-assignee">👤 ' + escapeHtml(t.assignee || 'Unassigned') + '</span>' +
            '</div>' +
            (t.blockedReason && t.status === 'Blocked' ? '<div class="task-blocked-box">⚠️ ' + escapeHtml(t.blockedReason) + '</div>' : '') +
            (t.relevantFiles && t.relevantFiles.length ? '<div class="task-files">📁 ' + escapeHtml(t.relevantFiles.join(', ')) + '</div>' : '');

          card.addEventListener('click', () => openTaskModal(t));
          if (colMap[t.status]) colMap[t.status].appendChild(card);
        });

        cols.forEach(col => {
          if (countMap[col]) countMap[col].textContent = String(counts[col] || 0);
        });
      }

      function renderMilestones() {
        const milestones = state.state?.milestones || [];
        milestonesList.innerHTML = milestones.map(m => {
          return '<div class="milestone-item">' +
            '<div class="item-left">' +
              '<input type="checkbox" class="item-check" data-id="' + escapeHtml(m.id) + '" ' + (m.completed ? 'checked' : '') + ' ' + (!canMutate() ? 'disabled' : '') + '>' +
              '<div class="item-info">' +
                '<span class="item-title ' + (m.completed ? 'completed' : '') + '">' + escapeHtml(m.title) + '</span>' +
                '<span class="item-desc">' + escapeHtml(m.description) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="item-deadline">Target: ' + escapeHtml(m.targetDeadline) + '</div>' +
          '</div>';
        }).join('');

        // Wire checkbox clicks
        milestonesList.querySelectorAll('.item-check').forEach(chk => {
          chk.addEventListener('change', (e) => {
            const mId = e.target.dataset.id;
            const completed = e.target.checked;
            if (vscode) {
              vscode.postMessage({
                command: 'update_milestone',
                id: mId,
                updates: { completed: completed, completedAt: completed ? Date.now() : null }
              });
            }
          });
        });

        const deliverables = state.state?.deliverables || [];
        deliverablesList.innerHTML = deliverables.map(d => {
          return '<div class="deliverable-item">' +
            '<div class="item-left">' +
              '<input type="checkbox" class="item-check" data-id="' + escapeHtml(d.id) + '" ' + (d.completed ? 'checked' : '') + ' ' + (!canMutate() ? 'disabled' : '') + '>' +
              '<div class="item-info">' +
                '<span class="item-title ' + (d.completed ? 'completed' : '') + '">' + escapeHtml(d.label) + '</span>' +
                (d.url ? '<a href="' + escapeHtml(d.url) + '" style="color:var(--info); font-size:11px;" target="_blank">' + escapeHtml(d.url) + '</a>' : '<span style="font-size:11px; opacity:0.6;">No URL configured</span>') +
              '</div>' +
            '</div>' +
            (canMutate() ? '<button class="secondary btn-edit-deliv" data-id="' + escapeHtml(d.id) + '" style="font-size:11px; padding:3px 8px;">Edit URL</button>' : '') +
          '</div>';
        }).join('');

        deliverablesList.querySelectorAll('.item-check').forEach(chk => {
          chk.addEventListener('change', (e) => {
            const dId = e.target.dataset.id;
            const completed = e.target.checked;
            if (vscode) {
              vscode.postMessage({
                command: 'update_deliverable',
                id: dId,
                updates: { completed: completed }
              });
            }
          });
        });

        deliverablesList.querySelectorAll('.btn-edit-deliv').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const dId = e.target.dataset.id;
            const item = deliverables.find(d => d.id === dId);
            const newUrl = prompt('Enter URL for ' + (item?.label || 'deliverable') + ':', item?.url || '');
            if (newUrl !== null && vscode) {
              vscode.postMessage({
                command: 'update_deliverable',
                id: dId,
                updates: { url: newUrl.trim() }
              });
            }
          });
        });
      }

      function renderPulseAndGit() {
        // Pulse
        const pulse = state.state?.pulse || [];
        if (pulse.length === 0) {
          pulseFeed.innerHTML = '<div style="opacity: 0.6; font-size: 12px;">No activity logged yet.</div>';
        } else {
          pulseFeed.innerHTML = pulse.map(p => {
            const d = new Date(p.timestamp);
            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return '<div class="pulse-item">' +
              '<div><strong>' + escapeHtml(p.author || 'System') + ':</strong> ' + escapeHtml(p.message) + '</div>' +
              '<div class="pulse-time">' + timeStr + '</div>' +
            '</div>';
          }).join('');
        }

        // Git Guardian
        const g = state.gitInfo;
        if (!g || !g.isGitRepo) {
          gitBranch.textContent = 'None';
          gitUncommitted.textContent = '0';
          gitConflicts.textContent = '0';
          gitOverlapsCount.textContent = '0';
          gitChangedList.innerHTML = '<div style="opacity: 0.6;">' + escapeHtml(g?.errorMessage || 'Not a git repo') + '</div>';
          gitCommitList.innerHTML = '<div style="opacity: 0.6;">-</div>';
          gitOverlapAlerts.innerHTML = '';
          return;
        }

        gitBranch.textContent = g.currentBranch || 'HEAD';
        gitUncommitted.textContent = String(g.uncommittedChanges || 0);
        gitConflicts.textContent = String(g.unresolvedConflicts ? g.unresolvedConflicts.length : 0);
        gitOverlapsCount.textContent = String(g.potentialOverlaps ? g.potentialOverlaps.length : 0);

        if (g.potentialOverlaps && g.potentialOverlaps.length > 0) {
          gitOverlapAlerts.innerHTML = '<div class="overlap-alert">' +
            '<strong>⚠️ Git Guardian Warning: Potential File Collision Detected!</strong>' +
            g.potentialOverlaps.map(o => '<div>• File <code>' + escapeHtml(o.file) + '</code> is also assigned to <strong>' + escapeHtml(o.assignee) + '</strong> in task: "' + escapeHtml(o.taskTitle) + '"</div>').join('') +
          '</div>';
        } else {
          gitOverlapAlerts.innerHTML = '';
        }

        if (g.changedFiles && g.changedFiles.length > 0) {
          gitChangedList.innerHTML = g.changedFiles.map(f => '<div>• ' + escapeHtml(f) + '</div>').join('');
        } else {
          gitChangedList.innerHTML = '<div style="opacity: 0.6;">Working directory clean.</div>';
        }

        if (g.recentCommits && g.recentCommits.length > 0) {
          gitCommitList.innerHTML = g.recentCommits.map(c => '<div><code style="color:var(--info);">' + escapeHtml(c.hash) + '</code> ' + escapeHtml(c.message) + '</div>').join('');
        } else {
          gitCommitList.innerHTML = '<div style="opacity: 0.6;">No commits found.</div>';
        }
      }

      function renderNotes() {
        const n = state.state?.notes || {};
        noteProblem.value = n.problemStatement || '';
        noteSolution.value = n.proposedSolution || '';
        noteArchitecture.value = n.architectureDecisions || '';
        noteApis.value = n.apiContracts || '';
        noteRisks.value = n.knownRisks || '';
        noteDemoScript.value = n.demoScript || '';

        const disabled = !canMutate();
        [noteProblem, noteSolution, noteArchitecture, noteApis, noteRisks, noteDemoScript].forEach(el => {
          el.disabled = disabled;
        });
      }

      function renderSetup() {
        const s = state.state?.setup || {};
        setupHackathonName.value = s.hackathonName || '';
        setupProjectName.value = s.projectName || '';
        setupDescription.value = s.description || '';
        setupRepoUrl.value = s.repositoryUrl || '';
        setupStartTime.value = s.startTime ? s.startTime.slice(0, 16) : '';
        setupDeadline.value = s.deadline ? s.deadline.slice(0, 16) : '';
        setupTeamMembers.value = (s.teamMembers || []).join(', ');
        setupGoals.value = (s.goals || []).join(', ');

        const disabled = !isHost();
        [setupHackathonName, setupProjectName, setupDescription, setupRepoUrl, setupStartTime, setupDeadline, setupTeamMembers, setupGoals].forEach(el => {
          el.disabled = disabled;
        });
        if (disabled) {
          setupHostNotice.textContent = '🔒 Settings are read-only. Only session hosts can edit configuration.';
          setupHostNotice.style.color = 'var(--warning)';
        } else {
          setupHostNotice.textContent = 'You are the host. Configure team parameters and deadline here.';
          setupHostNotice.style.color = 'var(--fg)';
        }
      }

      function renderAll() {
        renderHeader();
        renderRecommendations();
        renderStats();
        renderKanban();
        renderMilestones();
        renderPulseAndGit();
        renderNotes();
        renderSetup();
      }

      // Modal Handlers
      function openTaskModal(task) {
        if (!canMutate()) {
          alert('You must have edit access to modify tasks.');
          return;
        }
        modalBlockedGroup.style.display = 'none';

        if (task) {
          modalTaskTitleText.textContent = 'Edit Task';
          modalTaskId.value = task.id;
          modalTaskTitle.value = task.title || '';
          modalTaskDesc.value = task.description || '';
          modalTaskStatus.value = task.status || 'To Do';
          modalTaskPriority.value = task.priority || 'Medium';
          modalTaskAssignee.value = task.assignee || '';
          modalTaskMilestone.value = task.milestoneId || '';
          modalTaskCriteria.value = task.acceptanceCriteria || '';
          modalTaskBlockedReason.value = task.blockedReason || '';
          modalTaskFiles.value = (task.relevantFiles || []).join(', ');
          btnModalDelete.style.display = 'inline-flex';

          if (task.status === 'Blocked') {
            modalBlockedGroup.style.display = 'flex';
          }
        } else {
          modalTaskTitleText.textContent = 'Create Task';
          modalTaskId.value = '';
          modalTaskTitle.value = '';
          modalTaskDesc.value = '';
          modalTaskStatus.value = 'To Do';
          modalTaskPriority.value = 'Medium';
          modalTaskAssignee.value = state.userName || '';
          modalTaskMilestone.value = '';
          modalTaskCriteria.value = '';
          modalTaskBlockedReason.value = '';
          modalTaskFiles.value = '';
          btnModalDelete.style.display = 'none';
        }

        taskModalBackdrop.classList.add('open');
      }

      function closeTaskModal() {
        taskModalBackdrop.classList.remove('open');
      }

      modalTaskStatus.addEventListener('change', () => {
        if (modalTaskStatus.value === 'Blocked') {
          modalBlockedGroup.style.display = 'flex';
        } else {
          modalBlockedGroup.style.display = 'none';
        }
      });

      btnNewTask.addEventListener('click', () => openTaskModal(null));
      btnModalClose.addEventListener('click', closeTaskModal);
      btnModalCancel.addEventListener('click', closeTaskModal);

      btnModalSave.addEventListener('click', () => {
        const title = modalTaskTitle.value.trim();
        if (!title) {
          alert('Task title is required.');
          return;
        }

        const status = modalTaskStatus.value;
        const priority = modalTaskPriority.value;
        const assignee = modalTaskAssignee.value.trim();
        const milestoneId = modalTaskMilestone.value;
        const acceptanceCriteria = modalTaskCriteria.value.trim();
        const blockedReason = modalTaskBlockedReason.value.trim();
        const relevantFiles = modalTaskFiles.value.split(',').map(s => s.trim()).filter(Boolean);

        const taskId = modalTaskId.value;
        if (taskId) {
          if (vscode) {
            vscode.postMessage({
              command: 'update_task',
              id: taskId,
              updates: {
                title,
                description: modalTaskDesc.value.trim(),
                status,
                priority,
                assignee,
                milestoneId,
                acceptanceCriteria,
                blockedReason,
                relevantFiles
              }
            });
          }
        } else {
          if (vscode) {
            vscode.postMessage({
              command: 'create_task',
              task: {
                title,
                description: modalTaskDesc.value.trim(),
                status,
                priority,
                assignee,
                milestoneId,
                acceptanceCriteria,
                blockedReason,
                relevantFiles
              }
            });
          }
        }
        closeTaskModal();
      });

      btnModalDelete.addEventListener('click', () => {
        const taskId = modalTaskId.value;
        if (!taskId) return;
        if (confirm('Are you sure you want to delete this task?')) {
          if (vscode) {
            vscode.postMessage({ command: 'delete_task', id: taskId });
          }
          closeTaskModal();
        }
      });

      // Filter events
      taskSearchInput.addEventListener('input', renderKanban);
      taskPriorityFilter.addEventListener('change', renderKanban);
      taskAssigneeFilter.addEventListener('change', renderKanban);

      // Save Notes
      btnSaveNotes.addEventListener('click', () => {
        if (vscode) {
          vscode.postMessage({
            command: 'update_notes',
            notes: {
              problemStatement: noteProblem.value,
              proposedSolution: noteSolution.value,
              architectureDecisions: noteArchitecture.value,
              apiContracts: noteApis.value,
              knownRisks: noteRisks.value,
              demoScript: noteDemoScript.value
            }
          });
        }
      });

      // Save Setup
      btnSaveSetup.addEventListener('click', () => {
        const teamMembers = setupTeamMembers.value.split(',').map(s => s.trim()).filter(Boolean);
        const goals = setupGoals.value.split(',').map(s => s.trim()).filter(Boolean);
        if (vscode) {
          vscode.postMessage({
            command: 'update_setup',
            setup: {
              hackathonName: setupHackathonName.value.trim(),
              projectName: setupProjectName.value.trim(),
              description: setupDescription.value.trim(),
              repositoryUrl: setupRepoUrl.value.trim(),
              startTime: setupStartTime.value,
              deadline: setupDeadline.value,
              teamMembers,
              goals
            }
          });
        }
      });

      // Refresh / Actions
      btnRefresh.addEventListener('click', () => {
        if (vscode) vscode.postMessage({ command: 'refresh' });
      });

      btnRefreshGit.addEventListener('click', () => {
        if (vscode) vscode.postMessage({ command: 'refresh_git' });
      });

      btnRequestEdit.addEventListener('click', () => {
        if (vscode) vscode.postMessage({ command: 'request_edit_access' });
      });

      // Message Receiver from Extension Host
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'sync') {
          state.state = msg.state;
          state.recommendations = msg.recommendations || [];
          if (msg.userRole !== undefined) state.userRole = msg.userRole;
          if (msg.canEdit !== undefined) state.canEdit = msg.canEdit;
          if (msg.sessionCode !== undefined) state.sessionCode = msg.sessionCode;
          if (msg.userName !== undefined) state.userName = msg.userName;
          renderAll();
        } else if (msg.type === 'git_info') {
          state.gitInfo = msg.gitInfo;
          renderPulseAndGit();
          renderStats();
        }
      });

      // Initial Render
      renderAll();
    })();
  </script>
</body>
</html>`;
}
