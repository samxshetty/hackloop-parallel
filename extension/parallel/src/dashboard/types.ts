export interface ParticipantState {
  name: string;
  role: string;
  canEdit: boolean;
  isSelf: boolean;
  status: 'connected' | 'disconnected';
}

export interface PendingEditRequest {
  name: string;
  requestedAt: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: number;
  type:
    | 'session_start'
    | 'session_end'
    | 'join_request'
    | 'joined'
    | 'left'
    | 'edit_request'
    | 'edit_granted'
    | 'edit_denied'
    | 'edit_revoked'
    | 'role_change'
    | 'doc_edit'
    | 'system';
  description: string;
  isLive: boolean;
  user?: string;
}

export interface ReplaySummary {
  id: string;
  code: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  participants: string[];
  eventCount: number;
  snapshotCount: number;
}

export interface SystemHealth {
  serverUrl: string;
  serverConnected: boolean;
  latencyMs: number | null;
  lastPingAt: number | null;
  lastError: string | null;
  replaysAvailable: number;
}

export interface DashboardSession {
  status: 'active' | 'idle' | 'disconnected';
  code: string;
  host: string;
  role: string | null;
  canEdit: boolean;
  startedAt: number | null;
  connectedCount: number;
}

export interface DashboardState {
  session: DashboardSession;
  participants: ParticipantState[];
  pendingRequests: PendingEditRequest[];
  timeline: ActivityEvent[];
  replays: ReplaySummary[];
  health: SystemHealth;
  currentUser: {
    name: string;
    role: string | null;
    isSuperhost: boolean;
  };
}
