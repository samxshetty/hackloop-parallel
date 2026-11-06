'use strict';

const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

function sanitizeName(n) {
  if (typeof n !== 'string') return 'Participant';
  const clean = n.replace(/[\u0000-\u001F\u007F-\u009F<>]/g, '').trim();
  return clean.slice(0, 32) || 'Participant';
}

function sanitizeGithubLogin(login) {
  if (typeof login === 'string' && GITHUB_LOGIN_RE.test(login.trim())) {
    return login.trim();
  }
  return null;
}

function colorForName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${h}, 85%, 60%)`;
}

function calculateLongestFocusStreak(editTimestamps) {
  if (!Array.isArray(editTimestamps) || editTimestamps.length < 2) return 0;
  const sorted = [...editTimestamps]
    .map((t) => Number(t))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (sorted.length < 2) return 0;

  let longest = 0;
  let streakStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr - prev <= 60000) {
      const streak = curr - streakStart;
      if (streak > longest) {
        longest = streak;
      }
    } else {
      streakStart = curr;
    }
    prev = curr;
  }
  return longest;
}

function calculatePeakMinute(editTimestamps, startedAt) {
  if (!Array.isArray(editTimestamps) || editTimestamps.length === 0) {
    return { peakMinuteEdits: 0, peakMinuteAt: startedAt || 0, sparkline: [] };
  }
  const minuteCounts = new Map();
  for (const t of editTimestamps) {
    const ts = Number(t);
    if (Number.isNaN(ts)) continue;
    const bucket = Math.floor(ts / 60000) * 60000;
    minuteCounts.set(bucket, (minuteCounts.get(bucket) || 0) + 1);
  }
  if (minuteCounts.size === 0) {
    return { peakMinuteEdits: 0, peakMinuteAt: startedAt || 0, sparkline: [] };
  }
  let maxEdits = 0;
  let peakAt = startedAt || 0;
  const sortedBuckets = Array.from(minuteCounts.keys()).sort((a, b) => a - b);
  for (const bucket of sortedBuckets) {
    const count = minuteCounts.get(bucket);
    if (count > maxEdits) {
      maxEdits = count;
      peakAt = bucket;
    }
  }

  // Sparkline of edits across the session minutes
  const sparkline = [];
  const startBucket = Math.floor((startedAt || sortedBuckets[0]) / 60000) * 60000;
  const endBucket = sortedBuckets[sortedBuckets.length - 1];
  for (let b = startBucket; b <= endBucket; b += 60000) {
    sparkline.push(minuteCounts.get(b) || 0);
  }

  return { peakMinuteEdits: maxEdits, peakMinuteAt: peakAt, sparkline };
}

/**
 * Computes an authoritative Session Wrapped stats object from a session snapshot.
 *
 * @param {object} sessionSnapshot
 * @returns {object} Wrapped stats object
 */
function computeWrapped(sessionSnapshot = {}) {
  const code = typeof sessionSnapshot.code === 'string' ? sessionSnapshot.code.trim().toUpperCase() : 'PARALL';
  const startedAt = typeof sessionSnapshot.startedAt === 'number' ? sessionSnapshot.startedAt : Date.now();
  const endedAt = typeof sessionSnapshot.endedAt === 'number' ? sessionSnapshot.endedAt : Date.now();
  const durationMs = Math.max(0, endedAt - startedAt);

  // Raw edit timestamps for streak and peak minute calculations
  let editTimestamps = Array.isArray(sessionSnapshot.editTimestamps) ? [...sessionSnapshot.editTimestamps] : [];
  if (Array.isArray(sessionSnapshot.editEvents)) {
    for (const ev of sessionSnapshot.editEvents) {
      const ts = ev.timestamp || (typeof ev.at === 'number' ? startedAt + ev.at : null);
      if (ts) editTimestamps.push(ts);
    }
  }
  editTimestamps = editTimestamps.map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);

  const longestFocusMs = calculateLongestFocusStreak(editTimestamps);
  const { peakMinuteEdits, peakMinuteAt, sparkline } = calculatePeakMinute(editTimestamps, startedAt);

  // Raw participants
  const rawParticipants = Array.isArray(sessionSnapshot.participants) ? sessionSnapshot.participants : [];
  const isSolo = rawParticipants.length === 1;

  // Aggregate edit stats per participant if editEvents provided
  const participantEditsMap = new Map();
  if (Array.isArray(sessionSnapshot.editEvents)) {
    for (const ev of sessionSnapshot.editEvents) {
      const by = ev.by || ev.name;
      if (!by) continue;
      let rec = participantEditsMap.get(by);
      if (!rec) {
        rec = { charsAdded: 0, charsDeleted: 0, linesModified: 0, timestamps: [] };
        participantEditsMap.set(by, rec);
      }
      rec.charsAdded += Math.max(0, Number(ev.charsAdded) || 0);
      rec.charsDeleted += Math.max(0, Number(ev.charsDeleted) || 0);
      rec.linesModified += Math.max(0, Number(ev.linesModified) || 0);
      const ts = ev.timestamp || (typeof ev.at === 'number' ? startedAt + ev.at : null);
      if (ts) rec.timestamps.push(ts);
    }
  }

  // Pre-calculate line totals for contributionPct
  let totalLinesModified = 0;
  let totalCharsAdded = 0;

  for (const p of rawParticipants) {
    const pName = p.name || '';
    const evStats = participantEditsMap.get(pName);
    const lines = Math.max(0, Number(p.linesModified) || (evStats ? evStats.linesModified : 0));
    const chars = Math.max(0, Number(p.charsAdded) || (evStats ? evStats.charsAdded : 0));
    totalLinesModified += lines;
    totalCharsAdded += chars;
  }

  // Process participants
  let editRequestsTotal = 0;
  let editRequestsApproved = 0;

  const participants = rawParticipants.map((p, idx) => {
    const id = p.id ? String(p.id) : `p-${idx + 1}`;
    const name = sanitizeName(p.name);
    const rawRole = (p.role || 'guest').toString().toUpperCase();
    const role = (rawRole === 'SUPERHOST' || rawRole === 'HOST') ? rawRole : 'GUEST';
    const color = p.color || colorForName(name);
    const githubLogin = sanitizeGithubLogin(p.githubLogin);

    const evStats = participantEditsMap.get(p.name);
    const charsAdded = Math.max(0, Number(p.charsAdded) || (evStats ? evStats.charsAdded : 0));
    const charsDeleted = Math.max(0, Number(p.charsDeleted) || (evStats ? evStats.charsDeleted : 0));
    const linesModified = Math.max(0, Number(p.linesModified) || (evStats ? evStats.linesModified : 0));

    // Active time: if specified use it; else estimate from timestamps or active spans
    let activeMs = 0;
    if (typeof p.activeMs === 'number') {
      activeMs = Math.min(durationMs, Math.max(0, p.activeMs));
    } else if (evStats && evStats.timestamps.length > 0) {
      // Merge intervals around edits [ts - 30s, ts + 30s]
      const sortedTs = [...evStats.timestamps].sort((a, b) => a - b);
      let totalActive = 0;
      let spanStart = sortedTs[0];
      let spanEnd = spanStart + 60000;
      for (let i = 1; i < sortedTs.length; i++) {
        const t = sortedTs[i];
        if (t <= spanEnd) {
          spanEnd = Math.max(spanEnd, t + 60000);
        } else {
          totalActive += spanEnd - spanStart;
          spanStart = t;
          spanEnd = t + 60000;
        }
      }
      totalActive += spanEnd - spanStart;
      activeMs = Math.min(durationMs, Math.max(1000, totalActive));
    } else if (linesModified > 0 || charsAdded > 0) {
      activeMs = Math.min(durationMs, 60000);
    }

    // Contribution percentage
    let contributionPct = 0;
    if (typeof p.contributionPct === 'number') {
      contributionPct = Math.min(100, Math.max(0, Math.round(p.contributionPct)));
    } else if (totalLinesModified > 0) {
      contributionPct = Math.min(100, Math.round((linesModified / totalLinesModified) * 100));
    } else if (totalCharsAdded > 0) {
      contributionPct = Math.min(100, Math.round((charsAdded / totalCharsAdded) * 100));
    } else if (isSolo) {
      contributionPct = 100;
    }

    // Edit requests
    const pReq = p.editRequests || {};
    const reqTotal = Math.max(0, Number(pReq.total) || 0);
    const reqApproved = Math.max(0, Number(pReq.approved) || 0);
    editRequestsTotal += reqTotal;
    editRequestsApproved += reqApproved;

    const participantObj = {
      id,
      name,
      role,
      color,
      githubLogin,
      contributionPct,
      charsAdded,
      charsDeleted,
      linesModified,
      activeMs,
      editRequests: {
        total: reqTotal,
        approved: reqApproved,
      },
      commits: 0,
    };

    // Internal helper for gatekeeper award calculation
    if (typeof p.editRequestsApprovedByMe === 'number') {
      participantObj._approvedByMe = p.editRequestsApprovedByMe;
    }

    return participantObj;
  });

  // Totals
  const secretsMasked = Math.max(0, Number(sessionSnapshot.secretsMasked) || 0);
  const totals = {
    commits: 0,
    secretsMasked,
    editRequestsTotal: Math.max(editRequestsTotal, Number(sessionSnapshot.editRequestsTotal) || 0),
    editRequestsApproved: Math.max(editRequestsApproved, Number(sessionSnapshot.editRequestsApproved) || 0),
    longestFocusMs,
    peakMinuteEdits,
    peakMinuteAt,
  };
  if (sparkline.length > 0) {
    totals.sparkline = sparkline;
  }

  // MVP: highest contribution %
  let mvpId = null;
  if (participants.length > 0) {
    let best = participants[0];
    for (let i = 1; i < participants.length; i++) {
      const curr = participants[i];
      if (curr.contributionPct > best.contributionPct) {
        best = curr;
      } else if (curr.contributionPct === best.contributionPct) {
        if (curr.linesModified > best.linesModified) {
          best = curr;
        } else if (curr.charsAdded > best.charsAdded) {
          best = curr;
        }
      }
    }
    mvpId = best.id;
  }

  // Awards (auto-assigned, max 1 per person, skip if no clear winner)
  const awards = [];
  const awardedParticipants = new Set();

  function award(participantId, key, label) {
    if (!participantId || awardedParticipants.has(participantId)) return false;
    awardedParticipants.add(participantId);
    awards.push({ participantId, key, label });
    return true;
  }

  // 1. The Fixer: most characters deleted (must be > 0 and strictly greater than second place)
  const byDeleted = [...participants]
    .filter((p) => p.charsDeleted > 0 && !awardedParticipants.has(p.id))
    .sort((a, b) => b.charsDeleted - a.charsDeleted);
  if (byDeleted.length > 0) {
    const top = byDeleted[0];
    const second = byDeleted[1];
    if (!second || top.charsDeleted > second.charsDeleted) {
      award(top.id, 'the_fixer', 'The Fixer');
    }
  }

  // 2. Speed Typer: highest chars added per active minute (must have charsAdded > 0 and clear winner)
  const bySpeed = [...participants]
    .filter((p) => p.charsAdded > 0 && !awardedParticipants.has(p.id))
    .map((p) => {
      const activeMin = p.activeMs > 0 ? p.activeMs / 60000 : 1;
      const speed = p.charsAdded / activeMin;
      return { p, speed };
    })
    .sort((a, b) => b.speed - a.speed);
  if (bySpeed.length > 0) {
    const top = bySpeed[0];
    const second = bySpeed[1];
    if (!second || top.speed > second.speed) {
      award(top.p.id, 'speed_typer', 'Speed Typer');
    }
  }

  // 3. Gatekeeper: the host who approved the most edit requests (must be > 0 and clear winner)
  const hosts = participants.filter(
    (p) => (p.role === 'SUPERHOST' || p.role === 'HOST') && !awardedParticipants.has(p.id)
  );
  const byApprovals = hosts
    .map((h) => ({
      h,
      count: typeof h._approvedByMe === 'number' ? h._approvedByMe : 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  if (byApprovals.length > 0) {
    const top = byApprovals[0];
    const second = byApprovals[1];
    if (!second || top.count > second.count) {
      award(top.h.id, 'gatekeeper', 'Gatekeeper');
    }
  }

  // 4. Silent Observer: guest with zero edits (charsAdded === 0 && charsDeleted === 0 && linesModified === 0)
  const silentGuests = participants.filter(
    (p) =>
      p.role === 'GUEST' &&
      p.charsAdded === 0 &&
      p.charsDeleted === 0 &&
      p.linesModified === 0 &&
      !awardedParticipants.has(p.id)
  );
  if (silentGuests.length === 1) {
    award(silentGuests[0].id, 'silent_observer', 'Silent Observer');
  } else if (silentGuests.length > 1) {
    // If multiple guests had zero edits, pick the first guest as clear representation
    award(silentGuests[0].id, 'silent_observer', 'Silent Observer');
  }

  // 5. Night Owl: session mostly after 10pm local (check midpoint time hour >= 22 or < 5)
  const midPointDate = new Date(startedAt + durationMs / 2);
  const hour = midPointDate.getHours();
  const isNight = hour >= 22 || hour < 5;
  if (isNight) {
    // Assign to a participant who hasn't received an award yet (preferably MVP or host or top contributor)
    const eligible = participants.filter((p) => !awardedParticipants.has(p.id));
    if (eligible.length > 0) {
      // Pick the highest contributor among unawarded
      eligible.sort((a, b) => b.contributionPct - a.contributionPct);
      award(eligible[0].id, 'night_owl', 'Night Owl');
    }
  }

  // Clean internal properties
  for (const p of participants) {
    delete p._approvedByMe;
  }

  return {
    v: 1,
    code,
    startedAt,
    endedAt,
    durationMs,
    participants,
    totals,
    mvp: { participantId: mvpId },
    awards,
  };
}

module.exports = {
  computeWrapped,
  sanitizeName,
  sanitizeGithubLogin,
  calculateLongestFocusStreak,
  calculatePeakMinute,
};
