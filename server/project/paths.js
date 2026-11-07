'use strict';

const MAX_PATH_LENGTH = 260;
const MAX_PROJECT_FILES = 500;
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_ACTIVE_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Normalizes and sanitizes a relative workspace path.
 * Rejects absolute paths, drive letters, "..", empty segments, null bytes, and over-long paths.
 *
 * @param {string} relPath
 * @returns {string|null} Normalized forward-slash path, or null if invalid
 */
function sanitizeRelativePath(relPath) {
  if (typeof relPath !== 'string') return null;
  if (relPath.length === 0 || relPath.length > MAX_PATH_LENGTH) return null;
  if (relPath.includes('\0')) return null;

  // Reject drive letters (e.g. C:, c:/)
  if (/^[a-zA-Z]:/.test(relPath)) return null;

  // Normalize backslashes to forward slashes
  let p = relPath.replace(/\\/g, '/');

  // Reject starting with a slash (absolute path)
  if (p.startsWith('/')) return null;

  // Split into segments and validate each
  const segments = p.split('/');
  const normalizedSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // Empty segment (from consecutive slashes "//" or trailing slash)
    if (seg === '') return null;
    // Current dir segment: ignore if intermediate, but if only segment return null
    if (seg === '.') continue;
    // Parent traversal: reject immediately
    if (seg === '..') return null;
    normalizedSegments.push(seg);
  }

  if (normalizedSegments.length === 0) return null;
  return normalizedSegments.join('/');
}

/**
 * Checks whether a buffer appears to be binary.
 * Inspects up to the first 8 KB for NUL bytes.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isBinaryBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// Default excluded directory names or root prefixes
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

// Media / binary extensions
const MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.bmp', '.tiff',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.pdf', '.exe', '.bin', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.vsix',
]);

// Lockfiles
const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

/**
 * Checks if a filename or path represents a sensitive file.
 *
 * @param {string} normalizedPath
 * @returns {boolean}
 */
function isSensitiveFile(normalizedPath) {
  const parts = normalizedPath.split('/');
  const fileName = parts[parts.length - 1].toLowerCase();

  // Directory check in path
  for (const part of parts.slice(0, -1)) {
    const lower = part.toLowerCase();
    if (lower === '.aws' || lower === '.ssh') return true;
  }

  // .env and .env.* (except .env.example)
  if (fileName === '.env') return true;
  if (fileName.startsWith('.env.') && fileName !== '.env.example') return true;

  // Key/cert files
  if (fileName.endsWith('.pem') || fileName.endsWith('.key') ||
      fileName.endsWith('.p12') || fileName.endsWith('.pfx')) {
    return true;
  }

  // SSH keys
  if (fileName.startsWith('id_rsa')) return true;

  // NPM/Net RC
  if (fileName === '.npmrc' || fileName === '.netrc') return true;

  // Credentials
  if (fileName.startsWith('credentials') && fileName.endsWith('.json')) return true;

  // *secrets* in filename
  if (fileName.includes('secrets') || fileName.includes('secret')) return true;

  return false;
}

/**
 * Matches simple glob / wildcard pattern against a path.
 * Supports '*' and '**'.
 *
 * @param {string} pattern
 * @param {string} text
 * @returns {boolean}
 */
function matchGlob(pattern, text) {
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

/**
 * Determines whether a given relative path should be excluded from sharing.
 *
 * @param {string} relPath - Sanitized relative path
 * @param {object} [options]
 * @param {string} [options.activeFile] - Currently active file (exempt from exclusion)
 * @param {boolean} [options.includeSensitiveFiles=false] - If true, sensitive files are not excluded
 * @param {string[]} [options.exclude=[]] - Custom glob patterns
 * @returns {boolean}
 */
function isExcludedPath(relPath, options = {}) {
  const sanitized = sanitizeRelativePath(relPath);
  if (!sanitized) return true;

  // Active file exception: the file that was active when session started is always shared
  if (options.activeFile) {
    const activeSanitized = sanitizeRelativePath(options.activeFile);
    if (activeSanitized && activeSanitized.toLowerCase() === sanitized.toLowerCase()) {
      return false;
    }
  }

  const parts = sanitized.split('/');
  const fileName = parts[parts.length - 1];
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop().toLowerCase() : '';

  // Check excluded directories
  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }
  if (EXCLUDED_DIRS.has(fileName)) return true;

  // VSIX check
  if (fileName.toLowerCase().endsWith('.vsix')) return true;

  // Lockfile check
  if (LOCKFILES.has(fileName.toLowerCase())) return true;

  // Media / binary extensions
  if (MEDIA_EXTENSIONS.has(ext)) return true;

  // Sensitive files
  if (!options.includeSensitiveFiles && isSensitiveFile(sanitized)) {
    return true;
  }

  // Custom exclude patterns
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

module.exports = {
  MAX_PATH_LENGTH,
  MAX_PROJECT_FILES,
  MAX_FILE_BYTES,
  MAX_ACTIVE_FILE_BYTES,
  MAX_TOTAL_BYTES,
  sanitizeRelativePath,
  isBinaryBuffer,
  isSensitiveFile,
  isExcludedPath,
};
