'use strict';

// sessionCode -> Map<guestName, GuestCredit>
const sessionCredits = new Map();
// sessionCode -> { timer, lastSentTime, lastSentJson }
const sessionThrottles = new Map();

function getSessionMap(code) {
  let map = sessionCredits.get(code);
  if (!map) {
    map = new Map();
    sessionCredits.set(code, map);
  }
  return map;
}

function getThrottle(code) {
  let th = sessionThrottles.get(code);
  if (!th) {
    th = { timer: null, lastSentTime: 0, lastSentJson: null };
    sessionThrottles.set(code, th);
  }
  return th;
}

function countLinesChanged(oldText, newText, change) {
  if (!change) {
    const lines = (newText || '').split('\n').length;
    return Math.max(1, lines);
  }
  const oldMiddle = (oldText || '').slice(change.oldStart, change.oldEnd);
  const newMiddle = change.newMiddle || '';
  const oldLines = oldMiddle.length === 0 ? 0 : oldMiddle.split('\n').length;
  const newLines = newMiddle.length === 0 ? 0 : newMiddle.split('\n').length;
  return Math.max(1, Math.max(oldLines, newLines));
}

/**
 * Records an accepted edit from a guest in a session.
 *
 * @param {object} session
 * @param {object} ws - WebSocket of the guest
 * @param {string} oldText - Text before edit
 * @param {string} newText - Text after edit
 * @param {object} change - { oldStart, oldEnd, newMiddle }
 * @param {function} send - Function to send message to a ws
 */
function recordEdit(session, ws, oldText, newText, change, send) {
  if (!session || !ws) return;
  // Owner/host is never listed
  if (ws.role === 'superhost' || ws.role === 'host') return;
  // Guest must have canEdit permission
  if (!ws.canEdit) return;
  // Ignore no-op edits
  if (oldText === newText) return;

  const code = ws.code || (session.code);
  const name = ws.name;
  if (!code || !name) return;

  const now = Date.now();
  const map = getSessionMap(code);
  const lines = countLinesChanged(oldText, newText, change);

  let rec = map.get(name);
  if (!rec) {
    rec = {
      name,
      edits: 1,
      lines,
      firstEditTime: now,
      lastEditTime: now,
      revoked: false,
    };
    map.set(name, rec);
  } else {
    // Count edits within 5 seconds of each other as one contribution
    if (now - rec.lastEditTime <= 5000) {
      rec.lines += lines;
      rec.lastEditTime = now;
    } else {
      rec.edits += 1;
      rec.lines += lines;
      rec.lastEditTime = now;
    }
  }

  notifyHostThrottled(session, send);
}

/**
 * Marks a guest's edit access as revoked in contribution tracking.
 */
function setRevoked(session, name, revoked, send) {
  if (!session || !name) return;
  const code = session.code || (session.host && session.host.code);
  if (!code) return;
  const map = sessionCredits.get(code);
  if (!map) return;
  const rec = map.get(name);
  if (rec) {
    rec.revoked = !!revoked;
    notifyHostThrottled(session, send);
  }
}

/**
 * Returns current contribution list for a session.
 */
function getContributions(sessionOrCode) {
  const code = typeof sessionOrCode === 'string'
    ? sessionOrCode
    : (sessionOrCode.code || (sessionOrCode.host && sessionOrCode.host.code));
  const map = sessionCredits.get(code);
  if (!map) return [];
  const list = [];
  for (const rec of map.values()) {
    list.push({
      name: rec.name,
      edits: rec.edits,
      lines: rec.lines,
      revoked: rec.revoked,
    });
  }
  return list;
}

function notifyHost(session, send) {
  if (!session || !session.host || !send) return;
  const code = session.code || session.host.code;
  const th = getThrottle(code);
  const list = getContributions(code);
  const json = JSON.stringify(list);

  if (json === th.lastSentJson) {
    return; // No change
  }

  th.lastSentJson = json;
  th.lastSentTime = Date.now();
  if (th.timer) {
    clearTimeout(th.timer);
    th.timer = null;
  }
  send(session.host, { t: 'credit', list });
}

function notifyHostThrottled(session, send, minIntervalMs = 1000) {
  if (!session || !session.host || !send) return;
  const code = session.code || session.host.code;
  const th = getThrottle(code);
  const now = Date.now();
  const elapsed = now - th.lastSentTime;

  if (elapsed >= minIntervalMs && !th.timer) {
    notifyHost(session, send);
  } else if (!th.timer) {
    const delay = Math.max(0, minIntervalMs - elapsed);
    th.timer = setTimeout(() => {
      th.timer = null;
      notifyHost(session, send);
    }, delay);
  }
}

/**
 * Cleans up session contribution state.
 */
function clearSession(code) {
  if (!code) return;
  sessionCredits.delete(code);
  const th = sessionThrottles.get(code);
  if (th && th.timer) {
    clearTimeout(th.timer);
  }
  sessionThrottles.delete(code);
}

module.exports = {
  recordEdit,
  setRevoked,
  getContributions,
  notifyHost,
  notifyHostThrottled,
  clearSession,
};
