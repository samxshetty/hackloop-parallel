import { ReplayData } from './types';

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

export function renderReplayHtml(data: ReplayData, isStandalone = false): string {
  const nonce = getNonce();
  const safeDataJson = escapeJsonForHtml(data);
  const totalMs = Math.max(0, (data.endedAt || Date.now()) - (data.startedAt || Date.now()));

  const cspMeta = isStandalone
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">`
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  <title>Session Replay: ${data.code}</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --line-num: var(--vscode-editorLineNumber-foreground, #858585);
      --border: var(--vscode-panel-border, #333333);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-secondary: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --active-bg: var(--vscode-list-activeSelectionBackground, #094771);
      --hover-bg: var(--vscode-list-hoverBackground, #2a2d2e);
      --font-mono: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
      --font-ui: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      --col-join: #4caf50;
      --col-suggest: #2196f3;
      --col-accept: #00bfa5;
      --col-reject: #f44336;
      --col-role: #ff9800;
      --col-session: #9e9e9e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--font-ui);
      font-size: 13px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      gap: 16px;
    }
    .header-title {
      font-weight: 600;
      font-size: 14px;
    }
    .summary-card {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .summary-badge {
      font-size: 11px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      padding: 3px 8px;
      border-radius: 4px;
      color: var(--fg);
      font-variant-numeric: tabular-nums;
    }
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .code-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid var(--border);
    }
    .code-header {
      padding: 6px 12px;
      font-size: 12px;
      color: var(--line-num);
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
    }
    .code-view {
      flex: 1;
      overflow: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 19px;
      padding: 8px 0;
    }
    .code-line {
      display: flex;
      min-height: 19px;
      white-space: pre;
    }
    @keyframes fadeHighlight {
      0% { background-color: rgba(76, 175, 80, 0.4); }
      100% { background-color: transparent; }
    }
    .code-line.line-changed {
      animation: fadeHighlight 1.5s ease-out forwards;
    }
    .line-number {
      width: 45px;
      padding-right: 12px;
      text-align: right;
      color: var(--line-num);
      user-select: none;
      flex-shrink: 0;
    }
    .line-content {
      flex: 1;
      white-space: pre;
    }
    .sidebar {
      width: 320px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.05);
    }
    .sidebar-header {
      padding: 8px 12px;
      font-weight: 600;
      font-size: 12px;
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--line-num);
    }
    .event-feed {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .event-item {
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      cursor: pointer;
      border-left: 3px solid transparent;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .event-item:hover {
      background: var(--hover-bg);
    }
    .event-item.active {
      background: var(--active-bg);
    }
    .event-item.type-joined { border-left-color: var(--col-join); }
    .event-item.type-suggest { border-left-color: var(--col-suggest); }
    .event-item.type-suggest_accepted { border-left-color: var(--col-accept); }
    .event-item.type-suggest_rejected { border-left-color: var(--col-reject); }
    .event-item.type-denied { border-left-color: var(--col-reject); }
    .event-item.type-role_change { border-left-color: var(--col-role); }
    .event-item.type-session_start, .event-item.type-session_end { border-left-color: var(--col-session); }
    .event-time {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--line-num);
      min-width: 40px;
      flex-shrink: 0;
    }
    .event-body {
      flex: 1;
      overflow: hidden;
    }
    .event-title {
      font-size: 12px;
      font-weight: 500;
    }
    .event-preview {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--line-num);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
    .controls-panel {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--bg);
      flex-shrink: 0;
    }
    .slider-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .slider-container {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
      height: 20px;
    }
    .time-slider {
      width: 100%;
      height: 6px;
      cursor: pointer;
      accent-color: var(--btn-bg);
      z-index: 2;
      background: transparent;
    }
    .markers-track {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 6px;
      transform: translateY(-50%);
      pointer-events: none;
      z-index: 1;
    }
    .marker-tick {
      position: absolute;
      top: -3px;
      width: 4px;
      height: 12px;
      border-radius: 1px;
      pointer-events: auto;
      cursor: pointer;
      transform: translateX(-50%);
      opacity: 0.85;
    }
    .marker-tick:hover {
      opacity: 1;
      transform: translateX(-50%) scale(1.3);
      z-index: 3;
    }
    .marker-tick.type-joined { background-color: var(--col-join); }
    .marker-tick.type-suggest { background-color: var(--col-suggest); }
    .marker-tick.type-suggest_accepted { background-color: var(--col-accept); }
    .marker-tick.type-suggest_rejected { background-color: var(--col-reject); }
    .marker-tick.type-denied { background-color: var(--col-reject); }
    .marker-tick.type-role_change { background-color: var(--col-role); }
    .marker-tick.type-session_start, .marker-tick.type-session_end { background-color: var(--col-session); }
    .btn-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 4px 10px;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--font-ui);
      font-size: 12px;
    }
    button:hover {
      background: var(--btn-hover);
    }
    button.speed-btn {
      background: var(--btn-secondary);
      color: var(--btn-sec-fg);
      min-width: 32px;
    }
    button.speed-btn.active {
      background: var(--btn-bg);
      color: var(--btn-fg);
      font-weight: 600;
    }
    .toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      margin-left: 12px;
    }
    .time-text {
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono);
      font-size: 12px;
      min-width: 90px;
    }
    .keyboard-hint {
      color: var(--line-num);
      font-size: 11px;
      margin-left: auto;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="header-title" id="session-title">Session Replay</div>
      <div id="session-meta"></div>
    </div>
    <div class="summary-card" id="summary-card">
      <span class="summary-badge" id="sum-duration"></span>
      <span class="summary-badge" id="sum-edits"></span>
      <span class="summary-badge" id="sum-suggestions"></span>
      <span class="summary-badge" id="sum-participants"></span>
    </div>
  </header>
  <div class="main-layout">
    <div class="code-container">
      <div class="code-header">
        <span id="file-name">shared.txt</span>
        <span id="snapshot-info"></span>
      </div>
      <div class="code-view" id="code-view"></div>
    </div>
    <div class="sidebar">
      <div class="sidebar-header">Timeline Events</div>
      <div class="event-feed" id="event-feed"></div>
    </div>
  </div>
  <div class="controls-panel">
    <div class="slider-row">
      <div class="slider-container">
        <div class="markers-track" id="markers-track"></div>
        <input type="range" class="time-slider" id="time-slider" min="0" max="${totalMs}" value="0" step="50">
      </div>
      <span class="time-text" id="time-display">00:00 / 00:00</span>
    </div>
    <div class="btn-row">
      <button id="btn-play">Play</button>
      <button class="speed-btn active" data-speed="1">1x</button>
      <button class="speed-btn" data-speed="2">2x</button>
      <button class="speed-btn" data-speed="4">4x</button>
      <button class="speed-btn" data-speed="8">8x</button>
      <label class="toggle-label">
        <input type="checkbox" id="chk-skip-idle"> Skip idle (>5s)
      </label>
      ${!isStandalone ? '<button id="btn-export" style="margin-left: 8px;">Export HTML</button>' : ''}
      <span class="keyboard-hint">Space: play/pause | ←/→: events | Shift+←/→: 10s</span>
    </div>
  </div>

  <script id="replay-data" type="application/json">
    ${safeDataJson}
  </script>

  <script nonce="${nonce}">
    (function () {
      const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      const dataEl = document.getElementById('replay-data');
      if (!dataEl) return;
      const replay = JSON.parse(dataEl.textContent);

      const totalDuration = Math.max(0, (replay.endedAt || Date.now()) - (replay.startedAt || Date.now()));
      let currentTime = 0;
      let isPlaying = false;
      let playTimer = null;
      let playbackSpeed = 1;
      let skipIdle = false;
      let currentSnapshotIndex = -1;
      let renderedText = null;

      const slider = document.getElementById('time-slider');
      const timeDisplay = document.getElementById('time-display');
      const btnPlay = document.getElementById('btn-play');
      const codeView = document.getElementById('code-view');
      const fileNameEl = document.getElementById('file-name');
      const snapshotInfoEl = document.getElementById('snapshot-info');
      const sessionTitle = document.getElementById('session-title');
      const sessionMeta = document.getElementById('session-meta');
      const markersTrack = document.getElementById('markers-track');
      const eventFeed = document.getElementById('event-feed');
      const chkSkipIdle = document.getElementById('chk-skip-idle');

      if (sessionTitle) {
        sessionTitle.textContent = 'Session Replay: ' + replay.code;
      }
      if (sessionMeta) {
        sessionMeta.textContent = (replay.participants || []).join(', ');
      }

      function formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }

      function updateTimeDisplay() {
        timeDisplay.textContent = formatTime(currentTime) + ' / ' + formatTime(totalDuration);
      }

      // Summary Card in Header
      let countSuggested = 0;
      let countAccepted = 0;
      let countRejected = 0;
      const events = replay.events || [];

      for (let i = 0; i < events.length; i++) {
        if (events[i].type === 'suggest') countSuggested++;
        else if (events[i].type === 'suggest_accepted') countAccepted++;
        else if (events[i].type === 'suggest_rejected') countRejected++;
      }

      const sumDuration = document.getElementById('sum-duration');
      const sumEdits = document.getElementById('sum-edits');
      const sumSuggestions = document.getElementById('sum-suggestions');
      const sumParticipants = document.getElementById('sum-participants');

      if (sumDuration) sumDuration.textContent = '⏱ ' + formatTime(totalDuration);
      if (sumEdits) sumEdits.textContent = '📝 ' + (replay.snapshots || []).length + ' edits';
      if (sumSuggestions) sumSuggestions.textContent = '💡 ' + countAccepted + ' accepted / ' + countRejected + ' rejected (' + countSuggested + ' total)';
      if (sumParticipants) sumParticipants.textContent = '👥 ' + (replay.participants || []).join(', ');

      function renderCode(text, prevText) {
        while (codeView.firstChild) {
          codeView.removeChild(codeView.firstChild);
        }
        const lines = text.split('\\n');
        const prevLines = typeof prevText === 'string' ? prevText.split('\\n') : null;

        for (let i = 0; i < lines.length; i++) {
          const lineEl = document.createElement('div');
          lineEl.className = 'code-line';

          if (prevLines !== null && (i >= prevLines.length || lines[i] !== prevLines[i])) {
            lineEl.classList.add('line-changed');
          }

          const numEl = document.createElement('div');
          numEl.className = 'line-number';
          numEl.textContent = String(i + 1);

          const contentEl = document.createElement('div');
          contentEl.className = 'line-content';
          contentEl.textContent = lines[i];

          lineEl.appendChild(numEl);
          lineEl.appendChild(contentEl);
          codeView.appendChild(lineEl);
        }
        renderedText = text;
      }

      function findSnapshotIndex(t) {
        const snaps = replay.snapshots || [];
        let idx = -1;
        for (let i = 0; i < snaps.length; i++) {
          if (snaps[i].at <= t) {
            idx = i;
          } else {
            break;
          }
        }
        return idx;
      }

      // Build colored tick markers and feed items
      const feedItems = [];

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];

        // 1. Tick marker
        if (totalDuration > 0) {
          const pct = Math.min(100, Math.max(0, (ev.at / totalDuration) * 100));
          const tick = document.createElement('div');
          tick.className = 'marker-tick type-' + ev.type;
          tick.style.left = pct + '%';
          tick.title = formatTime(ev.at) + ' - ' + ev.type + (ev.by ? ' by ' + ev.by : '');
          tick.addEventListener('click', function (e) {
            e.stopPropagation();
            currentTime = ev.at;
            updateView(false);
          });
          markersTrack.appendChild(tick);
        }

        // 2. Feed item
        const item = document.createElement('div');
        item.className = 'event-item type-' + ev.type;
        item.dataset.at = String(ev.at);

        const timeSpan = document.createElement('div');
        timeSpan.className = 'event-time';
        timeSpan.textContent = formatTime(ev.at);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'event-body';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'event-title';

        let desc = ev.type;
        if (ev.type === 'session_start') desc = (ev.by || 'Host') + ' started session';
        else if (ev.type === 'join_request') desc = (ev.by || 'Guest') + ' requested to join';
        else if (ev.type === 'joined') desc = (ev.by || 'Guest') + ' joined session';
        else if (ev.type === 'denied') desc = (ev.by || 'Guest') + ' join denied';
        else if (ev.type === 'suggest') desc = (ev.by || 'Guest') + ' suggested edit';
        else if (ev.type === 'suggest_accepted') desc = (ev.by || 'Host') + ' accepted suggestion';
        else if (ev.type === 'suggest_rejected') desc = (ev.by || 'Host') + ' rejected suggestion';
        else if (ev.type === 'role_change') desc = (ev.by || 'Host') + ' changed role: ' + (ev.data.target || '') + ' -> ' + (ev.data.role || '');
        else if (ev.type === 'session_end') desc = (ev.by || 'Host') + ' ended session';
        titleDiv.textContent = desc;
        bodyDiv.appendChild(titleDiv);

        if (ev.data && ev.data.preview) {
          const prevDiv = document.createElement('div');
          prevDiv.className = 'event-preview';
          prevDiv.textContent = ev.data.preview;
          bodyDiv.appendChild(prevDiv);
        }

        item.appendChild(timeSpan);
        item.appendChild(bodyDiv);

        item.addEventListener('click', function () {
          currentTime = ev.at;
          updateView(false);
        });

        eventFeed.appendChild(item);
        feedItems.push({ at: ev.at, el: item });
      }

      function updateActiveFeedItem() {
        for (let i = 0; i < feedItems.length; i++) {
          const item = feedItems[i];
          const isCurrent = item.at <= currentTime && (i === feedItems.length - 1 || feedItems[i + 1].at > currentTime);
          if (isCurrent) {
            item.el.classList.add('active');
          } else {
            item.el.classList.remove('active');
          }
        }
      }

      function updateView(force) {
        updateTimeDisplay();
        slider.value = String(currentTime);
        updateActiveFeedItem();

        const snapIdx = findSnapshotIndex(currentTime);
        if (snapIdx !== currentSnapshotIndex || force) {
          const prevIdx = currentSnapshotIndex;
          currentSnapshotIndex = snapIdx;
          if (snapIdx >= 0 && replay.snapshots[snapIdx]) {
            const snap = replay.snapshots[snapIdx];
            fileNameEl.textContent = snap.file || 'shared.txt';
            snapshotInfoEl.textContent = 'Snapshot ' + (snapIdx + 1) + '/' + replay.snapshots.length + (snap.truncated ? ' [truncated]' : '');
            const prevText = prevIdx >= 0 && replay.snapshots[prevIdx] ? replay.snapshots[prevIdx].text : null;
            renderCode(snap.text || '', prevText);
          } else {
            fileNameEl.textContent = 'shared.txt';
            snapshotInfoEl.textContent = 'No snapshots yet';
            renderCode('', null);
          }
        }
      }

      function getNextMilestoneTime(t) {
        let next = Infinity;
        for (let i = 0; i < events.length; i++) {
          if (events[i].at > t && events[i].at < next) next = events[i].at;
        }
        const snaps = replay.snapshots || [];
        for (let i = 0; i < snaps.length; i++) {
          if (snaps[i].at > t && snaps[i].at < next) next = snaps[i].at;
        }
        return next;
      }

      function play() {
        if (isPlaying) return;
        isPlaying = true;
        btnPlay.textContent = 'Pause';
        const intervalMs = 50;
        playTimer = setInterval(function () {
          if (skipIdle) {
            const nextMilestone = getNextMilestoneTime(currentTime);
            if (nextMilestone < Infinity && nextMilestone - currentTime > 5000) {
              currentTime = nextMilestone - 1000;
            } else {
              currentTime += intervalMs * playbackSpeed;
            }
          } else {
            currentTime += intervalMs * playbackSpeed;
          }

          if (currentTime >= totalDuration) {
            currentTime = totalDuration;
            pause();
          }
          updateView(false);
        }, intervalMs);
      }

      function pause() {
        if (!isPlaying) return;
        isPlaying = false;
        btnPlay.textContent = 'Play';
        if (playTimer) {
          clearInterval(playTimer);
          playTimer = null;
        }
      }

      btnPlay.addEventListener('click', function () {
        if (isPlaying) {
          pause();
        } else {
          if (currentTime >= totalDuration) {
            currentTime = 0;
          }
          play();
        }
      });

      slider.addEventListener('input', function () {
        currentTime = parseInt(slider.value, 10);
        updateView(false);
      });

      // Speed buttons
      const speedBtns = document.querySelectorAll('.speed-btn');
      speedBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          speedBtns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          playbackSpeed = parseFloat(btn.dataset.speed || '1');
        });
      });

      // Skip idle toggle
      if (chkSkipIdle) {
        chkSkipIdle.addEventListener('change', function () {
          skipIdle = chkSkipIdle.checked;
        });
      }

      // Export HTML button
      const btnExport = document.getElementById('btn-export');
      if (btnExport) {
        btnExport.addEventListener('click', function () {
          if (vscodeApi) {
            vscodeApi.postMessage({ command: 'exportHtml' });
          }
        });
      }

      // Keyboard shortcuts
      window.addEventListener('keydown', function (e) {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

        if (e.code === 'Space') {
          e.preventDefault();
          if (isPlaying) pause(); else play();
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          if (e.shiftKey) {
            currentTime = Math.max(0, currentTime - 10000);
            updateView(false);
          } else {
            let targetAt = 0;
            for (let i = events.length - 1; i >= 0; i--) {
              if (events[i].at < currentTime - 100) {
                targetAt = events[i].at;
                break;
              }
            }
            currentTime = targetAt;
            updateView(false);
          }
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          if (e.shiftKey) {
            currentTime = Math.min(totalDuration, currentTime + 10000);
            updateView(false);
          } else {
            let targetAt = totalDuration;
            for (let i = 0; i < events.length; i++) {
              if (events[i].at > currentTime + 100) {
                targetAt = events[i].at;
                break;
              }
            }
            currentTime = targetAt;
            updateView(false);
          }
        }
      });

      // Initial view
      updateView(true);
    })();
  </script>
</body>
</html>`;
}
