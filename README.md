# Parallel

**Build faster. Code together.**

Parallel is a VS Code extension for live, safe, role-based collaborative coding. One person starts a session, teammates join with a 6-character code, and everyone sees edits as they happen, without leaking API keys or losing track of who did what.

Built by Team Parallel for **Hackloop S05** (Finite Loop Club, NMAM Institute of Technology).

---

## The problem

| # | Problem |
|---|---|
| 1 | Teams share code over chat, zip files and screenshots. |
| 2 | Sharing leaks API keys, tokens and passwords. |
| 3 | Edit access is all-or-nothing. |
| 4 | Credit for contributions gets lost. |
| 5 | Task boards and notes live in different apps from the code. |
| 6 | Nobody can review what happened in a session afterwards. |

---

## Features

- **Live shared sessions**: start or join a session inside VS Code. The host approves every join request.
- **Role-based edit access**: three roles (superhost, host, guest). Guests request edit access; the superhost grants or revokes it at any time.
- **Secret masking**: 10 built-in pattern families (AWS keys, OpenAI/Anthropic keys, Stripe keys, GitHub tokens, Google API keys, Slack tokens, JWTs, PEM private keys, database URLs, and password/secret assignments) are automatically hidden from guests (shown as `••••••`). Edits that touch a hidden value are rejected by the edit guard.
- **Live presence**: a Participants sidebar shows who is in the session, with their roles. *Jump to Person* moves you to a teammate's cursor.
- **Shared terminal**: the superhost shares a terminal with promoted hosts (never guests) and decides whether they may type in it.
- **Contribution credit**: edits are tracked per guest. *Commit With Credit* adds `Co-authored-by:` lines to the commit message.
- **Session replay**: sessions are recorded and can be replayed with a timeline and 1x to 8x speed, or exported as a standalone HTML file.
- **Admin dashboard**: live participants, pending requests, activity timeline, replays and server health.
- **Hackathon Mode**: tasks, milestones, deliverables, notes and a deadline countdown, synced live across the session. Includes *Git Guardian* (branch, uncommitted changes, overlaps) and *Next Best Actions* recommendations.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **Parallel**.

| Command | What it does |
|---|---|
| Parallel: Start Session | Share the open file and get a join code |
| Parallel: Join Session | Join with a code; the host approves you |
| Parallel: Change Role | Superhost promotes a guest to host or demotes a host to guest |
| Parallel: Request Edit Access | Guest asks the superhost for edit rights |
| Parallel: Grant Edit Access | Superhost gives a guest edit rights |
| Parallel: Revoke Edit Access | Superhost takes edit rights back |
| Parallel: Share Terminal | Superhost shares a terminal with hosts |
| Parallel: Allow or Block Typing in Shared Terminal | Superhost toggles whether hosts can type |
| Parallel: Stop Sharing Terminal | Ends terminal sharing |
| Parallel: Commit With Credit | Pre-fills the commit message with `Co-authored-by:` lines |
| Parallel: Show Safety Log | Shows what was masked and credited |
| Parallel: Focus on Participants View | Opens the Participants sidebar (built-in view command) |
| Parallel: Jump to Person | Moves your view to a teammate's cursor |
| Parallel: Open Last Replay | Opens the most recent session replay |
| Parallel: Open Replay File | Opens a saved replay file |
| Parallel: Export Replay as HTML | Saves a replay as a standalone HTML file |
| Parallel: Open Admin Dashboard | Opens the live session dashboard |
| Parallel: Open Hackathon Mode | Opens the task board, countdown and notes |

---

## Roles

| Role | Can do |
|---|---|
| **Superhost** | Starts the session, edits, approves joins, promotes/demotes, grants/revokes edit access, shares the terminal, ends the session |
| **Host** | Promoted by the superhost. Edits directly, sees unmasked code, sees the shared terminal (typing only when allowed by superhost) |
| **Guest** | Read-only by default, sees masked code. Can be given edit access by the superhost |

