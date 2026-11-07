# Parallel

**Build faster. Code together.**

Parallel is a VS Code extension and lightweight WebSocket server for live, safe, role-based collaborative coding. One person starts a session, teammates join with a 6-character code into an approval lobby, and everyone views edits in real time through a secure virtual document—without leaking sensitive API keys, breaking compiler state, or losing track of authorship.

Built by Team Parallel for **Hackloop S05** (Finite Loop Club, NMAM Institute of Technology).

---

## The problem

| # | Problem | How Parallel solves it |
|---|---|---|
| 1 | Teams share code over chat, zip files and screenshots | Real-time file streaming through a lightweight WebSocket relay |
| 2 | Sharing leaks API keys, tokens and database credentials | Automated 10-pattern safety filter masks secrets (`••••••`) before text reaches guests |
| 3 | Edit access is all-or-nothing (anyone can overwrite code) | Role-based permissions (superhost, host, guest) and a tamper-proof edit guard |
| 4 | Credit for contributions gets lost in git commits | Granular edit tracking with automatic `Co-authored-by:` trailers via *Commit With Credit* |
| 5 | Tasks, deadlines, and notes live in separate apps | Integrated Hackathon Mode with task board, team timer, notes, and Git Guardian |
| 6 | No way to review what happened during a session | Scrubbable session replay player with HTML export and an end-of-session *Wrapped* story |

---

## Features

- **Live shared sessions**: start or join a session directly inside VS Code. The superhost approves every join request in a lobby.
- **Role-based edit access**: three roles (superhost, host, guest). Guests start in a read-only virtual document (`parallel:`); the superhost grants or revokes edit access at any time.
- **Real-time secret masking**: 10 built-in pattern families (AWS keys, OpenAI/Anthropic keys, Stripe keys, GitHub tokens, Google API keys, Slack tokens, JWTs, PEM private keys, database URLs, and password/secret assignments) are automatically masked (`••••••`) for guests. Edits touching masked values are blocked by the server edit guard.
- **Live presence & cursor sync**: a Participants sidebar shows active members and roles. *Jump to Person* navigates directly to a teammate's remote cursor.
- **Shared terminal**: the superhost streams their terminal to promoted hosts with an optional guest-typing toggle. Output is batched to prevent message drops.
- **Contribution credit & git trailers**: edits and lines modified are recorded per guest. *Commit With Credit* automatically inserts `Co-authored-by:` lines into your git commit message.
- **Session replay**: full session events and snapshots are recorded pre-masked and can be replayed in a scrubbable webview player (1x to 8x speed) or exported as a standalone HTML file.
- **Admin dashboard**: 5 dedicated tabs for live overview, participants & permissions, activity timeline, replay management, and real-time server health.
- **Hackathon Mode & Git Guardian**: collaborative command center featuring sprint tasks, milestones, deliverables, project notes, team timer, and *Git Guardian* overlap detection.
- **Session Wrapped recap**: automated Spotify-style 7-slide story generated when a session ends, showcasing total duration, peak focus minute, longest streak, lines modified, awards (e.g. Night Owl, Fixer, MVP), git commit counts, and GitHub profile avatars, with HTML and PNG export.
- **Authoritative session termination**: when the superhost ends the session, all participants immediately lose their roles and edit access; virtual tabs close cleanly without unsaved prompts.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **Parallel**.

