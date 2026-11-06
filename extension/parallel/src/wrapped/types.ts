export interface WrappedParticipant {
  id: string;
  name: string;
  role: 'SUPERHOST' | 'HOST' | 'GUEST';
  color: string;
  githubLogin: string | null;
  contributionPct: number;
  charsAdded: number;
  charsDeleted: number;
  linesModified: number;
  activeMs: number;
  editRequests: {
    total: number;
    approved: number;
  };
  commits: number;
}

export interface WrappedTotals {
  commits: number;
  secretsMasked: number;
  editRequestsTotal: number;
  editRequestsApproved: number;
  longestFocusMs: number;
  peakMinuteEdits: number;
  peakMinuteAt: number;
  sparkline?: number[];
}

export interface WrappedAward {
  participantId: string;
  key: string;
  label: string;
}

export interface WrappedData {
  v: number;
  code: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  participants: WrappedParticipant[];
  totals: WrappedTotals;
  mvp: {
    participantId: string | null;
  };
  awards: WrappedAward[];
}

export interface GitCommitStats {
  totalCommits: number;
  participants: Array<{
    id?: string;
    name: string;
    commits: number;
  }>;
}
