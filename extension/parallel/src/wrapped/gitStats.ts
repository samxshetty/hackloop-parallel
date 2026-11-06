import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { WrappedParticipant, GitCommitStats } from './types';

const UNIT_SEP = '\x1f';
const RECORD_SEP = '\x1e';

/**
 * Counts Git commits created between startedAt and endedAt in the workspace folder.
 * Uses child_process.execFile (args as an array, not a shell).
 * Parses commit authors and Co-authored-by trailers to attribute commits per participant.
 * Gracefully returns 0 commits if Git is unavailable or workspace is not a Git repository.
 *
 * @param startedAt Millisecond timestamp of session start
 * @param endedAt Millisecond timestamp of session end
 * @param participants List of session participants to attribute
 */
export async function countSessionCommits(
  startedAt: number,
  endedAt: number,
  participants: WrappedParticipant[]
): Promise<GitCommitStats> {
  const result: GitCommitStats = {
    totalCommits: 0,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      commits: 0,
    })),
  };

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return result;
  }
  const cwd = folders[0].uri.fsPath;

  // Add 1 second buffer to timestamps to avoid boundary exclusion
  const sinceIso = new Date(startedAt - 1000).toISOString();
  const untilIso = new Date(endedAt + 1000).toISOString();

  // Unit separator: %H (hash) \x1f %an (author name) \x1f %ae (author email) \x1f %B (raw body) \x1e (record sep)
  const args = [
    'log',
    `--since=${sinceIso}`,
    `--until=${untilIso}`,
    `--format=%H${UNIT_SEP}%an${UNIT_SEP}%ae${UNIT_SEP}%B${RECORD_SEP}`,
  ];

  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) {
        // Git error, not a repo, or empty output: return 0 commits gracefully
        resolve(result);
        return;
      }

      const records = stdout.split(RECORD_SEP).map((r) => r.trim()).filter(Boolean);
      result.totalCommits = records.length;

      const pMap = new Map<string, { id?: string; name: string; commits: number }>();
      for (const p of result.participants) {
        pMap.set(p.name.toLowerCase().trim(), p);
      }

      // Check each commit for author and Co-authored-by trailers
      for (const record of records) {
        const parts = record.split(UNIT_SEP);
        if (parts.length < 4) {
          continue;
        }
        const authorName = (parts[1] || '').trim().toLowerCase();
        const body = parts.slice(3).join(UNIT_SEP);

        const creditedInThisCommit = new Set<string>();

        // Credit author
        const authorEntry = pMap.get(authorName);
        if (authorEntry) {
          authorEntry.commits += 1;
          creditedInThisCommit.add(authorName);
        } else {
          // Attempt partial match (e.g. first name)
          for (const [pNameLower, entry] of pMap.entries()) {
            if (authorName.includes(pNameLower) || pNameLower.includes(authorName)) {
              entry.commits += 1;
              creditedInThisCommit.add(pNameLower);
              break;
            }
          }
        }

        // Parse Co-authored-by trailers: Co-authored-by: Name <email>
        const trailerRegex = /Co-authored-by:\s*([^<\r\n]+?)\s*<[^>\r\n]+>/gi;
        let match: RegExpExecArray | null;
        while ((match = trailerRegex.exec(body)) !== null) {
          const coAuthorName = (match[1] || '').trim().toLowerCase();
          if (!coAuthorName || creditedInThisCommit.has(coAuthorName)) {
            continue;
          }

          const coAuthorEntry = pMap.get(coAuthorName);
          if (coAuthorEntry) {
            coAuthorEntry.commits += 1;
            creditedInThisCommit.add(coAuthorName);
          } else {
            // Partial match
            for (const [pNameLower, entry] of pMap.entries()) {
              if (
                !creditedInThisCommit.has(pNameLower) &&
                (coAuthorName.includes(pNameLower) || pNameLower.includes(coAuthorName))
              ) {
                entry.commits += 1;
                creditedInThisCommit.add(pNameLower);
                break;
              }
            }
          }
        }
      }

      resolve(result);
    });
  });
}