| Command | Identifier | What it does |
|---|---|---|
| Parallel: Start Session | `parallel.start` | Share the active file and generate a 6-character join code |
| Parallel: Join Session | `parallel.join` | Enter a session code and name to request entry |
| Parallel: End Session | `parallel.endSession` | Superhost ends the session, revoking all access and triggering Wrapped |
| Parallel: Change Role | `parallel.changeRole` | Superhost promotes a guest to host or demotes a host to guest |
| Parallel: Request Edit Access | `parallel.requestEditAccess` | Guest asks the superhost for live edit privileges |
| Parallel: Grant Edit Access | `parallel.grantEditAccess` | Superhost gives an approved guest live edit rights |
| Parallel: Revoke Edit Access | `parallel.revokeEditAccess` | Superhost immediately revokes live edit rights |
| Parallel: Commit With Credit | `parallel.commitWithCredit` | Opens git commit input pre-filled with `Co-authored-by:` trailers |
| Parallel: Show Safety Log | `parallel.showSafetyLog` | Displays audit log of masked secrets and recorded contributions |
| Parallel: Session Wrapped | `parallel.openWrapped` | Opens the 7-slide interactive Session Wrapped story recap |
| Parallel: Open Last Replay | `parallel.openLastReplay` | Opens the replay player for the most recent session |
| Parallel: Open Replay File | `parallel.openReplayFile` | Loads and replays an existing `.json` replay recording |
| Parallel: Export Replay as HTML | `parallel.exportReplayHtml` | Exports the active replay as a standalone, zero-dependency HTML file |
| Parallel: Open Admin Dashboard | `parallel.openAdminDashboard` | Opens the live session telemetry, timeline, and health monitor |
| Parallel: Open Hackathon Mode | `parallel.openHackathonMode` | Opens sprint task board, milestones, countdown, and notes |
| Parallel: Jump to Person | `parallel.jumpToPerson` | Moves your editor view to a selected participant's cursor |
| Parallel: Share Terminal | `parallel.shareTerminal` | Superhost streams their terminal output to hosts |
| Parallel: Allow or Block Typing in Shared Terminal | `parallel.toggleTerminalInput` | Superhost toggles whether hosts can type into the shared terminal |
| Parallel: Stop Sharing Terminal | `parallel.stopSharingTerminal` | Closes the shared terminal stream |
| Parallel: Focus on Participants View | `parallel.participants.focus` | Focuses the Participants tree view in the Activity Bar |

---

## Roles

| Role | How you get it | Permissions |
|---|---|---|
| **Superhost** | Starts the session | Full edit rights, approves joiners, grants/revokes edit rights, promotes/demotes, streams terminal, controls timer, ends session |
| **Host** | Promoted by superhost | Direct edit rights, sees unmasked code, views shared terminal (typing only when allowed by superhost) |
| **Guest** | Joins with code | Read-only virtual document (`parallel:`), sees masked code (`••••••`). Can request edit access from superhost |

---

## How it works

```
 Host VS Code ──┐                          ┌── Guest VS Code
 (raw text)     │      WebSocket relay     │   (masked, read-only
                ├────►  server/server.js ──┤    parallel: virtual doc)
 Host VS Code ──┘  mask secrets · roles ·  └── Guest VS Code
                   edit guard · fan-out
```

