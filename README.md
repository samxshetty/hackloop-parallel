# Parallel

> Live, host-controlled collaborative coding with secret masking, shared terminal, session replay, and git co-authorship.

Parallel (formerly *SuggestLoop*) is a VS Code extension and lightweight WebSocket server engineered for host-controlled pair programming, live mentorship, and collaborative hackathon sprints. Built for **Hackloop S05** (Finite Loop Club, NMAMIT, 2nd-year track, WebRTC technology), Parallel flips the traditional "free-for-all" collaborative editing model on its head: the host maintains complete sovereignty over their codebase. Guests join into an approval lobby using a 6-character session code, view shared code in a secure read-only virtual document, and can only edit when explicitly granted permission. Parallel actively redacts secrets (API keys, credentials, tokens) from guests in real time, streams the host's terminal to promoted hosts with optional typing, tracks granular edit metrics into git `Co-authored-by:` commit trailers, records full session replays with one-click HTML exports, and features a built-in Hackathon Mode command center.

---

## Table of Contents

- [2. The Idea: Why the Host Stays in Control](#2-the-idea-why-the-host-stays-in-control)
- [3. How a Session Works](#3-how-a-session-works)
- [4. Roles Table](#4-roles-table)
- [5. Features](#5-features)
- [6. Architecture & How It Works Under the Hood](#6-architecture--how-it-works-under-the-hood)
- [7. Commands Table](#7-commands-table)
- [8. Getting Started](#8-getting-started)
- [9. Testing with Two Windows & Demo Secrets](#9-testing-with-two-windows--demo-secrets)
- [10. Project Structure](#10-project-structure)
- [11. Voice (Tested & Not Included)](#11-voice-tested--not-included)
- [12. Team & Authorship Table](#12-team--authorship-table)
- [13. Git Workflow & Repository Hygiene](#13-git-workflow--repository-hygiene)
- [14. Known Limitations and Future Work](#14-known-limitations-and-future-work)
- [15. Screenshots](#15-screenshots)

---

## 2. The Idea: Why the Host Stays in Control

Most collaborative editing tools (such as VS Code Live Share) operate on an open-canvas model where every connected participant has direct write access to the host's local files. In fast-paced hackathons, coding interviews, and classroom reviews, this causes three critical problems:

1. **Accidental Breakage:** Uncoordinated simultaneous edits break compiler diagnostics, trigger unintended linter errors, and cause merge thrashing.
2. **Credential Leaks:** Sharing a project file often exposes local `.env` values, API tokens, AWS secrets, or database connection strings to everyone in the session.
3. **Attribution Loss:** When multiple people edit the same buffer, standard git commits credit only the machine running the commit command, erasing team member contributions.

**Parallel solves this by placing the host firmly in the driver's seat:**
- Guests are restricted to a **read-only virtual document** by default.
- The host controls roles and can selectively grant or revoke live edit privileges at any time.
- The server runs an automated **safety filter** that detects and masks sensitive credentials before text ever reaches a guest's screen.
- A tamper-proof **edit guard** prevents guests from overwriting or exposing hidden secrets.
- An authoritative **credit ledger** tracks exact contributions and automatically credits teammates in git commits.

---

## 3. How a Session Works

```
[Superhost] Start Session ──> [Server] Code: K9X2B7 ──> [Guest] Enter Code & Join
     │                                                         │
     ├── Approve Join <────────────────────────────────────────┤ (Lobby Wait)
     │
     ├── File broadcast (10 Secrets Masked) ──────────────────> Read-Only View (parallel:)
     ├── Cursors synced bi-directionally <────────────────────> Cursors synced
     │
     ├── Grant Edit Access ───────────────────────────────────> Live Co-Editing (Diff Sync)
     ├── Share Terminal (Output + Typing Toggle) ─────────────> Mirror Terminal (Host Only)
     │
     └── Commit With Credit (Co-authored-by trailers) ────────> Git Commit Log
```

1. **Start the Session:** The host opens a project file and runs `Parallel: Start Session`, entering their display name.
2. **Generate Session Code:** The server issues a secure, 6-character random alphanumeric session code (e.g., `K9X2B7`).
3. **Guest Join Request:** A guest runs `Parallel: Join Session`, enters the code and their name, and enters a waiting lobby.
4. **Host Approval:** The host receives an in-editor notification: `"<Guest> wants to join. Approve?"`. Upon host approval, the guest is admitted.
5. **Read-Only Virtual Buffer:** The guest's editor opens a read-only document served over the custom `parallel:` URI scheme. Any sensitive credentials matching safety patterns are replaced with bullet markers (`••••••`).
6. **Presence & Navigation:** Remote cursors appear in real time with distinct colors for each collaborator. Teammates can be located instantly via the **Participants sidebar** using click-to-jump.
7. **Permission-Based Editing:** If a guest needs to write code, they run `Parallel: Request Edit Access`. The host approves, promoting the guest to an active editor. The host can revoke edit rights at any time.
8. **Shared Terminal:** The superhost can run `Parallel: Share Terminal` to stream their local terminal output to promoted hosts (guests never receive terminal output), with an option to toggle whether hosts can type commands.
9. **Automatic Credit & Replay:** Every edit is recorded in an authoritative ledger. When work is done, the host runs `Parallel: Commit With Credit` to commit with git co-authorship. A complete session recording is saved and can be replayed or exported.

---

## 4. Roles Table

Roles and permissions are authoritatively enforced by `server/server.js`:

| Capability | Superhost (Creator) | Host (Promoted Co-Host) | Guest (Default Joiner) |
| :--- | :---: | :---: | :---: |
| **Direct File Editing** | Yes | Yes | Only when granted by host |
| **Approve / Deny Join Requests** | Yes | No | No |
| **Change Roles (Promote / Demote)** | Yes | No | No |
| **Grant Live Edit Access** | Yes | Yes | No |
| **Revoke Live Edit Access** | Yes | Yes | No |
| **View Shared Terminal** | Yes | Yes | No (never received) |
| **Start / Stop Shared Terminal** | Yes | No | No |
| **Type in Shared Terminal** | Yes | Only if superhost allows | No (never received) |
| **Access Unmasked Secrets** | Yes | Yes | No (always masked) |

---

## 5. Features

### Core Sessions & Networking
*Code authored by: **J Nishanth Bhat** (Server Core & Protocol) & **Samridh S Shetty** (Client Connection & Flow)*
- **6-Character Session Codes:** Cryptographically random, collision-resistant codes generated with non-ambiguous characters (excluding lookalikes like `0/O` and `1/I`).
- **Lobby & Join Queue:** Host approval gate prevents unwanted access. Rate-limiting protects against brute-force code guessing and spam.
- **Heartbeat & Reconnection:** Automated ping/pong health checks (15-second heartbeat) cleanly handle dropped connections and disconnections.

### Live Collaboration & Sidebar
*Code authored by: **Pratham Shetty** (Activity Bar Sidebar & Click-to-Jump) & **Samridh S Shetty** (Remote Cursor Sync & Virtual Document)*
- **Activity Bar View Container:** Custom "Parallel" Activity Bar icon built with theme-adaptive SVG geometry.
- **Participants Tree View:** Displays all active participants, roles (`superhost`, `host`, `guest`), and visual status icons (`star-full` for hosts, `person` for guests).
- **Click-to-Jump (`parallel.jumpToPerson`):** Click any participant in the sidebar to center the editor on their exact cursor position. Shows an informational notification if the participant has not placed their cursor yet.
- **Auto-Cleanup:** Sidebar automatically refreshes on peer state updates and clears immediately on disconnect or session reset.

### Safety Filter & Edit Guard
*Code authored by: **J Nishanth Bhat** (Secret Patterns Library, Length-Preserving Masking, Edit Guard)*
- **Automated Secret Masking (10 Built-in Patterns):** Server-side regex pattern detection targeting 10 critical credential formats:
  1. AWS Access Keys (`AKIA...`)
  2. OpenAI / Anthropic API Keys (`sk-...`, `sk-ant-...`, `sk-proj-...`)
  3. Stripe API Keys (`sk_live_...`, `rk_live_...`)
  4. GitHub Tokens (`ghp_...`, `gho_...`, `github_pat_...`)
  5. Google API Keys (`AIza...`)
  6. Slack Tokens (`xoxb-...`, `xoxp-...`, `xoxa-...`, etc.)
  7. JSON Web Tokens (`eyJ...`)
  8. PEM Private Keys (`-----BEGIN PRIVATE KEY-----`)
  9. Database URLs with Passwords (`postgres://...`, `mysql://...`, `mongodb://...`)
  10. Password / Secret / Token Assignments (`password = "..."`, `secret: '...'`, `token = "..."`, `api_key = "..."`, `apikey = "..."` >= 6 chars)
  Sensitive regions are redacted with bullet markers (`••••••`) before broadcasting to guests.
- **Tamper-Proof Edit Guard (`reconcileGuestEdit`):** Guest edits are reconciled on the server against the host's unmasked text, guaranteeing that guests cannot reveal or overwrite hidden secrets.
- **Safety Log View (`parallel.showSafetyLog`):** An in-editor audit log showing which secret patterns were identified and masked during the session.

### Credit Ledger & Git Co-Authorship
*Code authored by: **J Nishanth Bhat** (Authoritative Edit Ledger, Metrics Tracker, Commit With Credit)*
- **Authoritative Contribution Tracking:** The server measures net character additions, deletions, and modified line counts per collaborator.
- **Commit With Credit (`parallel.commitWithCredit`):** Computes percentage contributions across the session and automatically prepares a git commit message pre-populated with standard `Co-authored-by: Name <name@parallel.local>` trailers.

### Host-Shared Terminal
*Code authored by: **Samridh S Shetty** (Pseudoterminal Wrapper, Batched Relay, Input Permission Toggle)*
- **Streaming Terminal Broadcast (`parallel.shareTerminal`):** Host streams their active pseudo-terminal output directly to connected hosts in real time. Guests never receive terminal packets.
- **Interactive Typing Control (`parallel.toggleTerminalInput`):** Host can lock terminal input or grant promoted hosts permission to type commands directly into the shared terminal session. Input is tagged with the user's name to prevent impersonation.

### Session Replay & Export
*Code authored by: **Ishaan K** (Authoritative Server Recorder, Webview Replay Player, HTML Exporter)*
- **Full Event Recording:** Captures a timestamped event log of session starts, joins, edits, cursor movements, role changes, and terminal data. Text snapshots are stored pre-masked to protect credentials.
- **Replay Player Webview (`parallel.openLastReplay`, `parallel.openReplayFile`):** Interactive player with scrubber timeline, play/pause controls, speed adjustments (1x to 8x), and participant summary stats.
- **Standalone HTML Export (`parallel.exportReplayHtml`):** Generates a self-contained, single-file HTML recording that can be opened in any web browser without VS Code or the server.

### Admin Dashboard & Hackathon Mode
*Code authored by: **Ishaan K** (Admin Dashboard, Hackathon Mode Store, Next Best Actions, Git Guardian) & **Samridh S Shetty** (Client Dashboard & Webview Integration)*
- **Admin Dashboard (`parallel.openAdminDashboard`):** Webview panel displaying live session counts, active participants, security redaction counts, latency, and server status.
- **Collaborative Hackathon Mode (`parallel.openHackathonMode`):** Built-in sprint companion containing a live countdown timer, synchronized milestone checklist, deliverable tracker, team scratchpad, Next Best Actions recommender, and Git Guardian workspace inspector.

---

## 6. Architecture & How It Works Under the Hood

```
┌────────────────────────────────────────────────────────┐
│                 VS Code Superhost Window               │
│  - Active Editor (hostDoc)                             │
│  - Terminal Manager (ShellPty / Pseudoterminal)        │
│  - Status Bar & Participants Sidebar                   │
└───────────────────────────┬────────────────────────────┘
                            │ WebSocket (ws://localhost:8080)
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Node.js WebSocket Server              │
│  - Session Registry (6-char codes, TTL, Rate-limiting) │
│  - Safety Filter (10 patterns, maskSecrets, edit-guard)│
│  - Authoritative Contribution & Credit Tracker         │
│  - Session Replay Recorder & Hackathon State Store     │
└───────────────┬────────────────────────────▲───────────┘
                │                            │ WebSocket
                │ WebSocket                  │
                ▼                            ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│     VS Code Host Window      │ │     VS Code Guest Window     │
│ - Live Diff Editing (Editor) │ │ - Read-Only Virtual Document │
│ - Shared Terminal (MirrorPty)│ │   (parallel: URI scheme)     │
│ - Remote Cursors & Sidebar   │ │ - Secrets Masked (••••••)    │
│ - Hackathon Mode (Read/Write)│ │ - Remote Cursors & Sidebar   │
└──────────────────────────────┘ └──────────────────────────────┘
```

### Technical Details Verified Under the Hood

1. **6-Character Session Codes:**
   Generated using Node.js `crypto.randomBytes`, removing lookalike characters (`0/O`, `1/I`) to create unambiguous, collision-resistant codes (e.g., `K9X2B7`).
2. **10-Minute Join Window:**
   Session codes accept new join requests for exactly 10 minutes (`CODE_TTL_MS = 10 * 60 * 1000 = 600,000 ms`). Once expired, no new participants can enter, but active participants remain connected.
3. **Multi-Tier Rate Limiting & Protection:**
   The server authoritatively enforces four protective thresholds:
   - Wrong session code attempts: capped at **5 per connection** (`MAX_BAD_CODES = 5`) and **20 per IP per minute** (`MAX_BAD_CODES_PER_IP = 20`).
   - Message flood protection: capped at **200 messages per second per connection** (`MAX_MSGS_PER_SEC = 200`).
   - Maximum message payload: capped at **5 MB per message** (`MAX_PAYLOAD = 5 * 1024 * 1024`). The extension warns and refuses to share files larger than 4 MB.
4. **Server-Enforced Roles:**
   Permissions are authoritatively checked on every incoming message. Only the superhost's role-change requests (`role`), join approvals (`decide`), and edit decisions (`decide_edit`) are accepted. A modified or compromised client cannot self-promote.
5. **100 ms Diff Sync:**
   Local document edits are debounced by 100 ms (`sendTimer = setTimeout(sendDoc, 100)`). The client computes common prefix and suffix bounds against the previous state, applying targeted text replacements (`WorkspaceEdit.replace`) to keep remote cursors stable without jumpiness.
6. **Virtual Read-Only Scheme (`parallel:`):**
   Guests view shared documents through a custom `parallel:` URI scheme registered via `vscode.workspace.registerTextDocumentContentProvider`. When a guest is promoted to host or granted edit access, VS Code seamlessly switches to an editable document instance.
7. **Tamper-Proof Edit Guard (`reconcileGuestEdit`):**
   When an authorized guest edits text that contains masked secrets, the server computes the change region against the masked version. If the edit overlaps any hidden secret span, the edit is immediately rejected with:
   ```
   That value is hidden and can't be edited
   ```
   If valid, the non-secret edit is applied to the raw document at identical prefix/suffix offsets. Guests can never overwrite or reveal hidden credentials.
8. **Shared Terminal Isolation & Batching:**
   The superhost's terminal spawns a real shell process (`cmd.exe` on Windows, `$SHELL` or `/bin/bash` on Unix; configurable via `parallel.terminalShell`). Output is wrapped in a VS Code `Pseudoterminal` and batched every 50 ms (`FLUSH_MS = 50`) in chunks up to 16 KB (`CHUNK = 16 * 1024`). The server relays terminal packets exclusively to sockets with `superhost` or `host` roles—guests never receive terminal data. Remote input is capped at 4096 characters per command (`MAX_LINE = 4096`) and stamped with the sender's username (`[User] $ command`).
9. **Masked Replay Snapshots:**
   The server-side session recorder captures timestamped lifecycle events and document snapshots at most every 250 ms (`BASE_MIN_GAP_MS = 250`). Snapshots are limited to 200 KB per snapshot (`MAX_SNAPSHOT_BYTES`) and 5 MB per session (`MAX_TOTAL_BYTES`). Snapshots are stored pre-masked (`session.recorder.addSnapshot(file, maskedText)`), guaranteeing that session replays and HTML exports cannot leak secrets.
10. **Hackathon Mode Server State & Persistence:**
    Sprint state (setup, tasks, milestones, deliverables, project notes) is authoritatively managed in server memory and persisted to disk per session (`server/hackathons/<code_here>.json`). Updates are broadcast in real time to all participants.
11. **Next Best Actions Engine:**
    A rule-based recommendation engine (`getNextBestActions`) evaluates sprint health, prioritizing blocked tasks as critical, assessing countdown deadline pressure, and recommending the most impactful next step for the team.
12. **Git Guardian:**
    An in-editor Git inspector (`inspectGitRepository`) queries local Git state (`git rev-parse`, `git status --porcelain`, `git diff --name-only --diff-filter=U`, `git log -n 5`) to check uncommitted changes, detect merge conflicts, and alert the team if a teammate's active task files overlap with locally modified files.

---

## 7. Commands Table

All 17 commands registered in `extension/parallel/package.json`:

| Command Identifier | Command Title | Description |
| :--- | :--- | :--- |
| `parallel.start` | Parallel: Start Session | Starts a new session, generates a 6-character code, and shares the active file. |
| `parallel.join` | Parallel: Join Session | Joins an existing session using a code and opens the file in read-only mode. |
| `parallel.changeRole` | Parallel: Change Role | (Superhost only) Promotes or demotes a participant between host and guest. |
| `parallel.requestEditAccess` | Parallel: Request Edit Access | (Guest) Sends a request to the host for temporary live editing rights. |
| `parallel.grantEditAccess` | Parallel: Grant Edit Access | (Host) Selects an approved guest and grants them live editing access. |
| `parallel.revokeEditAccess` | Parallel: Revoke Edit Access | (Host) Revokes a participant's editing access, returning them to read-only. |
| `parallel.commitWithCredit` | Parallel: Commit With Credit | Prepares a git commit with auto-generated `Co-authored-by:` trailers based on session edits. |
| `parallel.showSafetyLog` | Parallel: Show Safety Log | Displays the log of masked sensitive credentials and tokens detected during the session. |
| `parallel.openLastReplay` | Parallel: Open Last Replay | Opens the interactive visual replay player for the most recent session. |
| `parallel.openReplayFile` | Parallel: Open Replay File | Prompts to open a saved `.parallel-replay.json` recording file in the replay player. |
| `parallel.exportReplayHtml` | Parallel: Export Replay as HTML | Exports the session replay timeline and event logs as a standalone HTML file. |
| `parallel.openAdminDashboard` | Parallel: Open Admin Dashboard | Opens the webview dashboard displaying active sessions, participants, and security metrics. |
| `parallel.openHackathonMode` | Parallel: Open Hackathon Mode | Opens the hackathon workspace with sprint timer, milestones, deliverables, and notes. |
| `parallel.jumpToPerson` | Parallel: Jump to Person | Centers the editor on a selected participant's last known cursor line. |
| `parallel.shareTerminal` | Parallel: Share Terminal | (Superhost only) Streams active terminal output to promoted hosts (guests never receive terminal data). |
| `parallel.stopSharingTerminal` | Parallel: Stop Sharing Terminal | (Superhost only) Stops the terminal broadcast and closes mirror terminal views. |
| `parallel.toggleTerminalInput` | Parallel: Allow or Block Typing in Shared Terminal | (Superhost only) Toggles whether promoted hosts are permitted to type commands into the shared terminal. |

---

## 8. Getting Started

### Prerequisites
- **Node.js** (v18.x or newer, v20+ recommended)
- **npm** (v9.x or newer)
- **VS Code** (v1.80.0 or newer)
- **Git**

### Installation & Launch

1. **Start the WebSocket Server:**
   ```bash
   cd server
   npm install
   node server.js
   ```
   *(Server starts listening on `ws://localhost:8080`)*

2. **Install or Run the Extension:**

   **Option A: Run from Source (Development Mode)**
   Open a separate terminal window:
   ```bash
   cd extension/parallel
   npm install
   npm run compile
   ```
   Open `extension/parallel` in VS Code and press **`F5`** (or select **Run & Debug > Run Extension**). A new Extension Development Host window will open with Parallel loaded.

   **Option B: Install Packaged VSIX**
   If you have the pre-built VSIX package:
   ```bash
   code --install-extension parallel-0.0.1.vsix
   ```
   *(The VSIX package is located in `extension/parallel/`)*

> **Multi-Laptop Setup Note:**
> If testing or recording from different laptops on the same local network (Wi-Fi), obtain the host laptop's local IP address (e.g., `192.168.1.50`). On guest laptops, open VS Code Settings and set `parallel.serverUrl` to:
> ```
> ws://<host-laptop-ip>:8080
> ```

---

## 9. Testing with Two Windows & Demo Secrets

You can easily simulate a multi-user collaborative session on a single machine:

### 1. Create a Demo File (`demo.js`)
Use only fake credentials to test the safety filter and edit guard. Create `demo.js`:

```javascript
const API_KEY = "sk-demo1234567890abcdefghijkl"; // fake
const password = "hunter2-demo"; // fake
const DB = "postgres://admin:s3cretpass@localhost:5432/app"; // fake

function greet(name) {
  return "Hello " + name;
}
```

### 2. Start the Server
```powershell
cd <path-to-repo>/server
node server.js
```

### 3. Launch Window 1 (Superhost)
- In VS Code (with `extension/parallel` open), press **`F5`**.
- In the Extension Host window, open `demo.js`.
- Press `Ctrl+Shift+P` > **`Parallel: Start Session`**.
- Enter display name `Alice`. Copy the 6-character session code (e.g., `K9X2B7`).

### 4. Launch Window 2 (Guest)
- Open a separate terminal and run:
  ```bash
  code --extensionDevelopmentPath="<path-to-repo>/extension/parallel" --user-data-dir="C:\temp\parallel-guest"
  ```
- In the guest window, press `Ctrl+Shift+P` > **`Parallel: Join Session`**.
- Enter the 6-character code and display name `Bob`.

### 5. Verify Interactions
- **Host Approval:** In Window 1 (Alice), click **Approve** on the join popup.
- **Secret Masking:** In Window 2 (Bob), observe that `API_KEY`, `password`, and `DB` are redacted with `••••••`, while `greet(name)` is clearly visible.
- **Edit Guard:** In Window 2, attempt to type inside one of the bullet markers. VS Code displays:
  ```
  That value is hidden and can't be edited
  ```
- **Live Edit Access:** In Window 2, run **`Parallel: Request Edit Access`**. In Window 1, approve the request. Now edit normal lines (e.g., inside `greet`) to see live co-editing synchronized back to the host.
- **Participants & Jump:** Click line 8 in Window 2. In Window 1, click **Bob** in the **Parallel** Activity Bar sidebar to jump directly to Bob's cursor.
- **Shared Terminal:** In Window 1, run **`Parallel: Share Terminal`**. Promote Bob to host (`Parallel: Change Role`), then run **`Parallel: Allow or Block Typing in Shared Terminal`** to test remote command execution.

---

## 10. Project Structure

```
hackloop-parallel/
├── docs/
│   ├── images/                           # Screenshot assets for documentation
│   ├── DEVLOG.md                         # Daily engineering logs and decision history
│   └── SAFETY.md                         # Detailed security and credential masking guide
├── extension/
│   └── parallel/
│       ├── media/
│       │   └── icon.svg                  # Theme-adaptive Activity Bar icon
│       ├── src/
│       │   ├── dashboard/                # Admin Dashboard webview & telemetry
│       │   │   ├── adminHtml.ts
│       │   │   └── index.ts
│       │   ├── hackathon/                # Hackathon Mode sprint workspace
│       │   │   ├── gitGuardian.ts        # Git status, conflict & overlap inspector
│       │   │   ├── hackathonHtml.ts
│       │   │   ├── recommendations.ts    # Rule-based Next Best Actions engine
│       │   │   └── types.ts
│       │   ├── replay/                   # Session recording, player & HTML exporter
│       │   │   ├── exporter.ts
│       │   │   ├── loader.ts
│       │   │   ├── types.ts
│       │   │   └── viewerHtml.ts
│       │   ├── safety/                   # Safety log view, credit ledger & git committer
│       │   │   ├── credit.ts
│       │   │   ├── index.ts
│       │   │   ├── ledger.ts
│       │   │   ├── log.ts
│       │   │   └── status.ts
│       │   ├── connection.ts             # WebSocket client & message dispatcher
│       │   ├── extension.ts              # Extension activation & command registry
│       │   ├── sidebar.ts                # Participants TreeDataProvider & click-to-jump
│       │   └── terminal.ts               # Host shared pseudo-terminal implementation
│       ├── package.json                  # Extension manifest & command declarations
│       └── tsconfig.json                 # TypeScript compiler configuration
├── server/
│   ├── hackathon/                        # Hackathon state management & task endpoints
│   │   ├── index.js
│   │   ├── recommendations.js            # Server recommendation logic
│   │   ├── storage.js                    # Disk persistence for hackathon state
│   │   └── store.js
│   ├── replay/                           # Authoritative session event recorder
│   │   ├── index.js
│   │   └── recorder.js                   # Pre-masked snapshot recorder & size limits
│   ├── safety/                           # Server-side regex pattern detection & edit guard
│   │   ├── contributions.js              # Authoritative edit metrics tracker
│   │   ├── edit-guard.js                 # Reconciles edits to prevent secret overwriting
│   │   ├── mask.js                       # Pattern masking with bullet replacement
│   │   └── patterns.js                   # 10 built-in regex definitions for credentials
│   ├── package.json                      # Server package definition
│   ├── server.js                         # Core WebSocket server implementation
│   └── test.js                           # Integration and end-to-end test suites
└── README.md
```

---

## 11. Voice (Tested & Not Included)

During spike testing on the WebRTC track, microphone capture inside a VS Code webview was evaluated using `navigator.mediaDevices.getUserMedia({ audio: true })`.

Result: Error [NotAllowedError]: Permission denied, so voice cannot run inside the editor panel. We did not build voice.

---

## 12. Team & Authorship Table

Built with dedication for Hackloop S05 by our team of 4.

### Code Authorship Breakdown (Verified via `git log --author`)

| Name | Role / Area | Key Modules Authored in Code | Key Files |
| :--- | :--- | :--- | :--- |
| **J Nishanth Bhat** | Server Architect & Safety Lead | WebSocket server core, 6-char session codes, join queue, 10-pattern safety filter, length-preserving masking, tamper-proof edit guard, authoritative credit ledger, and `Commit With Credit`. | `server/server.js`, `server/safety/`, `extension/.../safety/`, `credit.ts`, `ledger.ts` |
| **Samridh S Shetty** | Client Core & Terminal Lead | Extension scaffolding, client connection dispatcher, start/join workflows, read-only virtual document, live remote cursor sync, role management, shared pseudo-terminal (`ShellPty`/`MirrorPty`), and packaging. | `extension/parallel/src/extension.ts`, `src/connection.ts`, `src/terminal.ts`, `package.json` |
| **Ishaan K** | Replay & Hackathon Lead | Session replay recorder (masked snapshots), webview replay player with scrubber, standalone HTML exporter, Admin Dashboard, and Hackathon Mode (tasks, milestones, deliverables, Next Best Actions, Git Guardian). | `server/replay/`, `src/replay/`, `src/dashboard/`, `src/hackathon/`, `server/hackathon/` |
| **Pratham Shetty** | UI, Navigation & Docs | Activity Bar "Parallel" icon and view container, Participants sidebar TreeDataProvider with click-to-jump, webview microphone spike testing, project documentation, and PR review hygiene. | `extension/.../src/sidebar.ts`, `media/icon.svg`, `docs/`, `README.md` |

*(Note on Demo Video Roles: In the demo video plan, presentation speaking topics were distributed as: Samridh – Intro & Session Start/Join/Roles; Nishanth – Secret Masking & Admin Dashboard; Pratham – Shared Terminal & Contribution Credit; Ishaan – Session Replay & Hackathon Mode).*

---

## 13. Git Workflow & Repository Hygiene

To maintain high stability during development, the team adhered to strict git hygiene:
- **Main Branch Protection:** Direct pushes to `main` are blocked. Every merge requires an explicit pull request with at least **1 approving review** from a teammate with write access.
- **Isolated Feature Branches:** All work was completed in modular branches:
  - `feature/sidebar` (Participants tree view and click-to-jump)
  - `feature/safety-edit-credit` (Secret masking, credit ledger, and commit attribution)
  - `shared-terminal` (Pseudo-terminal streaming and guest typing toggle)
  - `feature/admin-dashboard` (Telemetry and admin monitor)
  - `feature/hackathon-mode` (Sprint planner, deliverables checklist, and timer)
  - `docs/readme` & `docs/devlog` (Documentation updates)
- **Zero Pollution:** Build artifacts (`out/`, `*.vsix`) and dependencies (`node_modules/`) are strictly excluded in `.gitignore` to keep pull requests clean and lightweight.

---

## 14. Known Limitations and Future Work

### Merged and Fully Working
- Host-controlled sessions with 6-character random codes.
- Live bi-directional multi-user cursor tracking with per-user colors.
- Activity Bar Participants sidebar with role badges and click-to-jump.
- Automated secret masking across 10 built-in credential patterns with tamper-proof edit guard.
- Real-time contribution tracking and automated git `Co-authored-by:` commit generation.
- Host-shared streaming terminal with guest input permission toggling.
- Complete session event recording, scrubbable webview replay player, and single-file HTML exporter.
- Live Admin Dashboard and Collaborative Hackathon Mode workspace with Next Best Actions and Git Guardian.

### In Progress / Future Work
1. **Voice and Video:** Integrated multi-party WebRTC audio and video communication directly inside collaborative sessions.
2. **GitHub and Jira Integration:** Synchronizing Hackathon Mode tasks, milestones, and deliverables directly with GitHub Issues/PRs and Jira sprint boards.
3. **AI Assistant and Summaries:** In-editor LLM assistant for automated code suggestions, change risk analysis, and automatic end-of-session summaries.
4. **Advanced Analytics:** In-depth team telemetry, velocity tracking, and contribution breakdowns over time.
5. **Support for More Editors:** Porting the client to JetBrains IDEs, Neovim, and browser-based editors.
6. **Hosted Cloud with Real Accounts:** A cloud-hosted relay infrastructure with user authentication, persistent team workspaces, and custom organizations.

---

## 15. Screenshots

Screenshots: coming soon