---

## How it works

```
VS Code extension (TypeScript)  <--WebSocket (JSON)-->  Node.js server (ws)
   - commands, sidebar, status bar                        - sessions keyed by 6-char code
   - read-only virtual documents                          - role and permission checks
   - terminal, replay viewer, dashboard                   - secret masking + edit guard
                                                          - replay recorder
                                                          - hackathon state
```

- **Sessions**: the server creates a 6-character code from a secure random source (`crypto.randomBytes`, removing ambiguous lookalikes like `0/O` and `1/I`). Codes accept new joins for 10 minutes (`CODE_TTL_MS = 600,000 ms`), wrong guesses are rate-limited (5 bad attempts per connection, 20 per IP/minute), message rate is throttled (200 msgs/sec per connection), and sessions hold up to 20 guests.
- **Sync**: the extension debounces file edits by 100 ms (`sendTimer = setTimeout(sendDoc, 100)`); receivers apply only the changed region via common prefix/suffix diffing, so remote cursors do not jump.
- **Permissions are enforced on the server**: role transitions (`role`), join decisions (`decide`), and edit grants (`decide_edit`) are authoritatively validated for `ws.role === 'superhost'` on the server; clients cannot self-promote.
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
  10. *Secret Assignment*: `\b(password|secret|token|api_key|apikey)\b\s*([=:])\s*(["'`])([^"'\r\n`]{6,})\3`
  The server keeps the raw text and a masked copy (`maskSecrets`), broadcasting masked text (`••••••`) to guests.
- **Edit guard (`reconcileGuestEdit`)**: when an authorized guest edits text, the server validates the edit against masked secret spans. If the change touches any masked span, it is rejected with `"That value is hidden and can't be edited"`. Valid edits are mapped to the raw document at identical prefix/suffix offsets.
- **Shared terminal batching & isolation**: the superhost's terminal wraps a local shell (`cmd.exe` or `$SHELL`) in a VS Code `Pseudoterminal`. Output is batched every 50 ms (`FLUSH_MS = 50`) in chunks up to 16 KB (`CHUNK = 16 * 1024`). The server relays terminal packets only to sockets with `host` or `superhost` roles; guests never receive terminal data. Remote input is capped at 4096 characters per command (`MAX_LINE = 4096` in `terminal.ts`, `MAX_TERM_INPUT = 4096` in `server.js`) and stamped with the sender's username (`[User] $ command`) on the server to prevent impersonation.
- **Replay snapshot caps**: timestamped events and text snapshots are recorded at most once every 250 ms (`BASE_MIN_GAP_MS = 250`). Snapshots are capped at 200 KB per snapshot (`MAX_SNAPSHOT_BYTES`) and 5 MB per session recording (`MAX_TOTAL_BYTES`). Document snapshots are stored pre-masked (`session.recorder.addSnapshot(file, maskedText)`), so exported replays never leak credentials.
- **Hackathon Mode & Git Guardian**: hackathon state is persisted to disk per session (`server/hackathons/<code_here>.json`). Git Guardian inspects local Git status (`git rev-parse`, `git status --porcelain`, `git diff --name-only --diff-filter=U`, `git log -n 5`) to detect uncommitted changes and warn of potential file overlaps with active teammate tasks.

---

## Project structure

Matches repository tracking (`git ls-files`):

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
│   ├── hackathon/                    # Hackathon state store & disk persistence
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
- **Version control**: Git (via the VS Code Git API)

---

## Git workflow

- **Main branch protection**: direct pushes to `main` are blocked. Merges require an approved pull request.
- **Feature branches**: all work was developed in focused branches (`feature/sidebar`, `feature/safety-edit-credit`, `shared-terminal`, `feature/admin-dashboard`, `feature/hackathon-mode`).
- **Teammate reviews**: every pull request requires at least one approving code review from another team member.
- **Zero build artifact pollution**: build artifacts (`out/`, `*.vsix`) and dependencies (`node_modules/`) are strictly gitignored to keep the repository clean.

---

## Getting started

### Prerequisites

- VS Code
- Node.js 18 or newer

### 1. Start the server

```bash
cd server
npm install
npm start
```

You should see `Server running on ws://localhost:8080`. Set the `PORT` environment variable to use a different port.

### 2. Install the extension

From the packaged build:

```bash
code --install-extension extension/parallel/parallel-0.0.1.vsix
```

Or build it yourself:

```bash
cd extension/parallel
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host.

### 3. Point the extension at the server

In VS Code settings, set `parallel.serverUrl` (default `ws://localhost:8080`). If your teammates are on another machine, use the server machine's address, for example `ws://192.168.1.20:8080`.

### 4. Try it

1. Open a file and run **Parallel: Start Session**. Note the code.
2. In a second VS Code window, run **Parallel: Join Session** and enter the code.
3. Approve the request in the host window.

### 5. Testing with two windows

To test multi-user collaboration and secret masking on a single machine:

#### Demo file (`demo.js`)
Create a test file with **fake** credentials to test the safety filter and edit guard:

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
1. **Window 1 (Superhost):** In VS Code with `extension/parallel` open, press **`F5`** to launch the Extension Development Host. Open `demo.js`, run **Parallel: Start Session**, enter your name, and copy the 6-character code.
2. **Window 2 (Guest):** Open a separate terminal and launch a second VS Code instance with an isolated user data directory:
   ```bash
   code --extensionDevelopmentPath="<path-to-repo>/extension/parallel" --user-data-dir="C:\temp\parallel-guest"
   ```
   In the guest window, run **Parallel: Join Session** and enter the code.
3. **Approve & test:** Approve the join request in Window 1. The guest sees `API_KEY`, `password`, and `DB` masked as `••••••`. Trying to edit a masked value triggers an error, while normal code (`greet`) can be edited once the superhost grants edit access via **Parallel: Grant Edit Access**.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `parallel.serverUrl` | `ws://localhost:8080` | Address of the Parallel server |
| `parallel.terminalShell` | *(empty)* | Shell for the shared terminal (empty: `cmd.exe` on Windows, `$SHELL` elsewhere) |

---

## Tests

From the `server/` folder:

```bash
npm run test:safety          # masking, edit guard, contribution tracking
npm run test:replay          # replay recorder and storage
npm run test:e2e-safety      # end-to-end safety test (server must be running)
npm run test:e2e-replay
npm run test:edit-access
npm run test:dashboard
npm run test:hackathon
npm run test:e2e-terminal
```

---

## Limitations

- Sessions are held in server memory and end when the superhost disconnects.
- One shared file per session, up to 4 MB.
- The server has no accounts or encryption layer (use a trusted network, or put it behind TLS).
- Secret masking is pattern-based. It covers common key formats and `password` / `secret` / `token` / `api_key` assignments, but cannot catch every possible secret.

---

## Further work

- Voice and video chat inside a session
- GitHub and Jira integration
- AI assistant for code and session summaries
- Advanced analytics
- Support for more editors and developers
- Hosted cloud server with real accounts

---

## Team

| Roll no. | Name | Area |
|---|---|---|
| NN25ISE182 | Samridh S Shetty | Client core & session flow, remote cursor sync, shared terminal, extension packaging |
| NN25AIM051 | Nishanth N Bhat | WebSocket server core, 10-pattern safety filter, edit guard, contribution tracking & credit |
| NN25AIM050 | Ishaan Kombrabail | Session replay engine & player, Admin dashboard, Hackathon Mode & Git Guardian |
| NN25AID053 | Pratham Ashok Shetty | Activity Bar view container & icon, Participants sidebar with click-to-jump, documentation |

Hackloop S05, Finite Loop Club, NMAM Institute of Technology, Nitte.