- **Sessions**: the server creates a 6-character code using `crypto.randomInt` over unambiguous characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, excluding `0/O` and `1/I`). Codes accept new joins for 10 minutes (`CODE_TTL_MS = 600,000 ms`), incorrect guesses are rate-limited (5 bad attempts per connection, 20 per IP/minute), message rate is throttled (200 msgs/sec per connection), and sessions hold up to 20 guests.
- **Sync**: file edits are debounced by 100 ms (`sendTimer = setTimeout(sendDoc, 100)`). Receivers compute and apply only changed regions via common prefix/suffix diffing, ensuring remote cursor positions remain stable.
- **Server-enforced authorization**: role transitions (`role`), join decisions (`decide`), edit grants (`decide_edit`), and terminal controls are strictly validated on the server for `ws.role === 'superhost'`. Clients cannot self-promote.
- **Secret masking (10 built-in patterns)**: defined in `server/safety/patterns.js`:
  1. *AWS Access Key*: `\bAKIA[0-9A-Z]{16}\b`
  2. *OpenAI / Anthropic API Key*: `\bsk-(?:ant-|proj-)?[a-zA-Z0-9_\-]{20,}\b`
  3. *Stripe API Key*: `\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b`
  4. *GitHub Token*: `\b(?:ghp_[a-zA-Z0-9]{16,}|gho_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{16,})\b`
  5. *Google API Key*: `\bAIza[0-9A-Za-z\-_]{30,40}\b`
  6. *Slack Token*: `\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b`
  7. *JSON Web Token (JWT)*: `\beyJ[a-zA-Z0-9_-]{8,}\.eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b`
  8. *PEM Private Key*: `-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+)?PRIVATE KEY-----`
  9. *Database URL*: `\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"':@/]+:[^\s"':@/]+@[^\s"'/]+(?:\/[^\s"']*)?`
  10. *Secret Assignment*: `(?:^|[\s,;{([`'"])\b(password|secret|token|api_key|apikey)\b\s*([=:])\s*(["'`])([^"'\r\n`]{6,})\3` (case-insensitive)
  The server broadcasts masked text (`••••••`) to guests while maintaining true raw text for editors.
- **Edit guard (`reconcileGuestEdit`)**: guest edits are validated against masked secret intervals. If a change overlaps any hidden secret span, the edit is rejected with `"That value is hidden and can't be edited"`. Valid edits are mapped to the raw document at identical prefix/suffix offsets.
- **Shared terminal multiplexing**: the superhost's terminal wraps a local shell (`cmd.exe` or `$SHELL`) inside a VS Code `Pseudoterminal`. Output is batched every 50 ms (`FLUSH_MS = 50`) in chunks up to 16 KB (`CHUNK = 16 * 1024`). Remote input is capped at 4096 characters per command and stamped with the server-verified sender username (`[User] $ command`) to prevent spoofing.
- **Replay recorder caps**: events and text snapshots are sampled at most once every 250 ms (`BASE_MIN_GAP_MS = 250`). Snapshots are capped at 200 KB per snapshot (`MAX_SNAPSHOT_BYTES`) and 5 MB per session (`MAX_TOTAL_BYTES`). Document snapshots are stored pre-masked, ensuring replay exports never leak credentials.
- **Hackathon Mode & Git Guardian**: hackathon state is managed in-memory and synchronized across the session. Git Guardian executes local git inspections (`git rev-parse --abbrev-ref HEAD`, `git status --porcelain`, `git diff --name-only --diff-filter=U`, `git log -n 5`) to warn of uncommitted changes and potential file overlaps with active teammate tasks.
- **Session Wrapped & Termination Lifecycle**: when a session ends (via `Parallel: End Session` or superhost disconnect), the server invokes `terminateSession()`:
  - Generates authoritative Wrapped analytics (`computeWrapped`) across duration, characters added/deleted, lines modified, longest focus streak, peak activity minute, and awards.
  - Broadcasts `replay_ready`, `wrapped`, and `ended` messages to all connected participants.
  - All guests and hosts immediately lose their roles and edit rights; their client virtual tabs close cleanly without save prompts, and sockets close after 5 seconds.
  - The superhost's socket retains role privileges for 60 seconds exclusively to transmit local git commit counts (`wrapped_commits`).

---

## Project structure

```
hackloop-parallel/
├── extension/
│   └── parallel/
│       ├── media/
│       │   └── icon.svg              # Theme-adaptive Activity Bar icon
│       ├── src/
│       │   ├── dashboard/            # Admin dashboard webview & panel
│       │   │   ├── dashboardHtml.ts
│       │   │   ├── panel.ts
│       │   │   └── types.ts
│       │   ├── hackathon/            # Hackathon Mode, Git Guardian & recommendations
│       │   │   ├── gitGuardian.ts
│       │   │   ├── hackathonHtml.ts
│       │   │   ├── panel.ts
│       │   │   ├── recommendations.ts
│       │   │   └── types.ts
│       │   ├── replay/               # Session replay loader & webview viewer
│       │   │   ├── loader.ts
│       │   │   ├── panel.ts
│       │   │   ├── types.ts
│       │   │   └── viewerHtml.ts
│       │   ├── safety/               # Safety log, credit ledger & status bar item
│       │   │   ├── credit.ts
│       │   │   ├── index.ts
│       │   │   ├── ledger.ts
│       │   │   ├── log.ts
│       │   │   └── status.ts
│       │   ├── wrapped/              # Session Wrapped story, git stats & avatar loader
│       │   │   ├── avatar.ts
│       │   │   ├── gitStats.ts
│       │   │   ├── index.ts
│       │   │   ├── types.ts
│       │   │   └── wrappedHtml.ts
│       │   ├── test/                 # Extension test suite
│       │   │   └── extension.test.ts
│       │   ├── connection.ts         # WebSocket client & message dispatcher
│       │   ├── extension.ts          # Extension entrypoint & command registration
│       │   ├── sidebar.ts            # Participants tree data provider & click-to-jump
│       │   └── terminal.ts           # Shared pseudo-terminal (ShellPty / MirrorPty)
│       ├── package.json              # Extension manifest & command declarations
│       ├── parallel-0.0.1.vsix       # Pre-packaged extension VSIX bundle
│       └── tsconfig.json             # TypeScript compiler configuration
├── server/
│   ├── hackathon/                    # Hackathon state store & recommendation engine
│   │   ├── index.js
│   │   ├── recommendations.js
│   │   ├── storage.js
│   │   └── store.js
│   ├── replay/                       # Session recorder, masked snapshots & storage
│   │   ├── index.js
│   │   ├── recorder.js
│   │   ├── recorder.test.js
│   │   ├── storage.js
│   │   └── storage.test.js
│   ├── safety/                       # Pattern detection, masking, edit guard & credit
│   │   ├── contributions.js
│   │   ├── contributions.test.js
│   │   ├── edit-guard.js
│   │   ├── edit-guard.test.js
│   │   ├── index.js
│   │   ├── mask.js
│   │   ├── mask.test.js
│   │   └── patterns.js               # 10 built-in regex credential definitions
│   ├── wrapped/                      # Session Wrapped calculation & sample payload
│   │   ├── sample.js
│   │   └── stats.js
│   ├── .gitignore
│   ├── package.json                  # Server dependencies & test scripts
│   ├── server.js                     # Core WebSocket server implementation
│   ├── test-dashboard.js             # End-to-end and unit test suites
│   ├── test-edit-access.js
│   ├── test-hackathon.js
│   ├── test-replay.js
│   ├── test-safety.js
│   ├── test-terminal.js
│   └── test.js
├── .gitignore
└── README.md
```

---

## Tech stack

- **Extension**: TypeScript, VS Code Extension API
- **Server**: Node.js, [`ws`](https://github.com/websockets/ws) (WebSocket)
- **Version control**: Git (VS Code Git API in `safety/credit.ts` and Git CLI via `child_process` in Git Guardian and Wrapped git stats)

---

## Git workflow

- **Main branch protection**: direct pushes to `main` are blocked. Merges require an approved pull request.
- **Feature branches**: all work was developed in focused branches (`feature/sidebar`, `feature/safety-edit-credit`, `shared-terminal`, `feature/admin-dashboard`, `feature/hackathon-mode`, `feature/session-wrapped`).
- **Teammate reviews**: every pull request requires at least one approving code review from another team member.
- **Zero build artifact pollution**: build artifacts (`out/`) and dependencies (`node_modules/`) are strictly gitignored to keep the repository clean (pre-packaged `*.vsix` is excluded from packaged extension bundles via `.vscodeignore`).

---

## Getting started

### Prerequisites

- VS Code
- Node.js 18 or newer
- Git

### 1. Start the server

```bash
cd server
npm install
node server.js
```

You should see `Server running on ws://localhost:8080`. To run on another port:

