'use strict';

/**
 * Dev-only sample Wrapped payload for previewing the UI without running a full session.
 * Used with ?demo in webview or in command-free tests.
 * Never used in normal operation.
 */
const sampleWrapped = {
  v: 1,
  code: 'K9X2B7',
  startedAt: 1730000000000,
  endedAt: 1730006420000, // 1h 47m = 6,420,000 ms
  durationMs: 6420000,
  participants: [
    {
      id: 'p-1',
      name: 'Alice',
      role: 'SUPERHOST',
      color: '#C6FF3D',
      githubLogin: 'alice-dev',
      contributionPct: 58,
      charsAdded: 2840,
      charsDeleted: 410,
      linesModified: 142,
      activeMs: 5800000,
      editRequests: { total: 0, approved: 0 },
      commits: 8,
    },
    {
      id: 'p-2',
      name: 'Bob',
      role: 'HOST',
      color: '#FF2E93',
      githubLogin: 'bob-builder',
      contributionPct: 32,
      charsAdded: 1650,
      charsDeleted: 820,
      linesModified: 84,
      activeMs: 4200000,
      editRequests: { total: 2, approved: 2 },
      commits: 5,
    },
    {
      id: 'p-3',
      name: 'Carol',
      role: 'GUEST',
      color: '#22E4FF',
      githubLogin: 'carol-coder',
      contributionPct: 10,
      charsAdded: 480,
      charsDeleted: 15,
      linesModified: 26,
      activeMs: 1500000,
      editRequests: { total: 1, approved: 1 },
      commits: 1,
    },
  ],
  totals: {
    commits: 14,
    secretsMasked: 7,
    editRequestsTotal: 3,
    editRequestsApproved: 3,
    longestFocusMs: 1380000, // 23 minutes
    peakMinuteEdits: 42,
    peakMinuteAt: 1730003100000,
    sparkline: [
      2, 4, 8, 12, 19, 25, 30, 42, 38, 22, 15, 10, 8, 14, 20, 26, 18, 12, 6, 2,
    ],
  },
  mvp: { participantId: 'p-1' },
  awards: [
    { participantId: 'p-2', key: 'the_fixer', label: 'The Fixer' },
    { participantId: 'p-1', key: 'speed_typer', label: 'Speed Typer' },
    { participantId: 'p-3', key: 'night_owl', label: 'Night Owl' },
  ],
};

module.exports = {
  sampleWrapped,
};
