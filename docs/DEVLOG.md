# Parallel Engineering Devlog

## 2026-11-05: Session Wrapped Flagship Feature Implementation

### Overview
Implemented "Session Wrapped", an animated, shareable Spotify-Wrapped-style retrospective recap presented to every collaborator when a Parallel session ends (and accessible anytime via `parallel.openWrapped`).

### Architectural Highlights
1. **Authoritative, Pure Stats Module (`server/wrapped/stats.js`):**
   - Pure, deterministic calculation function `computeWrapped(sessionSnapshot)` verified via standalone unit tests.
   - Longest focus streak detection: measures consecutive edit event clusters where no gap exceeds 60 seconds.
   - Peak velocity analysis: 60-second sliding/bucketed minute with the highest density of edit events.
   - Automated superlative awards: *Session MVP* (highest contribution percentage), *Night Owl* (late-night sprinting after 10 PM), *The Fixer* (most characters deleted), *Silent Observer* (guest with 0 edits), *Speed Typer* (highest chars added per active minute), and *Gatekeeper* (host approving the most edit requests).
   - Strict security: Name sanitization, length-capping (max 32 chars), GitHub login validation against `/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/`, and total exclusion of document text, secrets, terminal buffers, or snapshots.

2. **Distributed Git Commit Attribution (`extension/parallel/src/wrapped/gitStats.ts`):**
   - Server cannot access local Git repositories.
   - Upon receiving the `wrapped` broadcast, the superhost's extension uses `child_process.execFile` (`git log` with unit separators) to count commits created between `startedAt` and `endedAt`.
   - Parses `Co-authored-by:` git trailers to attribute commits per collaborator.
   - Communicates final counts back via `wrapped_commits` (authoritatively restricted to the superhost socket).

3. **Privacy-Preserving GitHub Avatars (`extension/parallel/src/wrapped/avatar.ts`):**
   - Uses `vscode.authentication.getSession('github', ['read:user'], { silent: true })` to query the authenticated GitHub profile without prompting the user.
   - Configurable setting `parallel.wrapped.useGithubAvatar` (default: `true`).
   - If disabled or if session is unauthenticated, gracefully renders an initials circle badge in the collaborator's cursor accent color.

4. **Story Webview Shell & Loud Visual Design System (`extension/parallel/src/wrapped/wrappedHtml.ts`):**
   - 720x1280 9:16 responsive stage scaled via CSS `transform: scale(...)` to any panel dimension.
   - Cyberpunk/Gen-Z aesthetic: `#0B0720` ink base, radial neon glows (hot magenta `#FF2E93`, violet `#7B3FF2`, cyan `#22E4FF`, lime `#C6FF3D`), 6% diagonal stripes, and rotated outline typography (`PARALLEL`).
   - 7-slide story structure:
     1. Cover (giant bold typography, code, date)
     2. Total Session Time (rotated lime banner with count-up ticker)
     3. Collaborators (avatar rings, role badges, contribution percentage bars, commit counts)
     4. By the Numbers (2x2 stat tiles for commits, secrets masked, longest focus, and edit requests)
     5. Peak Velocity (minute edit count and activity sparkline)
     6. Superlatives & MVP (MVP spotlight card and superlative award chips)
     7. Shareable Summary Card (integrated recap card with export controls)
   - Strict CSP with dynamic nonces, HTML escaping across all dynamic attributes, and complete offline font fallback.

5. **Motion, Accessibility & Auto-Advance:**
   - Smooth count-up animations for numbers and percentages.
   - Fluid bar-filling transitions on slide entrance.
   - Bouncy pop-in transitions for stat tiles.
   - Story progress bars advancing every 4.5 seconds.
   - Tap/click zone navigation (left 50% / right 50%), keyboard arrows and Spacebar navigation.
   - Hold-to-pause: holding pointer/mouse down pauses progress and animations, resuming on release.
   - Full compliance with `prefers-reduced-motion`: turns off auto-advance and displays static final numbers immediately.
   - Semantic ARIA roles (`role="region"`, `role="progressbar"`, `role="button"`) and keyboard accessibility.

6. **Export & Replay Integration:**
   - Standalone HTML export: self-contained single file that can be opened in any web browser without server or network dependencies.
   - PNG export: client-side rasterization using SVG `foreignObject` to `<canvas>`, saving a shareable 720x1280 image (with automatic fallback to HTML export).
   - "Watch replay" buttons wired to `parallel.openLastReplay`.
