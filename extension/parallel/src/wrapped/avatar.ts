import * as vscode from 'vscode';
import { WrappedParticipant } from './types';

const GITHUB_LOGIN_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * Reads the GitHub login silently from the active VS Code authentication session
 * without prompting the user, respecting the parallel.wrapped.useGithubAvatar setting.
 */
export async function getSilentGithubLogin(): Promise<string | null> {
  const enabled = vscode.workspace
    .getConfiguration('parallel')
    .get<boolean>('wrapped.useGithubAvatar', true);
  if (!enabled) {
    return null;
  }

  try {
    const authSession = await vscode.authentication.getSession('github', ['read:user'], { silent: true });
    if (authSession && authSession.account && authSession.account.label) {
      const label = authSession.account.label.trim();
      if (GITHUB_LOGIN_REGEX.test(label)) {
        return label;
      }
    }
  } catch {
    // Non-blocking: fail silently if user is not signed in
  }
  return null;
}

/**
 * Returns GitHub avatar URL (128px) if login is valid.
 */
export function getAvatarUrl(login: string | null | undefined): string | null {
  if (typeof login === 'string' && GITHUB_LOGIN_REGEX.test(login.trim())) {
    return `https://github.com/${encodeURIComponent(login.trim())}.png?size=128`;
  }
  return null;
}

/**
 * Returns 1-2 uppercase initials for a participant display name.
 */
export function getInitials(name: string): string {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders avatar HTML with GitHub image and initials circle fallback.
 */
export function renderAvatarHtml(p: WrappedParticipant): string {
  const avatarUrl = getAvatarUrl(p.githubLogin);
  const initials = escapeHtml(getInitials(p.name));
  const color = escapeHtml(p.color || '#C6FF3D');
  const name = escapeHtml(p.name);

  if (avatarUrl) {
    return `
      <div class="avatar-wrap" style="--ring-color: ${color};">
        <img class="avatar-img" src="${avatarUrl}" alt="${name}" />
        <div class="avatar-initials" style="display:none; background-color:${color};" aria-hidden="true">${initials}</div>
      </div>
    `.trim();
  }

  return `
    <div class="avatar-wrap" style="--ring-color: ${color};">
      <div class="avatar-initials" style="background-color:${color};" aria-hidden="true">${initials}</div>
    </div>
  `.trim();
}