```bash
# macOS / Linux
PORT=9000 node server.js

# PowerShell
$env:PORT=9000; node server.js
```

### 2. Install the extension

From the packaged build:

```bash
code --install-extension extension/parallel/parallel-0.0.1.vsix
```

Or build it from source:

```bash
cd extension/parallel
npm install
npm run compile
```

Open the `extension/parallel` folder in VS Code and press **F5** to launch an Extension Development Host.

### 3. Point the extension at the server

In VS Code settings, set `parallel.serverUrl` (default `ws://localhost:8080`).

If teammates are on another computer on the same local network, find your local IP (`ipconfig` on Windows or `ifconfig` / `ip a` on macOS/Linux) and set:

```
parallel.serverUrl = ws://<host-ip>:8080
```

### 4. Try it

1. Open a file and run **Parallel: Start Session**. Enter your name and copy the 6-character code.
2. In a second VS Code window, run **Parallel: Join Session** and enter the code.
3. Approve the join request from the superhost window.

### 5. Testing with two windows and demo credentials

#### Demo file (`demo.js`)
Create a test file with **fake** credentials to test secret masking and the edit guard:

```javascript
// demo.js - Test file with FAKE credentials (safe for testing)
const API_KEY = "sk-demo1234567890abcdefghijkl"; // FAKE - for testing only
const password = "hunter2-demo"; // FAKE - for testing only
const DB = "postgres://admin:s3cretpass@localhost:5432/app"; // FAKE - for testing only

function greet(name) {
  return "Hello " + name;
}
```

