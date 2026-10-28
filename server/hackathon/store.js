'use strict';

const crypto = require('crypto');
const { saveHackathon, loadHackathon } = require('./storage');
const { getNextBestActions } = require('./recommendations');

// In-memory store: sessionCode -> HackathonState
const sessionStates = new Map();

const VALID_STATUSES = ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Done'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

function createDefaultState(sessionCode, hostName = 'Host') {
  const now = Date.now();
  const deadline = now + 24 * 60 * 60 * 1000; // 24 hours from now

  return {
    code: sessionCode,
    setup: {
      hackathonName: 'HackLoop 2026',
      projectName: 'Collaborative Project',
      description: 'Building under hackathon deadline pressure.',
      repositoryUrl: '',
      startTime: new Date(now).toISOString(),
      deadline: new Date(deadline).toISOString(),
      teamMembers: [hostName],
      goals: ['Ship a functional MVP', 'Record a 2-minute demo', 'Submit before deadline'],
      updatedAt: now,
    },
    tasks: [
      {
        id: 'task_mvp_core',
        title: 'Build core feature prototype',
        description: 'Implement the minimum viable feature that demonstrates end-to-end functionality.',
        acceptanceCriteria: 'End-to-end happy path works with live data.',
        status: 'In Progress',
        priority: 'Critical',
        assignee: hostName,
        dueDate: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
        milestoneId: 'mvp',
        blockedReason: '',
        relevantFiles: ['src/index.ts'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'task_demo_script',
        title: 'Draft 2-minute demo presentation script',
        description: 'Outline the problem, solution, architecture, and live demo steps for judges.',
        acceptanceCriteria: 'Clear narrative under 2 minutes.',
        status: 'To Do',
        priority: 'High',
        assignee: '',
        dueDate: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        milestoneId: 'demo',
        blockedReason: '',
        relevantFiles: ['README.md'],
        createdAt: now,
        updatedAt: now,
      },
    ],
    milestones: [
      {
        id: 'idea',
        title: 'Idea Validation & Scope',
        description: 'Problem definition, target user, and core feature list finalized.',
        targetDeadline: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        completed: true,
        completedAt: now,
      },
      {
        id: 'mvp',
        title: 'MVP Complete',
        description: 'Working prototype with core value proposition demonstrable.',
        targetDeadline: new Date(now + 10 * 60 * 60 * 1000).toISOString(),
        completed: false,
        completedAt: null,
      },
      {
        id: 'integration',
        title: 'Integration Complete',
        description: 'Frontend, backend, APIs, and data models connected.',
        targetDeadline: new Date(now + 16 * 60 * 60 * 1000).toISOString(),
        completed: false,
        completedAt: null,
      },
      {
        id: 'testing',
        title: 'Testing & Hardening',
        description: 'Edge cases checked, error handling added, zero crashes on main path.',
        targetDeadline: new Date(now + 20 * 60 * 60 * 1000).toISOString(),
        completed: false,
        completedAt: null,
      },
      {
        id: 'demo',
        title: 'Demo & Pitch Ready',
        description: 'Slides finalized and video walkthrough / live demo rehearsed.',
        targetDeadline: new Date(now + 22 * 60 * 60 * 1000).toISOString(),
        completed: false,
        completedAt: null,
      },
      {
        id: 'submission',
        title: 'Submission Finalized',
        description: 'Devpost / portal entry submitted, links verified, repo public.',
        targetDeadline: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
        completedAt: null,
      },
    ],
    deliverables: [
      { id: 'del_repo', label: 'GitHub Repository', url: '', completed: false },
      { id: 'del_demo', label: 'Live Demo URL', url: '', completed: false },
      { id: 'del_slides', label: 'Pitch Presentation / Slides', url: '', completed: false },
      { id: 'del_docs', label: 'Documentation & Architecture', url: '', completed: false },
      { id: 'del_portal', label: 'Hackathon Submission Link', url: '', completed: false },
    ],
    pulse: [
      {
        id: `pulse_${now}`,
        timestamp: now,
        type: 'setup_created',
        author: hostName,
        message: 'Hackathon workspace initialized.',
        details: {},
      },
    ],
    notes: {
      problemStatement: '',
      proposedSolution: '',
      architectureDecisions: '',
      apiContracts: '',
      knownRisks: '',
      demoScript: '',
      lastUpdatedBy: hostName,
      updatedAt: now,
    },
  };
}

function getHackathonState(sessionCode, hostName = 'Host') {
  if (!sessionCode) return null;
  let state = sessionStates.get(sessionCode);
  if (!state) {
    // Attempt load from persistent storage
    const loaded = loadHackathon(sessionCode);
    if (loaded && loaded.setup) {
      state = loaded;
    } else {
      state = createDefaultState(sessionCode, hostName);
      saveHackathon(sessionCode, state);
    }
    sessionStates.set(sessionCode, state);
  }
  return state;
}

function addPulseEvent(state, type, author, message, details = {}) {
  const event = {
    id: `pulse_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: Date.now(),
    type,
    author: author || 'System',
    message,
    details,
  };
  state.pulse = state.pulse || [];
  state.pulse.unshift(event);
  if (state.pulse.length > 50) {
    state.pulse = state.pulse.slice(0, 50);
  }
  return event;
}

function updateSetup(sessionCode, updates, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  if (updates.deadline) {
    const dTime = new Date(updates.deadline).getTime();
    if (isNaN(dTime) || dTime <= 0) {
      return { ok: false, error: 'Invalid deadline date format' };
    }
    if (updates.startTime) {
      const sTime = new Date(updates.startTime).getTime();
      if (!isNaN(sTime) && dTime <= sTime) {
        return { ok: false, error: 'Deadline must be after start time' };
      }
    }
  }

  const s = state.setup;
  if (typeof updates.hackathonName === 'string') s.hackathonName = updates.hackathonName.trim().slice(0, 100);
  if (typeof updates.projectName === 'string') s.projectName = updates.projectName.trim().slice(0, 100);
  if (typeof updates.description === 'string') s.description = updates.description.trim().slice(0, 500);
  if (typeof updates.repositoryUrl === 'string') s.repositoryUrl = updates.repositoryUrl.trim().slice(0, 250);
  if (updates.startTime) s.startTime = new Date(updates.startTime).toISOString();
  if (updates.deadline) s.deadline = new Date(updates.deadline).toISOString();
  if (Array.isArray(updates.teamMembers)) {
    s.teamMembers = updates.teamMembers.map((m) => String(m).trim().slice(0, 40)).filter(Boolean);
  }
  if (Array.isArray(updates.goals)) {
    s.goals = updates.goals.map((g) => String(g).trim().slice(0, 120)).filter(Boolean);
  }
  s.updatedAt = Date.now();

  addPulseEvent(state, 'setup_updated', authorName, `${authorName} updated hackathon setup.`);
  saveHackathon(sessionCode, state);
  return { ok: true, state };
}

function createTask(sessionCode, taskData, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  if (!taskData || typeof taskData.title !== 'string' || !taskData.title.trim()) {
    return { ok: false, error: 'Task title is required' };
  }

  const status = taskData.status || 'To Do';
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  const priority = taskData.priority || 'Medium';
  if (!VALID_PRIORITIES.includes(priority)) {
    return { ok: false, error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` };
  }

  if (status === 'Blocked' && (!taskData.blockedReason || !taskData.blockedReason.trim())) {
    return { ok: false, error: 'Blocked reason is required when status is Blocked' };
  }

  const now = Date.now();
  const id = `task_${now}_${crypto.randomBytes(3).toString('hex')}`;
  const task = {
    id,
    title: taskData.title.trim().slice(0, 120),
    description: (taskData.description || '').trim().slice(0, 500),
    acceptanceCriteria: (taskData.acceptanceCriteria || '').trim().slice(0, 300),
    status,
    priority,
    assignee: (taskData.assignee || '').trim().slice(0, 40),
    dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : null,
    milestoneId: (taskData.milestoneId || '').trim(),
    blockedReason: (taskData.blockedReason || '').trim().slice(0, 200),
    relevantFiles: Array.isArray(taskData.relevantFiles)
      ? taskData.relevantFiles.map((f) => String(f).trim()).filter(Boolean)
      : [],
    createdAt: now,
    updatedAt: now,
  };

  state.tasks = state.tasks || [];
  state.tasks.push(task);

  addPulseEvent(state, 'task_created', authorName, `${authorName} created task "${task.title}".`, { taskId: task.id });
  saveHackathon(sessionCode, state);
  return { ok: true, task, state };
}

