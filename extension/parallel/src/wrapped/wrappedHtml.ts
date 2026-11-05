import { WrappedData, WrappedParticipant } from './types';
import { renderAvatarHtml } from './avatar';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    return `${totalMin}m`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function renderWrappedHtml(data: WrappedData, isStandalone = false): string {
  const nonce = getNonce();
  const codeEscaped = escapeHtml(data.code);
  const dateFormatted = formatDate(data.startedAt);
  const durationFormatted = formatDuration(data.durationMs);

  const mvpParticipant = data.participants.find((p) => p.id === data.mvp?.participantId) || data.participants[0];
  const mvpName = mvpParticipant ? escapeHtml(mvpParticipant.name) : 'TEAM';

  const cspMeta = isStandalone
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; script-src 'nonce-${nonce}' 'unsafe-inline';">`
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; script-src 'nonce-${nonce}';">`;

  // Render People rows
  const renderPeopleRows = (participants: WrappedParticipant[]) =>
    participants
      .map((p) => {
        const name = escapeHtml(p.name);
        const role = escapeHtml(p.role);
        const color = escapeHtml(p.color || '#C6FF3D');
        const pct = Math.min(100, Math.max(0, p.contributionPct));
        const commits = Number(p.commits) || 0;
        const commitsText = `${commits} commit${commits === 1 ? '' : 's'}`;
        const avatar = renderAvatarHtml(p);

        return `
        <div class="person-row">
          <div class="person-avatar-col">${avatar}</div>
          <div class="person-info-col">
            <div class="person-top-line">
              <span class="person-name">${name}</span>
              <span class="role-badge role-${role.toLowerCase()}">${role}</span>
            </div>
            <div class="bar-track" aria-hidden="true">
              <div class="bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
            </div>
          </div>
          <div class="person-stats-col">
            <span class="person-pct">${pct}%</span>
            <span class="person-commits">${commitsText}</span>
          </div>
        </div>
      `.trim();
      })
      .join('\n');

  // Render Award chips
  const renderAwards = (awards: typeof data.awards) =>
    awards
      .map((a) => {
        const p = data.participants.find((x) => x.id === a.participantId);
        const pName = p ? escapeHtml(p.name) : 'Participant';
        const label = escapeHtml(a.label);
        return `
        <div class="award-chip">
          <span class="award-label">${label}</span>
          <span class="award-recipient">${pName}</span>
        </div>
      `.trim();
      })
      .join('\n');

  // Render sparkline bars
  const sparkline = data.totals.sparkline && data.totals.sparkline.length > 0
    ? data.totals.sparkline
    : [2, 5, 12, 24, 38, 42, 28, 15, 8, 3];
  const maxSpark = Math.max(...sparkline, 1);
  const sparklineBarsHtml = sparkline
    .map((val) => {
      const heightPct = Math.max(8, Math.round((val / maxSpark) * 100));
      return `<div class="spark-bar" style="height: ${heightPct}%;" title="${val} edits"></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  <title>Parallel Session Wrapped: ${codeEscaped}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Unbounded:wght@900&display=swap" rel="stylesheet">
  <style nonce="${nonce}">
    :root {
      --ink: #0B0720;
      --magenta: #FF2E93;
      --violet: #7B3FF2;
      --teal: #1BB8D6;
      --cyan: #22E4FF;
      --lime: #C6FF3D;
      --white: #FFFFFF;
      --muted: #D5CFF2;
      --font-display: 'Unbounded', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      --font-body: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      background-color: #05030e;
      color: var(--white);
      font-family: var(--font-body);
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    #viewport {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    /* 720x1280 stage container (9:16 aspect ratio) */
    #stage {
      width: 720px;
      height: 1280px;
      position: relative;
      flex-shrink: 0;
      background-color: var(--ink);
      overflow: hidden;
      box-shadow: 0 25px 80px rgba(0, 0, 0, 0.85);
      border-radius: 12px;
      transform-origin: center center;
    }

    /* Layered Background Glows */
    .bg-canvas {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .glow-magenta {
      position: absolute;
      top: -100px;
      right: -100px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(255, 46, 147, 0.45) 0%, transparent 70%);
      filter: blur(50px);
    }
    .glow-violet {
      position: absolute;
      top: 350px;
      left: -120px;
      width: 520px;
      height: 520px;
      background: radial-gradient(circle, rgba(123, 63, 242, 0.5) 0%, transparent 70%);
      filter: blur(60px);
    }
    .glow-teal {
      position: absolute;
      bottom: -100px;
      right: -80px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(27, 184, 214, 0.4) 0%, transparent 70%);
      filter: blur(60px);
    }
    .bg-stripes {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.06) 0px, rgba(255, 255, 255, 0.06) 2px, transparent 2px, transparent 30px);
    }
    .bg-wordmark-rotated {
      position: absolute;
      right: -140px;
      top: 50%;
      transform: translateY(-50%) rotate(90deg);
      font-family: var(--font-display);
      font-size: 210px;
      font-weight: 900;
      line-height: 1;
      color: transparent;
      -webkit-text-stroke: 2px rgba(255, 255, 255, 0.14);
      letter-spacing: 12px;
      pointer-events: none;
      z-index: 1;
    }

    /* Story Progress Bar */
    .story-progress-bar {
      position: absolute;
      top: 14px;
      left: 20px;
      right: 20px;
      height: 4px;
      display: flex;
      gap: 6px;
      z-index: 50;
    }
    .story-progress-seg {
      flex: 1;
      height: 100%;
      background: rgba(255, 255, 255, 0.22);
      border-radius: 3px;
      overflow: hidden;
      position: relative;
    }
    .story-progress-fill {
      height: 100%;
      width: 0%;
      background: var(--lime);
      border-radius: 3px;
      transition: width 0.1s linear;
    }
    .story-progress-seg.done .story-progress-fill {
      width: 100%;
    }

    /* Common Slide Layout */
    .slide {
      position: absolute;
      inset: 0;
      padding: 34px 36px 36px;
      display: flex;
      flex-direction: column;
      z-index: 10;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease, transform 0.3s ease;
      transform: scale(0.98);
    }
    .slide.active {
      opacity: 1;
      pointer-events: auto;
      transform: scale(1);
    }

    /* Header Row */
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
      margin-bottom: 24px;
      z-index: 20;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo svg {
      display: block;
      width: 28px;
      height: 28px;
    }
    .brand-title {
      font-family: var(--font-display);
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 2px;
      color: var(--white);
    }
    .chip-code-date {
      padding: 8px 16px;
      border: 1.5px solid rgba(255, 255, 255, 0.25);
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: var(--muted);
      text-transform: uppercase;
      background: rgba(11, 7, 32, 0.4);
    }

    /* Cover Slide */
    .cover-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      margin-top: -40px;
    }
    .title-giant {
      font-family: var(--font-display);
      font-size: 84px;
      font-weight: 900;
      line-height: 0.95;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .title-lime {
      color: var(--lime);
      display: block;
    }
    .title-outlined {
      color: transparent;
      -webkit-text-stroke: 3px var(--white);
      display: block;
    }
    .cover-subtitle {
      font-size: 20px;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: 24px;
      line-height: 1.4;
    }
    .cover-tap-prompt {
      margin-top: 60px;
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: 900;
      color: var(--lime);
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 12px 24px;
      border: 2px solid var(--lime);
      border-radius: 999px;
    }

    /* Slide Titles */
    .slide-heading {
      font-family: var(--font-display);
      font-size: 42px;
      font-weight: 900;
      line-height: 1.05;
      color: var(--white);
      text-transform: uppercase;
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }
    .slide-heading .highlight {
      color: var(--lime);
    }

    /* Time Banner */
    .time-banner-wrap {
      margin: 20px 0 32px;
    }
    .time-banner {
      background-color: var(--lime);
      color: var(--ink);
      border-radius: 28px;
      transform: rotate(-1.5deg);
      padding: 24px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 16px 36px rgba(198, 255, 61, 0.28);
    }
    .time-big {
      font-family: var(--font-display);
      font-size: 64px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -1px;
    }
    .time-label {
      font-family: var(--font-display);
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 2px;
      text-align: right;
      max-width: 170px;
      line-height: 1.25;
      text-transform: uppercase;
    }

    /* People Panel */
    .people-card {
      background: rgba(11, 7, 32, 0.62);
      border: 2px solid rgba(255, 255, 255, 0.22);
      border-radius: 28px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .person-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .avatar-wrap {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 4px solid var(--ring-color, var(--lime));
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
      background: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar-initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 900;
      color: var(--ink);
    }
    .person-info-col {
      flex: 1;
      min-width: 0;
    }
    .person-top-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .person-name {
      font-size: 22px;
      font-weight: 700;
      color: var(--white);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .role-badge {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.12);
      color: var(--muted);
    }
    .role-badge.role-superhost {
      background: rgba(198, 255, 61, 0.2);
      color: var(--lime);
      border: 1px solid var(--lime);
    }
    .role-badge.role-host {
      background: rgba(255, 46, 147, 0.2);
      color: var(--magenta);
      border: 1px solid var(--magenta);
    }
    .bar-track {
      width: 100%;
      height: 12px;
      background: rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      min-width: 6px;
    }
    .person-stats-col {
      text-align: right;
      flex-shrink: 0;
    }
    .person-pct {
      display: block;
      font-family: var(--font-display);
      font-size: 26px;
      font-weight: 900;
      color: var(--white);
      line-height: 1;
    }
    .person-commits {
      display: block;
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
      font-weight: 500;
    }

    /* 2x2 Stat Tiles */
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 18px;
      margin: 18px 0;
    }
    .stat-tile {
      border-radius: 24px;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 140px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    }
    .stat-tile.tile-magenta {
      background-color: var(--magenta);
      color: var(--white);
    }
    .stat-tile.tile-white {
      background-color: var(--white);
      color: var(--ink);
    }
    .stat-tile.tile-violet {
      background-color: var(--violet);
      color: var(--white);
    }
    .stat-tile.tile-cyan {
      background-color: var(--cyan);
      color: var(--ink);
    }
    .stat-number {
      font-family: var(--font-display);
      font-size: 50px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -1px;
    }
    .stat-label {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 12px;
      line-height: 1.2;
    }

    /* Sparkline on Peak Moment */
    .sparkline-wrap {
      background: rgba(11, 7, 32, 0.62);
      border: 2px solid rgba(255, 255, 255, 0.22);
      border-radius: 24px;
      padding: 28px 24px 20px;
      margin-top: 24px;
    }
    .sparkline-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 20px;
    }
    .sparkline-container {
      height: 140px;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid rgba(255, 255, 255, 0.16);
    }
    .spark-bar {
      flex: 1;
      background: linear-gradient(180deg, var(--cyan) 0%, var(--teal) 100%);
      border-radius: 4px 4px 0 0;
      min-height: 6px;
    }
    .sparkline-meta {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
      letter-spacing: 1px;
    }

    /* Awards & MVP */
    .awards-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 16px;
    }
    .mvp-spotlight-card {
      background: linear-gradient(135deg, rgba(198, 255, 61, 0.18) 0%, rgba(123, 63, 242, 0.25) 100%);
      border: 2.5px solid var(--lime);
      border-radius: 28px;
      padding: 26px;
      display: flex;
      align-items: center;
      gap: 20px;
      box-shadow: 0 12px 32px rgba(198, 255, 61, 0.2);
    }
    .mvp-badge-title {
      font-family: var(--font-display);
      font-size: 15px;
      font-weight: 900;
      color: var(--lime);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .mvp-name {
      font-size: 28px;
      font-weight: 700;
      color: var(--white);
    }
    .mvp-detail {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }
    .award-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 14px;
    }
    .award-chip {
      background: rgba(11, 7, 32, 0.65);
      border: 1.5px solid rgba(255, 255, 255, 0.22);
      border-radius: 18px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .award-label {
      font-family: var(--font-display);
      font-size: 14px;
      font-weight: 900;
      color: var(--cyan);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .award-recipient {
      font-size: 18px;
      font-weight: 700;
      color: var(--white);
    }

    /* Footer Row */
    .footer-row {
      margin-top: auto;
      padding-top: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 20;
    }
    .mvp-text {
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 900;
      color: var(--lime);
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .btn-replay {
      background-color: var(--white);
      color: var(--ink);
      border: none;
      border-radius: 999px;
      min-height: 44px;
      padding: 10px 22px;
      font-family: var(--font-body);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(255, 255, 255, 0.3);
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .btn-replay:hover {
      background-color: #f0f0f0;
      transform: scale(1.03);
    }

    /* Actions on Summary Slide */
    .export-actions {
      display: flex;
      gap: 12px;
      margin-top: 14px;
    }
    .btn-export {
      flex: 1;
      min-height: 44px;
      border-radius: 999px;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: transform 0.15s ease;
      text-decoration: none;
      border: none;
    }
    .btn-export-html {
      background: rgba(255, 255, 255, 0.14);
      color: var(--white);
      border: 1.5px solid rgba(255, 255, 255, 0.3);
    }
    .btn-export-html:hover {
      background: rgba(255, 255, 255, 0.24);
      transform: scale(1.02);
    }
    .btn-export-png {
      background: var(--lime);
      color: var(--ink);
    }
    .btn-export-png:hover {
      background: #b5ef2b;
      transform: scale(1.02);
    }

    /* Summary Card Specific Compact Tweaks */
    .summary-card-body {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .summary-card-body .people-card {
      padding: 16px 20px;
      gap: 12px;
      margin-bottom: 12px;
    }
    .summary-card-body .person-row {
      gap: 12px;
    }
    .summary-card-body .avatar-wrap {
      width: 48px;
      height: 48px;
      border-width: 3px;
    }
    .summary-card-body .person-name {
      font-size: 18px;
    }
    .summary-card-body .stat-grid {
      margin: 8px 0 12px;
      grid-gap: 12px;
    }
    .summary-card-body .stat-tile {
      min-height: 100px;
      padding: 16px 18px;
      border-radius: 20px;
    }
    .summary-card-body .stat-number {
      font-size: 38px;
    }
    .summary-card-body .stat-label {
      font-size: 13px;
      margin-top: 8px;
    }

    /* Navigation Overlay Controls */
    .nav-tap-area {
      position: absolute;
      top: 50px;
      bottom: 80px;
      width: 50%;
      z-index: 40;
      cursor: pointer;
    }
    .nav-tap-left { left: 0; }
    .nav-tap-right { right: 0; }

    @media (prefers-reduced-motion: reduce) {
      .slide, .bar-fill, .story-progress-fill, .btn-replay, .btn-export {
        transition: none !important;
        animation: none !important;
      }
    }
  </style>
</head>
<body>
  <div id="viewport">
    <div id="stage" role="region" aria-label="Parallel Session Wrapped Story">
      <!-- Background Elements -->
      <div class="bg-canvas" aria-hidden="true">
        <div class="glow-magenta"></div>
        <div class="glow-violet"></div>
        <div class="glow-teal"></div>
        <div class="bg-stripes"></div>
        <div class="bg-wordmark-rotated">PARALLEL</div>
      </div>

      <!-- Story Progress Bars (7 Segments) -->
      <div class="story-progress-bar" role="progressbar" aria-valuenow="1" aria-valuemin="1" aria-valuemax="7">
        <div class="story-progress-seg active" id="prog-0"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-1"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-2"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-3"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-4"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-5"><div class="story-progress-fill"></div></div>
        <div class="story-progress-seg" id="prog-6"><div class="story-progress-fill"></div></div>
      </div>

      <!-- Tap navigation zones -->
      <div class="nav-tap-area nav-tap-left" id="tap-prev" aria-label="Previous slide" role="button" tabindex="0"></div>
      <div class="nav-tap-area nav-tap-right" id="tap-next" aria-label="Next slide" role="button" tabindex="0"></div>

      <!-- SLIDE 1: COVER -->
      <section class="slide active" id="slide-0" aria-label="Slide 1: Session Wrapped Cover">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <div class="cover-body">
          <h1 class="title-giant">
            <span class="title-lime">SESSION</span>
            <span class="title-outlined">WRAPPED</span>
          </h1>
          <p class="cover-subtitle">YOUR COLLABORATIVE SPRINT RECAP</p>
          <div class="cover-tap-prompt">TAP OR PRESS SPACE TO START</div>
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide0" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 2: TIME -->
      <section class="slide" id="slide-1" aria-label="Slide 2: Total Session Time">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <h2 class="slide-heading">TIME IN <br/><span class="highlight">THE LOOP</span></h2>

        <div class="time-banner-wrap">
          <div class="time-banner">
            <span class="time-big" id="count-duration">${durationFormatted}</span>
            <span class="time-label">TOTAL SESSION TIME</span>
          </div>
        </div>

        <div class="people-card" style="margin-top: 10px;">
          <div style="font-size: 16px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">SESSION TIMELINE</div>
          <div style="font-size: 20px; font-weight: 700; color: var(--white);">
            Started: ${new Date(data.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style="font-size: 20px; font-weight: 700; color: var(--white); margin-top: 4px;">
            Ended: ${new Date(data.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide1" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 3: PEOPLE -->
      <section class="slide" id="slide-2" aria-label="Slide 3: Participants and Contribution">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <h2 class="slide-heading">THE <br/><span class="highlight">COLLABORATORS</span></h2>

        <div class="people-card">
          ${renderPeopleRows(data.participants)}
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide2" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 4: NUMBERS -->
      <section class="slide" id="slide-3" aria-label="Slide 4: Key Metrics and Stats">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <h2 class="slide-heading">BY THE <br/><span class="highlight">NUMBERS</span></h2>

        <div class="stat-grid">
          <div class="stat-tile tile-magenta">
            <div class="stat-number" id="num-commits">${data.totals.commits}</div>
            <div class="stat-label">COMMITS PUSHED</div>
          </div>
          <div class="stat-tile tile-white">
            <div class="stat-number" id="num-secrets">${data.totals.secretsMasked}</div>
            <div class="stat-label">SECRETS MASKED</div>
          </div>
          <div class="stat-tile tile-violet">
            <div class="stat-number" id="num-focus">${formatDuration(data.totals.longestFocusMs)}</div>
            <div class="stat-label">LONGEST FOCUS</div>
          </div>
          <div class="stat-tile tile-cyan">
            <div class="stat-number" id="num-edits-ok">${data.totals.editRequestsApproved}/${data.totals.editRequestsTotal}</div>
            <div class="stat-label">EDIT REQUESTS OK</div>
          </div>
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide3" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 5: PEAK MOMENT -->
      <section class="slide" id="slide-4" aria-label="Slide 5: Peak Moment and Sparkline">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <h2 class="slide-heading">PEAK <br/><span class="highlight">VELOCITY</span></h2>

        <div class="time-banner-wrap">
          <div class="time-banner" style="background-color: var(--cyan);">
            <span class="time-big" id="num-peak-edits">${data.totals.peakMinuteEdits}</span>
            <span class="time-label">EDITS IN PEAK MINUTE</span>
          </div>
        </div>

        <div class="sparkline-wrap">
          <div class="sparkline-title">ACTIVITY SPARKLINE (EDITS PER MINUTE)</div>
          <div class="sparkline-container" aria-hidden="true">
            ${sparklineBarsHtml}
          </div>
          <div class="sparkline-meta">
            <span>START OF SESSION</span>
            <span>END OF SESSION</span>
          </div>
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide4" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 6: AWARDS & MVP -->
      <section class="slide" id="slide-5" aria-label="Slide 6: Superlatives and Awards">
        <div class="header-row">
          <div class="brand-wrap">
            <div class="brand-logo">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="brand-title">PARALLEL</span>
          </div>
          <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
        </div>

        <h2 class="slide-heading">SESSION <br/><span class="highlight">SUPERLATIVES</span></h2>

        <div class="awards-container">
          <div class="mvp-spotlight-card">
            <div class="mvp-avatar-box">
              ${mvpParticipant ? renderAvatarHtml(mvpParticipant) : ''}
            </div>
            <div class="mvp-meta">
              <div class="mvp-badge-title">★ SESSION MVP ★</div>
              <div class="mvp-name">${mvpName}</div>
              <div class="mvp-detail">${mvpParticipant ? mvpParticipant.contributionPct : 100}% overall contribution</div>
            </div>
          </div>

          <div class="award-grid">
            ${renderAwards(data.awards)}
          </div>
        </div>

        <div class="footer-row">
          <span class="mvp-text">MVP: ${mvpName}</span>
          <button class="btn-replay" id="btn-replay-slide5" type="button" aria-label="Watch session replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Watch replay
          </button>
        </div>
      </section>

      <!-- SLIDE 7: FINAL SUMMARY CARD -->
      <section class="slide" id="slide-6" aria-label="Slide 7: Final Shareable Summary Card">
        <div id="summary-card" class="summary-card-body">
          <div class="header-row">
            <div class="brand-wrap">
              <div class="brand-logo">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 21L11 3" stroke="#C6FF3D" stroke-width="3.5" stroke-linecap="round"/>
                  <path d="M13 21L17 3" stroke="#FF2E93" stroke-width="3.5" stroke-linecap="round"/>
                </svg>
              </div>
              <span class="brand-title">PARALLEL</span>
            </div>
            <div class="chip-code-date">${codeEscaped} · ${dateFormatted}</div>
          </div>

          <h2 class="title-giant" style="font-size: 56px; margin-bottom: 12px;">
            <span class="title-lime">SESSION</span>
            <span class="title-outlined">WRAPPED</span>
          </h2>

          <div class="time-banner-wrap" style="margin: 6px 0 16px;">
            <div class="time-banner" style="padding: 16px 24px; border-radius: 20px;">
              <span class="time-big" style="font-size: 44px;">${durationFormatted}</span>
              <span class="time-label" style="font-size: 13px;">TOTAL SESSION TIME</span>
            </div>
          </div>

          <div class="people-card">
            ${renderPeopleRows(data.participants.slice(0, 4))}
          </div>

          <div class="stat-grid">
            <div class="stat-tile tile-magenta">
              <div class="stat-number">${data.totals.commits}</div>
              <div class="stat-label">COMMITS</div>
            </div>
            <div class="stat-tile tile-white">
              <div class="stat-number">${data.totals.secretsMasked}</div>
              <div class="stat-label">SECRETS MASKED</div>
            </div>
            <div class="stat-tile tile-violet">
              <div class="stat-number">${formatDuration(data.totals.longestFocusMs)}</div>
              <div class="stat-label">LONGEST FOCUS</div>
            </div>
            <div class="stat-tile tile-cyan">
              <div class="stat-number">${data.totals.editRequestsApproved}/${data.totals.editRequestsTotal}</div>
              <div class="stat-label">EDIT REQS OK</div>
            </div>
          </div>

          <div class="footer-row" style="padding-top: 8px;">
            <span class="mvp-text">MVP: ${mvpName}</span>
            <button class="btn-replay" id="btn-replay-slide6" type="button" aria-label="Watch session replay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Watch replay
            </button>
          </div>
        </div>

        <!-- Export Buttons (Slide 7 only) -->
        <div class="export-actions">
          <button class="btn-export btn-export-html" id="btn-export-html" type="button" aria-label="Export recap as self-contained HTML file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export as HTML
          </button>
          <button class="btn-export btn-export-png" id="btn-export-png" type="button" aria-label="Download recap as PNG card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Download PNG
          </button>
        </div>
      </section>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      // Fit 720x1280 stage to viewport
      function fitStage() {
        const stage = document.getElementById('stage');
        if (!stage) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scale = Math.min(vw / 720, vh / 1280);
        stage.style.transform = 'scale(' + scale + ')';
      }
      window.addEventListener('resize', fitStage);
      fitStage();

      // Basic story setup (static shell for Commit 5)
      let currentSlide = 0;
      const totalSlides = 7;
      function showSlide(index) {
        if (index < 0 || index >= totalSlides) return;
        currentSlide = index;
        for (let i = 0; i < totalSlides; i++) {
          const s = document.getElementById('slide-' + i);
          const p = document.getElementById('prog-' + i);
          if (s) {
            if (i === currentSlide) s.classList.add('active');
            else s.classList.remove('active');
          }
          if (p) {
            if (i < currentSlide) {
              p.classList.add('done');
              p.classList.remove('active');
            } else if (i === currentSlide) {
              p.classList.add('active');
              p.classList.remove('done');
            } else {
              p.classList.remove('done', 'active');
            }
          }
        }
      }

      document.getElementById('tap-next')?.addEventListener('click', () => showSlide(currentSlide + 1));
      document.getElementById('tap-prev')?.addEventListener('click', () => showSlide(currentSlide - 1));

      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
          showSlide(currentSlide + 1);
        } else if (e.key === 'ArrowLeft') {
          showSlide(currentSlide - 1);
        }
      });
    })();
  </script>
</body>
</html>`;
}