#### Launching the session
1. **Window 1 (Superhost):** In VS Code with `extension/parallel` open, press **F5**. Open `demo.js`, run **Parallel: Start Session**, enter your name, and copy the 6-character code.
2. **Window 2 (Guest):** Open a separate terminal and launch a second VS Code instance with an isolated profile:
   ```bash
   code --extensionDevelopmentPath="<path-to-repo>/extension/parallel" --user-data-dir="C:\temp\parallel-guest"
   ```
   In the guest window, run **Parallel: Join Session** and enter the code.
3. **Approve & test:** Approve the join request in Window 1. The guest sees `API_KEY`, `password`, and `DB` masked as `••••••`. Trying to edit a masked value triggers an error, while normal code (`greet`) can be edited once the superhost grants edit access via **Parallel: Grant Edit Access**.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `parallel.serverUrl` | `ws://localhost:8080` | Address of the Parallel WebSocket server |
| `parallel.terminalShell` | `""` | Shell for the shared terminal (empty: `cmd.exe` on Windows, `$SHELL` elsewhere) |
| `parallel.wrapped.useGithubAvatar` | `true` | Whether to display GitHub profile avatars in Session Wrapped when signed into VS Code |

---

## Tests

### Server tests

From the `server/` folder:

```bash
# Unit tests
npm run test:safety          # masking, edit guard, and contribution tracking
npm run test:replay          # session recorder and replay storage

# End-to-end test suites (automatically launch a server instance if not running)
npm run test:e2e-safety      # live safety & masking verification
npm run test:e2e-replay      # live replay stream & capture verification
npm run test:edit-access     # live role-based editing protocol tests
npm run test:dashboard       # admin dashboard state & security tests
npm run test:hackathon       # hackathon tasks, milestones, and recommendations
npm run test:e2e-terminal    # shared terminal multiplexing and permission tests

# Wrapped unit tests & basic socket integration test (requires server running on ws://localhost:8080)
npm test
```

### Extension tests

From the `extension/parallel/` folder:

```bash
npm run compile              # TypeScript typecheck and compilation
npm run lint                 # ESLint verification on src/
npm test                     # VS Code extension test runner
```

---

## Limitations

- Sessions are held in server memory and end when the superhost disconnects or runs **Parallel: End Session**.
- One active shared file per session, up to 4 MB.
- The server has no user account database or encryption layer (use a trusted local network, or put the WebSocket server behind a TLS reverse proxy).
- Secret masking is pattern-based. It covers common API key patterns and key-value assignments for passwords, tokens, and secrets, but cannot catch arbitrary unstructured secrets.

---

## Further work

- WebRTC voice and video communication inside collaborative sessions *(evaluated in spike testing; microphone access inside VS Code webview panels was blocked by editor security permissions)*.
- Bi-directional GitHub Issues and Jira synchronization for Hackathon Mode tasks.
- In-editor LLM assistant for automated code suggestions and change impact analysis.
- Multi-file workspace synchronization across directory trees.
- Hosted cloud relay infrastructure with team authentication.

---

## Team

| Roll no. | Name | Key Area |
|---|---|---|
| NN25ISE182 | Samridh S Shetty | Client core & session flow, remote cursor sync, shared terminal, extension packaging |
| NN25AIM051 | J Nishanth Bhat | WebSocket server core, 10-pattern safety filter, edit guard, contribution tracking & credit |
| NN25AIM050 | Ishaan K | Session replay engine & player, Admin dashboard, Hackathon Mode, Git Guardian & Wrapped stats |
| NN25AID053 | Pratham Ashok Shetty | Activity Bar view container & icon, Participants sidebar with click-to-jump, documentation |

Hackloop S05, Finite Loop Club, NMAM Institute of Technology, Nitte.