function updateTask(sessionCode, taskId, updates, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  const task = (state.tasks || []).find((t) => t.id === taskId);
  if (!task) return { ok: false, error: 'Task not found' };

  if (updates.status !== undefined) {
    if (!VALID_STATUSES.includes(updates.status)) {
      return { ok: false, error: `Invalid status: ${updates.status}` };
    }
    if (updates.status === 'Blocked' && !task.blockedReason && (!updates.blockedReason || !updates.blockedReason.trim())) {
      return { ok: false, error: 'Blocked reason is required when status is Blocked' };
    }
    const prevStatus = task.status;
    task.status = updates.status;
    if (prevStatus !== task.status) {
      addPulseEvent(
        state,
        task.status === 'Blocked' ? 'blocker_raised' : 'task_status',
        authorName,
        `${authorName} moved "${task.title}" to ${task.status}.`,
        { taskId, oldStatus: prevStatus, newStatus: task.status }
      );
    }
  }

  if (updates.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(updates.priority)) {
      return { ok: false, error: `Invalid priority: ${updates.priority}` };
    }
    task.priority = updates.priority;
  }

  if (typeof updates.title === 'string' && updates.title.trim()) {
    task.title = updates.title.trim().slice(0, 120);
  }
  if (typeof updates.description === 'string') {
    task.description = updates.description.trim().slice(0, 500);
  }
  if (typeof updates.acceptanceCriteria === 'string') {
    task.acceptanceCriteria = updates.acceptanceCriteria.trim().slice(0, 300);
  }
  if (updates.assignee !== undefined) {
    task.assignee = String(updates.assignee || '').trim().slice(0, 40);
  }
  if (updates.dueDate !== undefined) {
    task.dueDate = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
  }
  if (updates.milestoneId !== undefined) {
    task.milestoneId = String(updates.milestoneId || '').trim();
  }
  if (updates.blockedReason !== undefined) {
    task.blockedReason = String(updates.blockedReason || '').trim().slice(0, 200);
  }
  if (Array.isArray(updates.relevantFiles)) {
    task.relevantFiles = updates.relevantFiles.map((f) => String(f).trim()).filter(Boolean);
  }

  task.updatedAt = Date.now();
  saveHackathon(sessionCode, state);
  return { ok: true, task, state };
}

