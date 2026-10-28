export type TaskStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Blocked' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  dueDate: string | null;
  milestoneId: string;
  blockedReason: string;
  relevantFiles: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDeadline: string;
  completed: boolean;
  completedAt: number | null;
}

export interface Deliverable {
  id: string;
  label: string;
  url: string;
  completed: boolean;
}

export interface PulseEvent {
  id: string;
  timestamp: number;
  type: string;
  author: string;
  message: string;
  details?: Record<string, any>;
}

export interface ProjectNotes {
  problemStatement: string;
  proposedSolution: string;
  architectureDecisions: string;
  apiContracts: string;
  knownRisks: string;
  demoScript: string;
  lastUpdatedBy: string;
  updatedAt: number;
}

export interface HackathonSetup {
  hackathonName: string;
  projectName: string;
  description: string;
  repositoryUrl: string;
  startTime: string;
  deadline: string;
  teamMembers: string[];
  goals: string[];
  updatedAt: number;
}

export interface Recommendation {
  id: string;
  urgency: 'critical' | 'high' | 'medium' | 'info';
  category: 'blocker' | 'deadline' | 'milestone' | 'deliverable' | 'workload';
  title: string;
  description: string;
  reason: string;
  suggestedAction: string;
  relatedTaskId?: string;
  relatedMilestoneId?: string;
}

export interface GitGuardianInfo {
  isGitRepo: boolean;
  currentBranch: string | null;
  uncommittedChanges: number;
  unresolvedConflicts: string[];
  changedFiles: string[];
  recentCommits: { hash: string; message: string; author?: string }[];
  potentialOverlaps: { file: string; taskTitle: string; assignee: string }[];
  errorMessage?: string;
}

export interface HackathonState {
  code: string;
  setup: HackathonSetup;
  tasks: Task[];
  milestones: Milestone[];
  deliverables: Deliverable[];
  pulse: PulseEvent[];
  notes: ProjectNotes;
}

export interface WebviewState {
  state: HackathonState | null;
  recommendations: Recommendation[];
  gitInfo: GitGuardianInfo | null;
  userRole: 'superhost' | 'host' | 'guest';
  canEdit: boolean;
  userName: string;
  sessionCode: string;
  serverConnected: boolean;
}
