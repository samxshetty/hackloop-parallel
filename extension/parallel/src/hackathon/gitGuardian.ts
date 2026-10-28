import * as vscode from 'vscode';
import { exec } from 'child_process';
import { GitGuardianInfo, Task } from './types';

function runGitCommand(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

export async function inspectGitRepository(tasks: Task[] = [], currentUserName: string = ''): Promise<GitGuardianInfo> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return {
      isGitRepo: false,
      currentBranch: null,
      uncommittedChanges: 0,
      unresolvedConflicts: [],
      changedFiles: [],
      recentCommits: [],
      potentialOverlaps: [],
      errorMessage: 'No workspace folder opened',
    };
  }

  const rootPath = folders[0].uri.fsPath;

  try {
    // 1. Check if it's a git repo & get branch
    let branch = 'unknown';
    try {
      const branchOutput = await runGitCommand('git rev-parse --abbrev-ref HEAD', rootPath);
      branch = branchOutput.trim() || 'HEAD';
    } catch {
      return {
        isGitRepo: false,
        currentBranch: null,
        uncommittedChanges: 0,
        unresolvedConflicts: [],
        changedFiles: [],
        recentCommits: [],
        potentialOverlaps: [],
        errorMessage: 'Workspace folder is not a Git repository',
      };
    }

    // 2. Check uncommitted changes
    let changedFiles: string[] = [];
    try {
      const statusOutput = await runGitCommand('git status --porcelain', rootPath);
      const lines = statusOutput.split('\n').filter((l) => l.trim().length > 0);
      changedFiles = lines.map((l) => l.slice(3).trim());
    } catch {
      changedFiles = [];
    }

    // 3. Check unresolved conflicts
    let unresolvedConflicts: string[] = [];
    try {
      const conflictOutput = await runGitCommand('git diff --name-only --diff-filter=U', rootPath);
      unresolvedConflicts = conflictOutput.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    } catch {
      unresolvedConflicts = [];
    }

    // 4. Recent commits
    let recentCommits: { hash: string; message: string; author?: string }[] = [];
    try {
      const logOutput = await runGitCommand('git log -n 5 --pretty=format:"%h|%an|%s"', rootPath);
      recentCommits = logOutput
        .split('\n')
        .map((l) => l.trim().replace(/^"|"$/g, ''))
        .filter((l) => l.includes('|'))
        .map((l) => {
          const parts = l.split('|');
          return {
            hash: parts[0] || '',
            author: parts[1] || 'Author',
            message: parts.slice(2).join('|'),
          };
        });
    } catch {
      recentCommits = [];
    }

    // 5. Potential overlapping work:
    // Compare local changed files with relevantFiles of tasks assigned to teammates (not current user)
    const potentialOverlaps: { file: string; taskTitle: string; assignee: string }[] = [];
    if (changedFiles.length > 0 && Array.isArray(tasks)) {
      for (const t of tasks) {
        // Only inspect active tasks assigned to someone else
        if (t.status === 'Done') { continue; }
        if (!t.assignee || t.assignee.toLowerCase() === currentUserName.toLowerCase()) { continue; }
        if (!Array.isArray(t.relevantFiles) || t.relevantFiles.length === 0) { continue; }

        for (const rf of t.relevantFiles) {
          const cleanRf = rf.replace(/\\/g, '/');
          const matched = changedFiles.find((cf) => {
            const cleanCf = cf.replace(/\\/g, '/');
            return cleanCf.endsWith(cleanRf) || cleanRf.endsWith(cleanCf);
          });
          if (matched) {
            potentialOverlaps.push({
              file: matched,
              taskTitle: t.title,
              assignee: t.assignee,
            });
          }
        }
      }
    }

    return {
      isGitRepo: true,
      currentBranch: branch,
      uncommittedChanges: changedFiles.length,
      unresolvedConflicts,
      changedFiles,
      recentCommits,
      potentialOverlaps,
    };
  } catch (err: any) {
    return {
      isGitRepo: false,
      currentBranch: null,
      uncommittedChanges: 0,
      unresolvedConflicts: [],
      changedFiles: [],
      recentCommits: [],
      potentialOverlaps: [],
      errorMessage: err?.message || 'Failed to inspect Git status safely',
    };
  }
}
