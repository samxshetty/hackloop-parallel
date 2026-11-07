export const MAX_PATH_LENGTH = 260;
export const MAX_PROJECT_FILES = 500;
export const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_ACTIVE_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB
export const BATCH_BYTE_LIMIT = 1.5 * 1024 * 1024; // 1.5 MB batch to stay well under 5 MB MAX_PAYLOAD

export function sanitizeRelativePath(relPath: string): string | null {
  if (typeof relPath !== 'string') return null;
  if (relPath.length === 0 || relPath.length > MAX_PATH_LENGTH) return null;
  if (relPath.includes('\0')) return null;

  if (/^[a-zA-Z]:/.test(relPath)) return null;

  let p = relPath.replace(/\\/g, '/');
  if (p.startsWith('/')) return null;

  const segments = p.split('/');
  const normalizedSegments: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '') return null;
    if (seg === '.') continue;
    if (seg === '..') return null;
    normalizedSegments.push(seg);
  }

  if (normalizedSegments.length === 0) return null;
  return normalizedSegments.join('/');
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.vscode',
  '.idea',
  '.aws',
  '.ssh',
]);

const MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.bmp', '.tiff',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.exe', '.bin', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.vsix',
]);

const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

export function isSensitiveFile(normalizedPath: string): boolean {
  const parts = normalizedPath.split('/');
  const fileName = parts[parts.length - 1].toLowerCase();

  for (const part of parts.slice(0, -1)) {
    const lower = part.toLowerCase();
    if (lower === '.aws' || lower === '.ssh') return true;
  }

  if (fileName === '.env') return true;
  if (fileName.startsWith('.env.') && fileName !== '.env.example') return true;

  if (fileName.endsWith('.pem') || fileName.endsWith('.key') ||
      fileName.endsWith('.p12') || fileName.endsWith('.pfx')) {
    return true;
  }

  if (fileName.startsWith('id_rsa')) return true;
  if (fileName === '.npmrc' || fileName === '.netrc') return true;
  if (fileName.startsWith('credentials') && fileName.endsWith('.json')) return true;
  if (fileName.includes('secrets') || fileName.includes('secret')) return true;

  return false;
}

export function matchGlob(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;
  const regexStr = '^' + pattern
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*')
    .replace(/\?/g, '.') + '$';
  try {
    const reg = new RegExp(regexStr, 'i');
    return reg.test(text);
  } catch {
    return false;
  }
}

export interface ExcludeOptions {
  activeFile?: string;
  includeSensitiveFiles?: boolean;
  exclude?: string[];
}

export function isExcludedPath(relPath: string, options: ExcludeOptions = {}): boolean {
  const sanitized = sanitizeRelativePath(relPath);
  if (!sanitized) return true;

  if (options.activeFile) {
    const activeSanitized = sanitizeRelativePath(options.activeFile);
    if (activeSanitized && activeSanitized.toLowerCase() === sanitized.toLowerCase()) {
      return false;
    }
  }

  const parts = sanitized.split('/');
  const fileName = parts[parts.length - 1];
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()!.toLowerCase() : '';

  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }
  if (EXCLUDED_DIRS.has(fileName)) return true;

  if (fileName.toLowerCase().endsWith('.vsix')) return true;
  if (LOCKFILES.has(fileName.toLowerCase())) return true;
  if (MEDIA_EXTENSIONS.has(ext)) return true;

  if (!options.includeSensitiveFiles && isSensitiveFile(sanitized)) {
    return true;
  }

  if (Array.isArray(options.exclude)) {
    for (const pat of options.exclude) {
      if (typeof pat === 'string' && pat.trim()) {
        const cleanPat = pat.trim();
        if (matchGlob(cleanPat, sanitized) || matchGlob(cleanPat, fileName)) {
          return true;
        }
      }
    }
  }

  return false;
}
