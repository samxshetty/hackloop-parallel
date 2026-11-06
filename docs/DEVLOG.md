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

---

## 2026-11-06: Whole-Project Sharing Architecture & Multi-File Live Collaboration

### Overview
Expanded the session sharing model from a single active document to the entire host workspace folder. Guests can explore nested folders and open any project file on-demand via a dedicated "Project Files" tree view, while strict per-file secret masking, role boundaries, edit guards, and contribution ledger aggregation remain enforced.

### Key Architectural Implementations
1. **Authoritative Project Path Sanitization & Exclusions (`server/project/paths.js`, `extension/parallel/src/project/paths.ts`):**
   - Path Sanitizer: Normalizes all paths to forward slashes; rejects absolute paths, drive letters, parent directory traversal (`..`), empty segments, control characters, null bytes (`\0`), and paths exceeding 260 characters.
   - Default Exclusions: Automatically hides internal and build artifacts (`.git/`, `node_modules/`, `dist/`, `out/`, `build/`, `.vscode/`, `.idea/`, `*.vsix`), lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), binary files (detected via 8 KB NUL check), media files, and sensitive credentials (`.env`, `.env.*` except `.env.example`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `.npmrc`, `.netrc`, `.aws/`, `.ssh/`, `credentials*.json`, `*secrets*`).
   - Active-File Exemption: The file that was active when the host started the session is guaranteed to be shared, regardless of normal exclusion rules (still masked by the safety filter).
   - Configurable limits: Maximum 500 files, 1 MB per file (active file up to 4 MB), and 25 MB total project limit.

2. **Per-File Document Store & Protocol (`server/server.js`):**
   - Added `session.files` map (`path -> { raw, masked, spans, count, kinds, size }`) and `session.manifest`.
   - New messages:
     - `project_manifest` (host -> server): Uploads scanned file list with sizes; role-verified.
     - `file_content` (host -> server): Streams file contents in batches under 1.5 MB; server masks secrets and stores masked/raw versions.
     - `file_request` (guest -> server): Requests on-demand file text; rate-limited to 50 req/sec; validates against manifest.
     - `file_response` (server -> guest): Delivers masked content to guests (raw only to hosts).
     - `project_update` (server -> everyone): Broadcasts updated manifest upon session changes and guest approval.
   - Backward Compatibility: `doc` messages without an explicit `path` automatically fall back to the active file.

3. **Guest Experience: "Project Files" Tree View (`extension/parallel/src/project/tree.ts`):**
   - Implemented `vscode.TreeDataProvider<ProjectFileItem>` registered in the Parallel Activity Bar view container next to Participants.
   - Displays nested folders and files in alphabetical order with folders grouped first.
   - Categorized file type icons based on extensions (`file-code`, `file-text`, `file`).
   - Virtual Document Scheme: Clicking any file opens `parallel:/<relPath>` through `vscode.workspace.registerTextDocumentContentProvider`. Content is fetched lazily and cached locally in-memory.

4. **Multi-File Live Editing & Host Sync (`extension/parallel/src/extension.ts`):**
   - Debounced 100ms per-file diff tracking across all workspace files for hosts and granted guests.
   - Host `vscode.workspace.createFileSystemWatcher` listens for external changes, creating/updating docs without echo loops via `localApplying` tracking.
   - Server runs `reconcileGuestEdit` per file; any edit touching hidden secret spans is blocked with authoritative rejection.
   - Contribution ledger aggregates lines and edits across all files per collaborator.

5. **Multi-File Cursors & Jump-To-Person:**
   - Cursor messages carry `path`.
   - Remote cursors are rendered strictly within the corresponding open file.
   - Participants tree dynamically displays the active file name as the participant description (`<role> · <file>`).
   - `parallel.jumpToPerson` automatically opens that collaborator's active file before centering the viewport on their cursor.
