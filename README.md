# Team Parallel

Live shared coding for VS Code, built for **Hackloop 2026** (team Paralell).

Parallel streams the host's entire workspace project to collaborators in real time through a lightweight Node.js WebSocket relay. The server masks secrets before anyone else sees the text, enforces role-based access, and fans updates out to everyone in the session.

## Features

- **Whole-Project Sharing:** Guests can browse and open all eligible project files in the host's workspace through a nested "Project Files" tree view in the Parallel Activity Bar.
- **Start / join sessions** with a 6-character code and a lobby where the superhost approves each joiner.
- **Live read-only view** for guests, shown as a virtual `parallel:` document (nothing is written to their disk; content is loaded lazily on demand).
- **Per-file live editing:** Promoted hosts and granted guests can edit any shared project file in real time with 100ms debounced diffs and file system sync.
- **Remote cursors & jump-to-person:** Cursors show collaborator positions in their respective files. Jumping to a person opens their active file and centers on their cursor.
- **Roles:** superhost (session owner), host (promoted guest, can edit and access shared terminal), and guest (read-only by default).
- **Secret masking & edit guard:** API keys, tokens, and passwords appear as `••••••` to guests. Edits attempting to touch hidden secrets are authoritatively rejected.
- **Contribution ledger:** Authoritative tracking of lines added/deleted across all project files per participant.
- **Shared terminal:** the superhost shares it, hosts can view it, and typing is allowed only if the superhost enables it. Guests get no access.
- **Hackathon Mode, Session Wrapped recap and replay:** Collaborative countdown timer, task board, animated retrospective story recap, and replay.
- **Hard session end:** when the superhost ends the session, every host and guest loses all access immediately.

## Architecture

```
 Host VS Code ──┐                          ┌── Guest VS Code
 (raw project   │      WebSocket relay     │   (masked, read-only
  files)        ├────►  server/server.js ──┤    parallel:/... docs &
                │   mask secrets · roles · │    Project Files tree)
 Host VS Code ──┘    edit guard · fan-out  └── Guest VS Code
```

- When a host starts a session, the extension scans the workspace folder (excluding `.git/`, `node_modules/`, binary/media files, and sensitive credentials like `.env`), sends a `project_manifest`, and uploads file contents in batches under `MAX_PAYLOAD`.
- Guests receive the manifest via `project_update` and render the nested folder tree. Clicking any file lazily requests masked content via `file_request`.
- The active file that was open when the host started the session is always shared (even if normally excluded), with secrets masked.

## Project Structure

```
hackloop-parallel/
├── extension/parallel/          # VS Code Extension
│   ├── src/
│   │   ├── extension.ts         # Extension activation, commands, and socket event loop
│   │   ├── connection.ts        # WebSocket client connection & message dispatcher
│   │   ├── sidebar.ts           # Participants tree view provider
│   │   ├── project/
│   │   │   ├── paths.ts         # Path sanitization, limits, and exclusion rules
│   │   │   ├── scanner.ts       # Host workspace scanner & batched uploader
│   │   │   └── tree.ts          # Guest "Project Files" tree view provider
│   │   ├── safety/              # Status bar, contribution commands, safety logging
│   │   ├── wrapped/             # Session Wrapped recap webview, git stats, avatars
│   │   ├── hackathon/           # Hackathon Mode command center panel
│   │   ├── dashboard/           # Admin dashboard webview
│   │   ├── replay/              # Session replay player
│   │   └── terminal/            # Shared terminal integration
│   └── package.json             # Commands, views, and configuration contributions
└── server/                      # Node.js WebSocket Relay Server
    ├── server.js                # Server entry point, document store, and session logic
    ├── project/
    │   └── paths.js             # Pure path sanitizer and exclusion matcher
    ├── safety/
    │   ├── mask.js              # Secret detection and masking engine (10 patterns)
    │   ├── edit-guard.js        # Three-way edit reconciliation & secret collision guard
    │   ├── contributions.js     # Per-participant contribution ledger across files
    │   └── patterns.js          # Regex patterns for API keys, tokens, and credentials
    ├── wrapped/                 # Pure computation of Wrapped retrospective metrics
    ├── hackathon/               # Hackathon state store and persistence
    ├── replay/                  # Session snapshot recorder and storage
    └── test.js                  # Standalone unit and integration test suite
```

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `parallel.serverUrl` | `string` | `"ws://localhost:8080"` | Address of the Parallel WebSocket server. |
| `parallel.share.scope` | `string` | `"project"` | Scope of files to share: `"project"` (entire workspace folder) or `"activeFileOnly"`. |
| `parallel.share.exclude` | `array` | `[]` | Additional glob patterns to exclude from project sharing. |
| `parallel.share.includeSensitiveFiles` | `boolean` | `false` | Whether to include sensitive files (like `.env`). Filenames become visible, but secret values remain masked. |
| `parallel.share.maxFiles` | `number` | `500` | Maximum number of files to share from the workspace folder. |
| `parallel.terminalShell` | `string` | `""` | Shell to run in the shared terminal (empty: `cmd.exe` on Windows, `$SHELL` elsewhere). |
| `parallel.wrapped.useGithubAvatar` | `boolean` | `true` | Whether to use GitHub profile avatars in Session Wrapped when signed into VS Code. |

## Quick start

### 1. Start the server

```bash
cd server
npm install
node server.js
```

It listens on `ws://localhost:8080`. To use another port:

```bash
# macOS / Linux
PORT=9000 node server.js
# PowerShell
$env:PORT=9000; node server.js
```

Then set `parallel.serverUrl` to match.

### 2. Run the extension

**Option A: from source (recommended)**

```bash
cd extension/parallel
npm install
npm run compile
```

Open `extension/parallel` in VS Code and press **F5**. A second Extension Development Host window opens.

**Option B: prebuilt VSIX**

```bash
code --install-extension extension/parallel/parallel-0.0.1.vsix
```

### 3. Try a session

1. In the Extension Host window, open any folder containing code.
2. Press `Ctrl+Shift+P` and run **Parallel: Start Session**. Enter a host name to generate a 6-character code.
3. Open a second VS Code window with a separate profile for the guest:
   ```powershell
   code --extensionDevelopmentPath="<path>\extension\parallel" --user-data-dir="C:\temp\parallel-guest"
   ```
4. In that window run **Parallel: Join Session** and enter the code.
5. Approve the join in the host window.
6. The guest sees the active file open automatically and can explore the entire project tree via the **Project Files** view in the Parallel Activity Bar.

## Roles

| Role | How you get it | Can do |
|------|----------------|--------|
| **Superhost** | Starts the session | Approves joiners, shares whole project, grants/revokes edit access, shares terminal, ends session |
| **Host** | Promoted by superhost | Edits shared files, views shared terminal, types in terminal if allowed |
| **Guest** | Joins with code | Read-only view of all shared files via virtual documents, remote cursors |

## Ending a session

When the superhost ends the session:

- All members lose edit access and session state immediately.
- Guest and host sockets are disconnected cleanly.
- Virtual read-only tabs and editable copies are closed without save prompts.
- All participants receive the animated Session Wrapped retrospective recap.

## Team
Samridh S Shetty
J Nishanth Bhat
Ishan K
Pratham Ashok Shetty
