export interface ReplayEvent {
  at: number;
  type: string;
  by: string | null;
  data: any;
}

export interface ReplaySnapshot {
  at: number;
  file: string;
  text: string;
  truncated?: boolean;
}

export interface ReplayData {
  v: number;
  id: string;
  code: string;
  startedAt: number;
  endedAt: number;
  participants: string[];
  events: ReplayEvent[];
  snapshots: ReplaySnapshot[];
  truncated?: boolean;
}
