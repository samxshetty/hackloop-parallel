import { DashboardState } from './types';

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

export function renderDashboardHtml(initialState: DashboardState): string {
  const nonce = getNonce();
  const safeStateJson = escapeJsonForHtml(initialState);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Parallel Admin Dashboard</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
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
      --font-mono: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
      --font-ui: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-ui);
      font-size: 13px;
      line-height: 1.4;
      padding: 16px 20px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
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
    .header-actions {
      display: flex;
      gap: 8px;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.1s;
    }
    button:hover { background: var(--btn-hover); }
    button.sec {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
    }
    button.sec:hover { background: #4a4d52; }
    button.danger {
      background: var(--btn-danger);
    }
    button.danger:hover { background: var(--btn-danger-hover); }
    button.success {
      background: #238636;
    }
    button.success:hover { background: #2ea043; }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }
    .badge-active { background: rgba(63, 185, 80, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-idle { background: rgba(210, 153, 34, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .badge-disconnected { background: rgba(248, 81, 73, 0.2); color: var(--danger); border: 1px solid var(--danger); }
    .badge-superhost { background: #6f42c1; color: #fff; }
    .badge-host { background: #1f6feb; color: #fff; }
    .badge-guest { background: #388bfd33; color: #58a6ff; }
    .badge-edit-true { background: rgba(63, 185, 80, 0.25); color: #7ee787; }
    .badge-edit-false { background: rgba(110, 118, 129, 0.2); color: #8b949e; }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 600;
      color: #8b949e;
      text-transform: uppercase;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .card-value {
      font-size: 20px;
      font-weight: 700;
      font-family: var(--font-mono);
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .card-subtitle {
      font-size: 11px;
      color: #8b949e;
      margin-top: 4px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section {
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: rgba(255, 255, 255, 0.03);
      color: #8b949e;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .code-pill {
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
    .alert-banner {
      background: rgba(210, 153, 34, 0.15);
      border: 1px solid var(--warning);
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .alert-text {
      font-size: 12px;
      color: #f0f6fc;
    }
    .timeline-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      max-height: 260px;
      overflow-y: auto;
      padding: 8px 12px;
    }
    .timeline-item {
      display: flex;
      gap: 12px;
      padding: 6px 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
      align-items: baseline;
    }
    .timeline-item:last-child {
      border-bottom: none;
    }
    .timeline-time {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #8b949e;
      min-width: 60px;
      flex-shrink: 0;
    }
    .timeline-desc {
      flex: 1;
    }
    .empty-state {
      padding: 24px;
      text-align: center;
      color: #8b949e;
      font-size: 12px;
    }
    .nav-tabs {
      display: flex;
      gap: 6px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .nav-tab {
      background: transparent;
      color: #8b949e;
      border: none;
      border-bottom: 2px solid transparent;
      padding: 8px 14px;
      border-radius: 0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .nav-tab:hover {
      color: var(--fg);
      background: transparent;
    }
    .nav-tab.active {
      color: var(--fg);
      border-bottom-color: var(--btn-bg);
      font-weight: 600;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
    }
    .dot-green { background: var(--success); box-shadow: 0 0 6px rgba(63, 185, 80, 0.5); }
    .dot-yellow { background: var(--warning); }
    .dot-red { background: var(--danger); }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <div class="header-title">
        <span class="status-dot" id="header-status-dot"></span>
        Parallel Admin Dashboard
      </div>
      <span class="badge" id="header-status-badge">Disconnected</span>
      <span class="code-pill" id="header-session-code">No Session</span>
    </div>
    <div class="header-actions">
      <button class="sec" id="btn-reconnect" title="Reconnect WebSocket">🔄 Reconnect</button>
      <button class="sec" id="btn-refresh" title="Refresh Dashboard">Refresh</button>
    </div>
  </header>

  <nav class="nav-tabs">
    <button class="nav-tab active" data-tab="tab-overview">Live Overview</button>
    <button class="nav-tab" data-tab="tab-participants">Participants & Permissions</button>
    <button class="nav-tab" data-tab="tab-timeline">Activity Timeline</button>
    <button class="nav-tab" data-tab="tab-replays">Replay Center</button>
    <button class="nav-tab" data-tab="tab-health">System Health</button>
  </nav>

  <!-- TAB 1: OVERVIEW -->
  <div class="tab-content active" id="tab-overview">
    <div class="grid-4">
      <div class="card">
        <div class="card-title">Session Code</div>
        <div class="card-value" id="card-session-code">------</div>
        <div class="card-subtitle" id="card-session-status">No active session</div>
      </div>
      <div class="card">
        <div class="card-title">Session Host</div>
        <div class="card-value" id="card-session-host">-</div>
        <div class="card-subtitle" id="card-my-role">Your Role: None</div>
      </div>
      <div class="card">
        <div class="card-title">Connected Users</div>
        <div class="card-value" id="card-participant-count">0</div>
        <div class="card-subtitle" id="card-editors-count">0 Editors</div>
      </div>
      <div class="card">
        <div class="card-title">Session Duration</div>
        <div class="card-value" id="card-session-duration">00:00:00</div>
        <div class="card-subtitle" id="card-duration-sub">Timer stopped</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Pending Edit Requests</div>
        <div id="overview-pending-container">
          <div class="empty-state">No pending requests</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent Live Activity</div>
        <div class="timeline-container" id="overview-recent-timeline" style="max-height: 140px;">
          <div class="empty-state">No recent activity</div>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: PARTICIPANTS & PERMISSIONS -->
  <div class="tab-content" id="tab-participants">
    <div id="pending-requests-banner-container"></div>
    <div class="section">
      <div class="section-header">
        <div class="section-title">Connected Participants</div>
        <div id="admin-notice" style="font-size: 11px; color: #8b949e;"></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Editing Access</th>
            <th>Connection</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="participants-table-body">
          <tr><td colspan="5" class="empty-state">Nobody has joined this session yet.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- TAB 3: TIMELINE -->
  <div class="tab-content" id="tab-timeline">
    <div class="section">
      <div class="section-header">
        <div class="section-title">Session Activity Log</div>
        <button class="sec" id="btn-clear-timeline" style="font-size: 11px; padding: 2px 8px;">Clear View</button>
      </div>
      <div class="timeline-container" id="full-timeline-container" style="max-height: 450px;">
        <div class="empty-state">No events recorded in this session.</div>
      </div>
    </div>
  </div>

  <!-- TAB 4: REPLAY CENTER -->
  <div class="tab-content" id="tab-replays">
    <div class="section">
      <div class="section-header">
        <div class="section-title">Saved Session Recordings</div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="replay-search" placeholder="Filter by code or user..." style="background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: var(--fg); padding: 4px 8px; border-radius: 4px; font-size: 12px; width: 180px;">
          <button class="sec" id="btn-refresh-replays" style="font-size: 11px; padding: 4px 8px;">🔄 Refresh List</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Recording ID</th>
            <th>Code</th>
            <th>Date & Time</th>
            <th>Duration</th>
            <th>Participants</th>
            <th>Snapshots</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="replays-table-body">
          <tr><td colspan="7" class="empty-state">Loading recordings...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- TAB 5: SYSTEM HEALTH -->
  <div class="tab-content" id="tab-health">
    <div class="grid-2">
      <div class="card">
        <div class="card-title">WebSocket Server</div>
        <div class="card-value" id="health-server-status" style="font-size: 16px;">Checking...</div>
        <div class="card-subtitle" id="health-server-url">-</div>
        <div style="margin-top: 12px;">
          <button class="sec" id="btn-health-reconnect">Reconnect</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Latency & Roundtrip</div>
        <div class="card-value" id="health-latency">-</div>
        <div class="card-subtitle" id="health-latency-sub">Ping response time</div>
      </div>
      <div class="card">
        <div class="card-title">Session State</div>
        <div class="card-value" id="health-session-status" style="font-size: 16px;">-</div>
        <div class="card-subtitle" id="health-auth-status">Superhost: No</div>
      </div>
      <div class="card">
        <div class="card-title">Recordings Storage</div>
        <div class="card-value" id="health-replays-count">0 Replays</div>
        <div class="card-subtitle">Stored under server/recordings/</div>
      </div>
    </div>
    <div class="card" style="margin-top: 12px;">
      <div class="card-title">Diagnostic Messages & Errors</div>
      <div id="health-error-log" style="font-family: var(--font-mono); font-size: 11px; color: #8b949e; min-height: 40px;">
        All systems operational.
      </div>
    </div>
  </div>

  <script id="dashboard-init-state" type="application/json">
    ${safeStateJson}
  </script>

  <script nonce="${nonce}">
    (function () {
      const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      const initEl = document.getElementById('dashboard-init-state');
      let state = initEl ? JSON.parse(initEl.textContent || '{}') : {};

      // DOM Elements
      const headerStatusDot = document.getElementById('header-status-dot');
      const headerStatusBadge = document.getElementById('header-status-badge');
      const headerSessionCode = document.getElementById('header-session-code');
      const btnReconnect = document.getElementById('btn-reconnect');
      const btnRefresh = document.getElementById('btn-refresh');

      const cardSessionCode = document.getElementById('card-session-code');
      const cardSessionStatus = document.getElementById('card-session-status');
      const cardSessionHost = document.getElementById('card-session-host');
      const cardMyRole = document.getElementById('card-my-role');
      const cardParticipantCount = document.getElementById('card-participant-count');
      const cardEditorsCount = document.getElementById('card-editors-count');
      const cardSessionDuration = document.getElementById('card-session-duration');
      const cardDurationSub = document.getElementById('card-duration-sub');

      const overviewPendingContainer = document.getElementById('overview-pending-container');
      const overviewRecentTimeline = document.getElementById('overview-recent-timeline');
      const pendingBannerContainer = document.getElementById('pending-requests-banner-container');
      const adminNotice = document.getElementById('admin-notice');
      const participantsTableBody = document.getElementById('participants-table-body');
      const fullTimelineContainer = document.getElementById('full-timeline-container');
      const btnClearTimeline = document.getElementById('btn-clear-timeline');

      const replaysTableBody = document.getElementById('replays-table-body');
      const replaySearch = document.getElementById('replay-search');
      const btnRefreshReplays = document.getElementById('btn-refresh-replays');

      const healthServerStatus = document.getElementById('health-server-status');
      const healthServerUrl = document.getElementById('health-server-url');
      const healthLatency = document.getElementById('health-latency');
      const healthSessionStatus = document.getElementById('health-session-status');
      const healthAuthStatus = document.getElementById('health-auth-status');
      const healthReplaysCount = document.getElementById('health-replays-count');
      const healthErrorLog = document.getElementById('health-error-log');
      const btnHealthReconnect = document.getElementById('btn-health-reconnect');

      // Tabs Navigation
      const navTabs = document.querySelectorAll('.nav-tab');
      navTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          navTabs.forEach(function (t) { t.classList.remove('active'); });
          document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
          tab.classList.add('active');
          const target = document.getElementById(tab.dataset.tab);
          if (target) target.classList.add('active');
        });
      });

      // Helpers
      function formatDuration(ms) {
        if (!ms || ms < 0) return '00:00:00';
        const sec = Math.floor(ms / 1000);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }

      function formatTime(ts) {
        if (!ts) return '--:--:--';
        const d = new Date(ts);
        return d.toTimeString().split(' ')[0];
      }

      function formatDate(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toTimeString().split(' ')[0];
      }

      // Render Functions
      function render() {
        const isSuperhost = state.currentUser?.isSuperhost || state.session?.role === 'superhost';
        const isConnected = state.health?.serverConnected;
        const isActive = state.session?.status === 'active';

        // Header
        headerStatusDot.className = 'status-dot ' + (isActive ? 'dot-green' : (isConnected ? 'dot-yellow' : 'dot-red'));
        headerStatusBadge.textContent = isActive ? 'Active' : (isConnected ? 'Idle' : 'Disconnected');
        headerStatusBadge.className = 'badge ' + (isActive ? 'badge-active' : (isConnected ? 'badge-idle' : 'badge-disconnected'));
        headerSessionCode.textContent = state.session?.code ? 'Session: ' + state.session.code : 'No Session';

        // Overview Cards
        cardSessionCode.textContent = state.session?.code || '------';
        cardSessionStatus.textContent = isActive ? 'Live Session Active' : 'No active session';
        cardSessionHost.textContent = state.session?.host || '-';
        cardMyRole.textContent = 'You: ' + (state.session?.role || 'Spectator');
        cardParticipantCount.textContent = String(state.session?.connectedCount || (state.participants || []).length);

        const editorsCount = (state.participants || []).filter(function (p) { return p.canEdit || p.role === 'superhost' || p.role === 'host'; }).length;
        cardEditorsCount.textContent = editorsCount + ' Editor' + (editorsCount === 1 ? '' : 's');

        if (isActive && state.session?.startedAt) {
          cardSessionDuration.textContent = formatDuration(Date.now() - state.session.startedAt);
          cardDurationSub.textContent = 'Started at ' + formatTime(state.session.startedAt);
        } else {
          cardSessionDuration.textContent = '00:00:00';
          cardDurationSub.textContent = 'Session inactive';
        }

        // Pending Requests (Superhost view)
        renderPendingRequests(isSuperhost);

        // Participants Table
        renderParticipants(isSuperhost);

        // Timeline
        renderTimeline();

        // Replay Center
        renderReplays();

        // System Health
        renderHealth(isConnected, isSuperhost);
      }

      function renderPendingRequests(isSuperhost) {
        const pending = state.pendingRequests || [];
        overviewPendingContainer.innerHTML = '';
        pendingBannerContainer.innerHTML = '';

        if (pending.length === 0) {
          overviewPendingContainer.innerHTML = '<div class="empty-state">No pending edit requests</div>';
          return;
        }

        pending.forEach(function (req) {
          // Banner for tab 2
          const banner = document.createElement('div');
          banner.className = 'alert-banner';
          banner.innerHTML = '<div class="alert-text"><strong>' + escapeHtml(req.name) + '</strong> requested live edit access.</div>';
          const actions = document.createElement('div');
          actions.style.display = 'flex';
          actions.style.gap = '8px';

          const btnApprove = document.createElement('button');
          btnApprove.className = 'success';
          btnApprove.textContent = '✓ Approve';
          btnApprove.disabled = !isSuperhost;
          btnApprove.addEventListener('click', function () {
            if (vscode) vscode.postMessage({ command: 'approveRequest', name: req.name });
          });

          const btnReject = document.createElement('button');
          btnReject.className = 'danger';
          btnReject.textContent = '✕ Reject';
          btnReject.disabled = !isSuperhost;
          btnReject.addEventListener('click', function () {
            if (vscode) vscode.postMessage({ command: 'rejectRequest', name: req.name });
          });

          actions.appendChild(btnApprove);
          actions.appendChild(btnReject);
          banner.appendChild(actions);
          pendingBannerContainer.appendChild(banner);

          // Card in overview
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '8px 0';
          item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
          item.innerHTML = '<span>' + escapeHtml(req.name) + ' <small style="color:#8b949e">(' + formatTime(req.requestedAt) + ')</small></span>';
          item.appendChild(actions.cloneNode(true));
          // Attach listeners to cloned buttons
          const btns = item.querySelectorAll('button');
          if (btns[0]) btns[0].addEventListener('click', function () {
            if (vscode) vscode.postMessage({ command: 'approveRequest', name: req.name });
          });
          if (btns[1]) btns[1].addEventListener('click', function () {
            if (vscode) vscode.postMessage({ command: 'rejectRequest', name: req.name });
          });
          overviewPendingContainer.appendChild(item);
        });
      }

      function renderParticipants(isSuperhost) {
        adminNotice.textContent = isSuperhost
          ? '✓ Admin Mode: You have superhost permissions to manage edit access.'
          : 'Viewing as ' + (state.session?.role || 'Guest') + ' (Administrative controls require Superhost).';

        participantsTableBody.innerHTML = '';
        const list = state.participants || [];

        if (list.length === 0) {
          participantsTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No participants currently in session.</td></tr>';
          return;
        }

        list.forEach(function (p) {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.innerHTML = '<strong>' + escapeHtml(p.name) + '</strong>' + (p.isSelf ? ' <small style="color:var(--info)">(You)</small>' : '');
          tr.appendChild(tdName);

          // Role
          const tdRole = document.createElement('td');
          const roleClass = p.role === 'superhost' ? 'badge-superhost' : (p.role === 'host' ? 'badge-host' : 'badge-guest');
          tdRole.innerHTML = '<span class="badge ' + roleClass + '">' + escapeHtml(p.role) + '</span>';
          tr.appendChild(tdRole);

          // Edit Permission
          const tdEdit = document.createElement('td');
          const hasEdit = p.canEdit || p.role === 'superhost' || p.role === 'host';
          const editClass = hasEdit ? 'badge-edit-true' : 'badge-edit-false';
          tdEdit.innerHTML = '<span class="badge ' + editClass + '">' + (hasEdit ? 'Can Edit' : 'Read Only') + '</span>';
          tr.appendChild(tdEdit);

          // Connection status
          const tdConn = document.createElement('td');
          tdConn.innerHTML = '<span style="color:' + (p.status === 'connected' ? 'var(--success)' : 'var(--danger)') + '">● ' + escapeHtml(p.status) + '</span>';
          tr.appendChild(tdConn);

          // Actions
          const tdActions = document.createElement('td');
          if (p.role === 'superhost') {
            tdActions.innerHTML = '<span style="color:#8b949e; font-size:11px;">Owner</span>';
          } else if (isSuperhost) {
            if (p.canEdit) {
              const btnRevoke = document.createElement('button');
              btnRevoke.className = 'danger';
              btnRevoke.style.fontSize = '11px';
              btnRevoke.style.padding = '2px 8px';
              btnRevoke.textContent = 'Revoke Edit';
              btnRevoke.addEventListener('click', function () {
                if (vscode) vscode.postMessage({ command: 'revokeEdit', name: p.name });
              });
              tdActions.appendChild(btnRevoke);
            } else {
              const btnGrant = document.createElement('button');
              btnGrant.className = 'sec';
              btnGrant.style.fontSize = '11px';
              btnGrant.style.padding = '2px 8px';
              btnGrant.textContent = 'Grant Edit';
              btnGrant.addEventListener('click', function () {
                if (vscode) vscode.postMessage({ command: 'grantEdit', name: p.name });
              });
              tdActions.appendChild(btnGrant);
            }
          } else {
            tdActions.innerHTML = '<span style="color:#8b949e; font-size:11px;">-</span>';
          }
          tr.appendChild(tdActions);

          participantsTableBody.appendChild(tr);
        });
      }

      function renderTimeline() {
        const events = state.timeline || [];
        fullTimelineContainer.innerHTML = '';
        overviewRecentTimeline.innerHTML = '';

        if (events.length === 0) {
          fullTimelineContainer.innerHTML = '<div class="empty-state">No events recorded in this session.</div>';
          overviewRecentTimeline.innerHTML = '<div class="empty-state">No recent activity.</div>';
          return;
        }

        // Render full timeline (reversed so newest first)
        const reversed = events.slice().reverse();
        reversed.forEach(function (ev) {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          item.innerHTML = '<span class="timeline-time">' + formatTime(ev.timestamp) + '</span>' +
            '<span class="timeline-desc">' + (ev.isLive ? '<span class="badge" style="background:#238636;color:#fff;font-size:9px;padding:1px 4px;margin-right:6px;">LIVE</span>' : '') + escapeHtml(ev.description) + '</span>';
          fullTimelineContainer.appendChild(item);
        });

        // Render recent in overview (top 5)
        reversed.slice(0, 5).forEach(function (ev) {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          item.innerHTML = '<span class="timeline-time">' + formatTime(ev.timestamp) + '</span>' +
            '<span class="timeline-desc">' + escapeHtml(ev.description) + '</span>';
          overviewRecentTimeline.appendChild(item);
        });
      }

      function renderReplays() {
        const replays = state.replays || [];
        const filter = (replaySearch.value || '').trim().toLowerCase();
        replaysTableBody.innerHTML = '';

        const filtered = replays.filter(function (r) {
          if (!filter) return true;
          return (r.code && r.code.toLowerCase().includes(filter)) ||
            (r.id && r.id.toLowerCase().includes(filter)) ||
            (r.participants && r.participants.some(function (p) { return p.toLowerCase().includes(filter); }));
        });

        if (filtered.length === 0) {
          replaysTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No authorized recordings found matching criteria.</td></tr>';
          return;
        }

        filtered.forEach(function (r) {
          const tr = document.createElement('tr');

          // ID
          const tdId = document.createElement('td');
          tdId.innerHTML = '<span class="code-pill">' + escapeHtml(r.id) + '</span>';
          tr.appendChild(tdId);

          // Code
          const tdCode = document.createElement('td');
          tdCode.textContent = r.code || '-';
          tr.appendChild(tdCode);

          // Date & Time
          const tdDate = document.createElement('td');
          tdDate.textContent = formatDate(r.startedAt);
          tr.appendChild(tdDate);

          // Duration
          const tdDur = document.createElement('td');
          tdDur.textContent = formatDuration(r.duration || (r.endedAt - r.startedAt));
          tr.appendChild(tdDur);

          // Participants
          const tdParts = document.createElement('td');
          tdParts.textContent = (r.participants || []).join(', ') || 'None';
          tr.appendChild(tdParts);

          // Snapshots
          const tdSnap = document.createElement('td');
          tdSnap.textContent = (r.snapshotCount || 0) + ' snapshots (' + (r.eventCount || 0) + ' events)';
          tr.appendChild(tdSnap);

          // Action
          const tdAct = document.createElement('td');
          const btnOpen = document.createElement('button');
          btnOpen.className = 'sec';
          btnOpen.style.fontSize = '11px';
          btnOpen.style.padding = '3px 8px';
          btnOpen.textContent = '▶ Open Replay';
          btnOpen.addEventListener('click', function () {
            if (vscode) vscode.postMessage({ command: 'openReplay', id: r.id });
          });
          tdAct.appendChild(btnOpen);
          tr.appendChild(tdAct);

          replaysTableBody.appendChild(tr);
        });
      }

      function renderHealth(isConnected, isSuperhost) {
        healthServerStatus.innerHTML = isConnected
          ? '<span style="color:var(--success)">● Online</span>'
          : '<span style="color:var(--danger)">● Offline</span>';
        healthServerUrl.textContent = state.health?.serverUrl || 'ws://localhost:8080';

        healthLatency.textContent = isConnected
          ? (state.health?.latencyMs !== null ? state.health.latencyMs + ' ms' : '< 10 ms')
          : 'Disconnected';

        healthSessionStatus.textContent = state.session?.status === 'active'
          ? 'Active Session (' + state.session.code + ')'
          : 'Idle (No Session)';

        healthAuthStatus.textContent = 'Superhost: ' + (isSuperhost ? 'YES' : 'NO') + ' · User: ' + (state.currentUser?.name || 'Guest');
        healthReplaysCount.textContent = (state.replays || []).length + ' Replays Loaded';

        if (state.health?.lastError) {
          healthErrorLog.innerHTML = '<span style="color:var(--danger)">' + escapeHtml(state.health.lastError) + '</span>';
        } else {
          healthErrorLog.textContent = 'All services responding normally.';
        }
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      // Action Handlers
      btnRefresh.addEventListener('click', function () {
        if (vscode) vscode.postMessage({ command: 'refresh' });
      });

      btnReconnect.addEventListener('click', function () {
        if (vscode) vscode.postMessage({ command: 'reconnect' });
      });

      btnHealthReconnect.addEventListener('click', function () {
        if (vscode) vscode.postMessage({ command: 'reconnect' });
      });

      btnRefreshReplays.addEventListener('click', function () {
        if (vscode) vscode.postMessage({ command: 'refreshReplays' });
      });

      replaySearch.addEventListener('input', function () {
        renderReplays();
      });

      btnClearTimeline.addEventListener('click', function () {
        state.timeline = [];
        renderTimeline();
      });

      // Listen for Live Updates from VS Code Extension
      window.addEventListener('message', function (event) {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'update') {
          state = msg.state;
          render();
        } else if (msg.type === 'replays') {
          state.replays = msg.replays;
          renderReplays();
        } else if (msg.type === 'pong') {
          if (state.health) {
            state.health.latencyMs = msg.latencyMs;
            renderHealth(state.health.serverConnected, state.currentUser?.isSuperhost);
          }
        }
      });

      // Live Duration Ticker (every 1 second)
      setInterval(function () {
        if (state.session?.status === 'active' && state.session?.startedAt) {
          cardSessionDuration.textContent = formatDuration(Date.now() - state.session.startedAt);
        }
      }, 1000);

      // Initial Render
      render();
    })();
  </script>
</body>
</html>`;
}
