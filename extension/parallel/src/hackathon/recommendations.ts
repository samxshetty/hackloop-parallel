import { HackathonState, Recommendation } from './types';

export function calculateNextBestActions(state: HackathonState | null, now: number = Date.now()): Recommendation[] {
  const recommendations: Recommendation[] = [];
  if (!state) { return recommendations; }

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const milestones = Array.isArray(state.milestones) ? state.milestones : [];
  const deliverables = Array.isArray(state.deliverables) ? state.deliverables : [];
  const setup = state.setup || {};

  const deadlineMs = setup.deadline ? new Date(setup.deadline).getTime() : 0;
  const hasValidDeadline = !isNaN(deadlineMs) && deadlineMs > 0;
  const timeRemainingMs = hasValidDeadline ? deadlineMs - now : null;
  const hoursRemaining = timeRemainingMs !== null ? timeRemainingMs / (1000 * 60 * 60) : null;

  // 1. Critical Rule: Blocked tasks
  const blockedTasks = tasks.filter((t) => t.status === 'Blocked');
  for (const t of blockedTasks) {
    recommendations.push({
      id: `rec_blocker_${t.id}`,
      urgency: 'critical',
      category: 'blocker',
      title: `Unblock "${t.title}"`,
      description: t.blockedReason ? `Blocker: ${t.blockedReason}` : 'Task is blocked without explanation.',
      reason: `Resolving blocked tasks prevents bottlenecking dependent teammates. Priority is ${t.priority}.`,
      suggestedAction: t.assignee ? `Sync with ${t.assignee} to resolve dependency` : 'Assign task and resolve dependency',
      relatedTaskId: t.id,
    });
  }

  // 2. Critical Rule: Deadline crunch with high/critical items
  const activeTasks = tasks.filter((t) => t.status !== 'Done');
  const criticalOrHigh = activeTasks.filter((t) => t.priority === 'Critical' || t.priority === 'High');

  if (hoursRemaining !== null) {
    if (hoursRemaining <= 0) {
      recommendations.push({
        id: 'rec_deadline_passed',
        urgency: 'critical',
        category: 'deadline',
        title: 'Deadline reached — Finalize Submission Now',
        description: 'The scheduled hackathon deadline has arrived.',
        reason: 'Submit current demo link and documentation immediately to avoid disqualification.',
        suggestedAction: 'Verify submission checklist and submit portal entry',
      });
    } else if (hoursRemaining < 2 && criticalOrHigh.length > 0) {
      recommendations.push({
        id: 'rec_deadline_crunch',
        urgency: 'critical',
        category: 'deadline',
        title: `Triage remaining ${criticalOrHigh.length} critical/high task(s)`,
        description: `Only ${hoursRemaining.toFixed(1)} hours remaining before submission deadline.`,
        reason: `${criticalOrHigh.length} high/critical priority tasks are not yet Done. Freeze optional features and scope down to essential MVP criteria.`,
        suggestedAction: 'Review task backlog with team and drop non-essential items',
      });
    } else if (hoursRemaining < 4) {
      // 3. Deliverables check when within 4 hours
      const missingSubmission = deliverables.find(
        (d) => (d.label.toLowerCase().includes('submission') || d.label.toLowerCase().includes('devpost')) && (!d.url || !d.completed)
      );
      if (missingSubmission) {
        recommendations.push({
          id: 'rec_missing_submission',
          urgency: 'high',
          category: 'deliverable',
          title: `Setup submission portal link (${missingSubmission.label})`,
          description: `Deliverable "${missingSubmission.label}" is missing or unverified.`,
          reason: 'Hackathon submissions frequently fail due to last-minute portal rush or incomplete project pages.',
          suggestedAction: 'Create draft submission entry and link it in Deliverables',
        });
      }

      const missingDemo = deliverables.find(
        (d) => (d.label.toLowerCase().includes('demo') || d.label.toLowerCase().includes('video')) && (!d.url || !d.completed)
      );
      if (missingDemo) {
        recommendations.push({
          id: 'rec_missing_demo',
          urgency: 'high',
          category: 'deliverable',
          title: `Prepare Live Demo or Video Link (${missingDemo.label})`,
          description: 'Demo deliverable is not yet completed.',
          reason: 'Judges rely heavily on clear live demos or recorded backups if live demos glitch.',
          suggestedAction: 'Record a 2-minute backup walk-through video',
        });
      }
    }
  }

  // 4. Milestone Focus
  const firstIncompleteMilestone = milestones.find((m) => !m.completed);
  if (firstIncompleteMilestone) {
    const tasksForMilestone = activeTasks.filter((t) => t.milestoneId === firstIncompleteMilestone.id);
    recommendations.push({
      id: `rec_milestone_${firstIncompleteMilestone.id}`,
      urgency: firstIncompleteMilestone.id === 'mvp' ? 'high' : 'medium',
      category: 'milestone',
      title: `Complete Milestone: "${firstIncompleteMilestone.title}"`,
      description: firstIncompleteMilestone.description || `Milestone ${firstIncompleteMilestone.title} is currently open.`,
      reason: tasksForMilestone.length > 0
        ? `${tasksForMilestone.length} open task(s) are associated with this milestone.`
        : 'Foundational milestones should be validated before polishing later stages.',
      suggestedAction: `Focus team efforts on closing "${firstIncompleteMilestone.title}"`,
      relatedMilestoneId: firstIncompleteMilestone.id,
    });
  }

  // 5. Overdue Tasks
  const overdueTasks = activeTasks.filter((t) => {
    if (!t.dueDate) { return false; }
    const due = new Date(t.dueDate).getTime();
    return !isNaN(due) && due < now;
  });

  for (const t of overdueTasks) {
    recommendations.push({
      id: `rec_overdue_${t.id}`,
      urgency: 'high',
      category: 'deadline',
      title: `Overdue: "${t.title}"`,
      description: `Task was due on ${new Date(t.dueDate as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      reason: `Task has not been marked Done despite reaching target due time.`,
      suggestedAction: 'Update task progress or reassign resources',
      relatedTaskId: t.id,
    });
  }

  // 6. High/Critical unassigned tasks
  const unassignedCritical = activeTasks.filter(
    (t) => (t.priority === 'Critical' || t.priority === 'High') && (!t.assignee || t.assignee.trim() === '')
  );
  for (const t of unassignedCritical) {
    recommendations.push({
      id: `rec_unassigned_${t.id}`,
      urgency: 'medium',
      category: 'workload',
      title: `Assign high-priority task: "${t.title}"`,
      description: `Priority is ${t.priority} but no team member is assigned.`,
      reason: 'Critical work without an owner is prone to being overlooked.',
      suggestedAction: 'Assign an owner to own completion',
      relatedTaskId: t.id,
    });
  }

  // 7. All core done
  if (activeTasks.length === 0 && tasks.length > 0) {
    recommendations.push({
      id: 'rec_all_done',
      urgency: 'info',
      category: 'deliverable',
      title: 'All tasks completed — Practice Final Demo Script',
      description: 'Your task board has zero active tasks remaining.',
      reason: 'Use remaining time to rehearse the presentation script and test edge cases.',
      suggestedAction: 'Open Project Notes -> Demo Script and do a timed team dry run',
    });
  }

  const urgencyWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, info: 1 };
  recommendations.sort((a, b) => (urgencyWeight[b.urgency] || 0) - (urgencyWeight[a.urgency] || 0));

  return recommendations;
}
