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
      --active-bg: var(--vscode-editor-selectionBackground, #264f78);
      --font-mono: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
      --font-ui: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
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
    }
    .header-title {
      font-weight: 600;
      font-size: 14px;
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
      position: relative;
    }
    .slider-container {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }
    .time-slider {
      width: 100%;
      height: 6px;
      cursor: pointer;
      accent-color: var(--btn-bg);
    }
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
    .time-text {
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono);
      font-size: 12px;
      min-width: 90px;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-title" id="session-title">Session Replay</div>
    <div id="session-meta"></div>
  </header>
  <div class="main-layout">
    <div class="code-container">
      <div class="code-header">
        <span id="file-name">shared.txt</span>
        <span id="snapshot-info"></span>
      </div>
      <div class="code-view" id="code-view"></div>
    </div>
  </div>
  <div class="controls-panel">
    <div class="slider-row">
      <div class="slider-container">
        <input type="range" class="time-slider" id="time-slider" min="0" max="${totalMs}" value="0" step="50">
      </div>
      <span class="time-text" id="time-display">00:00 / 00:00</span>
    </div>
    <div class="btn-row">
      <button id="btn-play">Play</button>
    </div>
  </div>

  <script id="replay-data" type="application/json">
    ${safeDataJson}
  </script>

  <script nonce="${nonce}">
    (function () {
      const dataEl = document.getElementById('replay-data');
      if (!dataEl) return;
      const replay = JSON.parse(dataEl.textContent);

      const totalDuration = Math.max(0, (replay.endedAt || Date.now()) - (replay.startedAt || Date.now()));
      let currentTime = 0;
      let isPlaying = false;
      let playTimer = null;
      let playbackSpeed = 1;
      let currentSnapshotIndex = -1;

      const slider = document.getElementById('time-slider');
      const timeDisplay = document.getElementById('time-display');
      const btnPlay = document.getElementById('btn-play');
      const codeView = document.getElementById('code-view');
      const fileNameEl = document.getElementById('file-name');
      const snapshotInfoEl = document.getElementById('snapshot-info');
      const sessionTitle = document.getElementById('session-title');
      const sessionMeta = document.getElementById('session-meta');

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

      function renderCode(text) {
        while (codeView.firstChild) {
          codeView.removeChild(codeView.firstChild);
        }
        const lines = text.split('\\n');
        for (let i = 0; i < lines.length; i++) {
          const lineEl = document.createElement('div');
          lineEl.className = 'code-line';

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

      function updateView(force) {
        updateTimeDisplay();
        slider.value = String(currentTime);

        const snapIdx = findSnapshotIndex(currentTime);
        if (snapIdx !== currentSnapshotIndex || force) {
          currentSnapshotIndex = snapIdx;
          if (snapIdx >= 0 && replay.snapshots[snapIdx]) {
            const snap = replay.snapshots[snapIdx];
            fileNameEl.textContent = snap.file || 'shared.txt';
            snapshotInfoEl.textContent = 'Snapshot ' + (snapIdx + 1) + '/' + replay.snapshots.length + (snap.truncated ? ' [truncated]' : '');
            renderCode(snap.text || '');
          } else {
            fileNameEl.textContent = 'shared.txt';
            snapshotInfoEl.textContent = 'No snapshots yet';
            renderCode('');
          }
        }
      }

      function play() {
        if (isPlaying) return;
        isPlaying = true;
        btnPlay.textContent = 'Pause';
        const intervalMs = 50;
        playTimer = setInterval(function () {
          currentTime += intervalMs * playbackSpeed;
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

      // Initial view
      updateView(true);
    })();
  </script>
</body>
</html>`;
}
