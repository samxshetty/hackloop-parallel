import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  sanitizeRelativePath,
  isExcludedPath,
  isBinaryBuffer,
  MAX_FILE_BYTES,
  MAX_ACTIVE_FILE_BYTES,
  MAX_PROJECT_FILES,
  MAX_TOTAL_BYTES,
  BATCH_BYTE_LIMIT,
} from './paths';

export interface ScannedFile {
  relPath: string;
  absPath: string;
  size: number;
  isActive: boolean;
}

export interface ScanResult {
  files: ScannedFile[];
  manifest: { path: string; size: number }[];
  activeRelativePath: string;
  skippedFiles: string[];
}

let warnedSensitiveThisSession = false;

export function resetScannerWarningState(): void {
  warnedSensitiveThisSession = false;
}

/**
 * Checks if the user enabled includeSensitiveFiles and shows a one-time confirmation modal.
 */
async function confirmSensitiveFiles(config: vscode.WorkspaceConfiguration): Promise<boolean> {
  const includeSensitive = config.get<boolean>('share.includeSensitiveFiles', false);
  if (!includeSensitive) {
    return false;
  }

  if (warnedSensitiveThisSession) {
    return true;
  }

  const pick = await vscode.window.showWarningMessage(
    'Parallel: You have enabled "includeSensitiveFiles". Filenames of sensitive files (like .env) will be visible to guests, though secrets remain masked. Proceed?',
    { modal: true },
    'Proceed',
    'Cancel'
  );

  if (pick === 'Proceed') {
    warnedSensitiveThisSession = true;
    return true;
  }
  return false;
}

/**
 * Scans eligible project files in the workspace folder of the active document.
 */
export async function scanProjectFiles(
  activeDoc: vscode.TextDocument
): Promise<ScanResult> {
  const config = vscode.workspace.getConfiguration('parallel');
  const scope = config.get<string>('share.scope', 'project');
  const customExcludes = config.get<string[]>('share.exclude', []);
  const maxFiles = Math.min(
    MAX_PROJECT_FILES,
    Math.max(1, config.get<number>('share.maxFiles', 500))
  );
  const includeSensitive = await confirmSensitiveFiles(config);

  const activeAbsPath = activeDoc.fileName;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeDoc.uri);

  let activeRelPath = path.basename(activeAbsPath);
  if (workspaceFolder) {
    const rawRel = path.relative(workspaceFolder.uri.fsPath, activeAbsPath);
    activeRelPath = sanitizeRelativePath(rawRel) || path.basename(activeAbsPath);
  }

  const activeText = activeDoc.getText();
  const activeSize = Buffer.byteLength(activeText, 'utf8');

  const activeFileEntry: ScannedFile = {
    relPath: activeRelPath,
    absPath: activeAbsPath,
    size: activeSize,
    isActive: true,
  };

  // Scope: activeFileOnly -> only share the active file
  if (scope === 'activeFileOnly' || !workspaceFolder) {
    return {
      files: [activeFileEntry],
      manifest: [{ path: activeRelPath, size: activeSize }],
      activeRelativePath: activeRelPath,
      skippedFiles: [],
    };
  }

  const rootPath = workspaceFolder.uri.fsPath;
  const scanned: ScannedFile[] = [activeFileEntry];
  const skipped: string[] = [];
  let totalBytes = activeSize;

  const excludeOpts = {
    activeFile: activeRelPath,
    includeSensitiveFiles: includeSensitive,
    exclude: customExcludes,
  };

  async function walkDir(currentDir: string): Promise<void> {
    if (scanned.length >= maxFiles || totalBytes >= MAX_TOTAL_BYTES) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scanned.length >= maxFiles || totalBytes >= MAX_TOTAL_BYTES) {
        break;
      }

      const fullPath = path.join(currentDir, entry.name);
      const rawRel = path.relative(rootPath, fullPath);
      const relPath = sanitizeRelativePath(rawRel);
      if (!relPath) {
        continue;
      }

      // Check symlinks via lstat - do NOT follow symlinks!
      let lstat: fs.Stats;
      try {
        lstat = await fs.promises.lstat(fullPath);
      } catch {
        continue;
      }

      if (lstat.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (isExcludedPath(relPath + '/dummy.txt', excludeOpts)) {
          continue;
        }
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        // Active file is already added at index 0
        if (relPath.toLowerCase() === activeRelPath.toLowerCase()) {
          continue;
        }

        // Check exclusions
        if (isExcludedPath(relPath, excludeOpts)) {
          continue;
        }

        const fileSize = lstat.size;
        if (fileSize > MAX_FILE_BYTES) {
          skipped.push(`${relPath} (over 1 MB)`);
          continue;
        }

        if (totalBytes + fileSize > MAX_TOTAL_BYTES) {
          skipped.push(`${relPath} (25 MB total limit reached)`);
          continue;
        }

        // Binary check: read first 8 KB
        try {
          const fd = await fs.promises.open(fullPath, 'r');
          const buf = Buffer.alloc(Math.min(8192, fileSize));
          await fd.read(buf, 0, buf.length, 0);
          await fd.close();

          if (isBinaryBuffer(buf)) {
            continue;
          }
        } catch {
          continue;
        }

        scanned.push({
          relPath,
          absPath: fullPath,
          size: fileSize,
          isActive: false,
        });
        totalBytes += fileSize;
      }
    }
  }

  await walkDir(rootPath);

  if (skipped.length > 0) {
    vscode.window.showInformationMessage(
      `Parallel: ${skipped.length} file(s) skipped due to size limits (max 1 MB per file, 25 MB total).`
    );
  }

  const manifest = scanned.map((f) => ({ path: f.relPath, size: f.size }));
  return {
    files: scanned,
    manifest,
    activeRelativePath: activeRelPath,
    skippedFiles: skipped,
  };
}

/**
 * Uploads project manifest and file contents in batches to the server.
 */
export async function uploadProject(
  scanResult: ScanResult,
  activeDoc: vscode.TextDocument,
  sendMsg: (msg: object) => void
): Promise<void> {
  // 1. Send manifest first
  sendMsg({
    t: 'project_manifest',
    manifest: scanResult.manifest,
  });

  // 2. Prepare batches of file contents
  let currentBatch: { path: string; text: string }[] = [];
  let currentBatchBytes = 0;

  for (const file of scanResult.files) {
    let text = '';
    if (file.isActive) {
      text = activeDoc.getText();
    } else {
      try {
        text = await fs.promises.readFile(file.absPath, 'utf8');
      } catch {
        continue;
      }
    }

    const textBytes = Buffer.byteLength(text, 'utf8');
    if (currentBatchBytes + textBytes > BATCH_BYTE_LIMIT && currentBatch.length > 0) {
      sendMsg({
        t: 'file_content',
        files: currentBatch,
      });
      currentBatch = [];
      currentBatchBytes = 0;
    }

    currentBatch.push({ path: file.relPath, text });
    currentBatchBytes += textBytes;
  }

  if (currentBatch.length > 0) {
    sendMsg({
      t: 'file_content',
      files: currentBatch,
    });
  }
}