function deleteTask(sessionCode, taskId, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  const idx = (state.tasks || []).findIndex((t) => t.id === taskId);
  if (idx === -1) return { ok: false, error: 'Task not found' };

  const [removed] = state.tasks.splice(idx, 1);
  addPulseEvent(state, 'task_deleted', authorName, `${authorName} deleted task "${removed.title}".`, { taskId });
  saveHackathon(sessionCode, state);
  return { ok: true, taskId, state };
}

function updateMilestone(sessionCode, milestoneId, updates, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  const milestone = (state.milestones || []).find((m) => m.id === milestoneId);
  if (!milestone) return { ok: false, error: 'Milestone not found' };

  if (updates.completed !== undefined) {
    milestone.completed = !!updates.completed;
    milestone.completedAt = milestone.completed ? Date.now() : null;
    addPulseEvent(
      state,
      'milestone_completed',
      authorName,
      `${authorName} marked milestone "${milestone.title}" as ${milestone.completed ? 'completed' : 'in progress'}.`,
      { milestoneId }
    );
  }
  if (updates.targetDeadline) {
    milestone.targetDeadline = new Date(updates.targetDeadline).toISOString();
  }

  saveHackathon(sessionCode, state);
  return { ok: true, milestone, state };
}

function updateDeliverable(sessionCode, deliverableId, updates, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  const del = (state.deliverables || []).find((d) => d.id === deliverableId);
  if (!del) return { ok: false, error: 'Deliverable not found' };

  if (typeof updates.url === 'string') {
    del.url = updates.url.trim().slice(0, 300);
  }
  if (updates.completed !== undefined) {
    del.completed = !!updates.completed;
  }

  saveHackathon(sessionCode, state);
  return { ok: true, deliverable: del, state };
}

function updateNotes(sessionCode, notesUpdates, authorName) {
  const state = getHackathonState(sessionCode, authorName);
  if (!state) return { ok: false, error: 'Session not found' };

  const n = state.notes;
  const fields = ['problemStatement', 'proposedSolution', 'architectureDecisions', 'apiContracts', 'knownRisks', 'demoScript'];
  for (const f of fields) {
    if (typeof notesUpdates[f] === 'string') {
      n[f] = notesUpdates[f].slice(0, 5000);
    }
  }
  n.lastUpdatedBy = authorName || 'Unknown';
  n.updatedAt = Date.now();

  addPulseEvent(state, 'notes_updated', authorName, `${authorName} updated project notes.`);
  saveHackathon(sessionCode, state);
  return { ok: true, notes: n, state };
}

function clearHackathonSession(sessionCode) {
  if (sessionCode) {
    sessionStates.delete(sessionCode);
  }
}

module.exports = {
  getHackathonState,
  updateSetup,
  createTask,
  updateTask,
  deleteTask,
  updateMilestone,
  updateDeliverable,
  updateNotes,
  clearHackathonSession,
  clearSession: clearHackathonSession,
  getNextBestActions,
};
