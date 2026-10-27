'use strict';

const crypto = require('crypto');
const { maskSecrets } = require('../safety/mask');

const BASE_MIN_GAP_MS = 250;
const MAX_SNAPSHOT_BYTES = 200 * 1024; // 200 KB
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB

function createRecorder(code) {
  const id = crypto.randomBytes(6).toString('hex');
  const startedAt = Date.now();
  let endedAt = null;
  let finished = false;

  const participants = [];
  const participantSet = new Set();
  const events = [];
  const snapshots = [];

  let lastSnapshotText = null;
  let lastSnapshotFile = null;
  let lastSnapshotTime = -Infinity;
  let pendingSnapshot = null;
  let totalSnapshotBytes = 0;
  let totalTruncated = false;

  function trackParticipant(name) {
    if (typeof name === 'string') {
      const clean = name.trim();
      if (clean && !participantSet.has(clean)) {
        participantSet.add(clean);
        participants.push(clean);
      }
    }
  }

  function getMinGap() {
    return snapshots.length > 1500 ? BASE_MIN_GAP_MS * 2 : BASE_MIN_GAP_MS;
  }

  function commitSnapshot(snap) {
    if (!snap || totalTruncated) return;

    // Ignore identical text for the same file
    if (snap.file === lastSnapshotFile && snap.text === lastSnapshotText) {
      return;
    }

    let text = typeof snap.text === 'string' ? snap.text : '';
    let snapTruncated = false;
    let byteLen = Buffer.byteLength(text, 'utf8');

    if (byteLen > MAX_SNAPSHOT_BYTES) {
      // Truncate to MAX_SNAPSHOT_BYTES
      const buf = Buffer.from(text, 'utf8');
      text = buf.subarray(0, MAX_SNAPSHOT_BYTES).toString('utf8');
      byteLen = Buffer.byteLength(text, 'utf8');
      snapTruncated = true;
    }

    if (totalSnapshotBytes + byteLen > MAX_TOTAL_BYTES) {
      totalTruncated = true;
      return;
    }

    totalSnapshotBytes += byteLen;
    lastSnapshotText = text;
    lastSnapshotFile = snap.file;
    lastSnapshotTime = snap.now;

    const record = {
      at: snap.at,
      file: snap.file,
      text,
    };
    if (snapTruncated) {
      record.truncated = true;
    }
    snapshots.push(record);
  }

  function addEvent(type, by, data) {
    try {
      if (finished) return;
      const now = Date.now();
      const at = Math.max(0, now - startedAt);

      if (by) trackParticipant(by);
      if (data && typeof data === 'object') {
        if (data.name) trackParticipant(data.name);
        if (data.by) trackParticipant(data.by);
      }

      events.push({
        at,
        type: String(type || ''),
        by: by ? String(by) : null,
        data: data && typeof data === 'object' ? data : {},
      });
    } catch {
      // Never throw
    }
  }

  function addSnapshot(file, text) {
    try {
      if (finished || totalTruncated) return;
      const now = Date.now();
      const at = Math.max(0, now - startedAt);
      const safeFile = typeof file === 'string' && file ? file : 'shared.txt';
      const safeText = typeof text === 'string' ? text : '';

      // Ignore if text is identical to last committed snapshot for same file
      // and identical to pending snapshot
      if (safeFile === lastSnapshotFile && safeText === lastSnapshotText && !pendingSnapshot) {
        return;
      }
      if (pendingSnapshot && pendingSnapshot.file === safeFile && pendingSnapshot.text === safeText) {
        return;
      }

      const minGap = getMinGap();
      if (now - lastSnapshotTime >= minGap) {
        // If there was a pending snapshot, commit it first
        if (pendingSnapshot) {
          commitSnapshot(pendingSnapshot);
          pendingSnapshot = null;
        }
        // Then commit this one if gap still satisfied and not duplicate
        if (now - lastSnapshotTime >= minGap) {
          commitSnapshot({ at, file: safeFile, text: safeText, now });
        } else {
          pendingSnapshot = { at, file: safeFile, text: safeText, now };
        }
      } else {
        // Coalesce: save as pending snapshot
        pendingSnapshot = { at, file: safeFile, text: safeText, now };
      }
    } catch {
      // Never throw
    }
  }

  function finish() {
    try {
      if (finished) return;
      finished = true;
      endedAt = Date.now();

      if (pendingSnapshot) {
        commitSnapshot(pendingSnapshot);
        pendingSnapshot = null;
      }
    } catch {
      // Never throw
    }
  }

  function toJSON() {
    try {
      const result = {
        v: 1,
        id,
        code: String(code || ''),
        startedAt,
        endedAt: endedAt !== null ? endedAt : Date.now(),
        participants: [...participants],
        events: events.map((e) => ({ ...e })),
        snapshots: snapshots.map((s) => ({ ...s })),
      };
      if (totalTruncated) {
        result.truncated = true;
      }
      return result;
    } catch {
      return {
        v: 1,
        id,
        code: String(code || ''),
        startedAt,
        endedAt: Date.now(),
        participants: [],
        events: [],
        snapshots: [],
      };
    }
  }

  return {
    id,
    code,
    addEvent,
    addSnapshot,
    addParticipant: trackParticipant,
    finish,
    toJSON,
  };
}

function recordSuggestion(session, ws, msg) {
  try {
    if (!session?.recorder || !msg || typeof msg !== 'object') return;
    const raw = typeof msg.replacement === 'string' ? msg.replacement : (typeof msg.text === 'string' ? msg.text : '');
    const preview = maskSecrets(raw.slice(0, 200)).text;
    const range = {
      startLine: msg.range?.startLine ?? msg.startLine ?? msg.line ?? 0,
      endLine: msg.range?.endLine ?? msg.endLine ?? msg.line ?? 0,
    };
    session.recorder.addEvent('suggest', ws?.name || 'Guest', {
      guest: ws?.name || 'Guest',
      id: msg.id || msg.sid || '',
      range,
      preview,
    });
  } catch {
    // Never throw
  }
}

function recordSuggestionResult(session, msg, ws) {
  try {
    if (!session?.recorder || !msg || typeof msg !== 'object') return;
    const isAcc = msg.status === 'accepted' || msg.accept === true;
    const isRej = msg.status === 'rejected' || msg.accept === false;
    const status = isAcc ? 'suggest_accepted' : (isRej ? 'suggest_rejected' : null);
    if (!status) return;
    const by = ws?.name || msg.from || 'Host';
    session.recorder.addEvent(status, by, {
      id: msg.sid || msg.id || '',
      status: isAcc ? 'accepted' : 'rejected',
    });
  } catch {
    // Never throw
  }
}

function getSummary(recorder) {
  try {
    if (!recorder) return null;
    const data = typeof recorder.toJSON === 'function' ? recorder.toJSON() : recorder;
    const duration = Math.max(0, (data.endedAt || Date.now()) - (data.startedAt || Date.now()));
    let suggested = 0;
    let accepted = 0;
    let rejected = 0;
    for (const e of data.events || []) {
      if (e.type === 'suggest') suggested++;
      else if (e.type === 'suggest_accepted') accepted++;
      else if (e.type === 'suggest_rejected') rejected++;
    }
    return {
      t: 'summary',
      duration,
      edits: (data.snapshots || []).length,
      suggested,
      accepted,
      rejected,
      participants: [...(data.participants || [])],
    };
  } catch {
    return null;
  }
}

module.exports = {
  createRecorder,
  recordSuggestion,
  recordSuggestionResult,
  getSummary,
};
