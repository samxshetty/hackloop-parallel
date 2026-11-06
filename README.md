# Team Parallel

Live shared coding for VS Code, built for **Hackloop 2026** (team Paralell).

Parallel streams the host's active file to other people in real time through a small Node.js WebSocket relay. The server masks secrets before anyone else sees the text, enforces roles, and fans updates out to everyone in the session.

## Features

- **Start / join sessions** with a 6-character code and a lobby where the superhost approves each joiner
- **Live read-only view** for guests, shown as a virtual `parallel:` document (nothing is written to their disk)
- **Remote cursors** and a status bar showing session state
- **Roles:** superhost, host (promoted guest, gets an editable copy) and guest (read-only)
- **Secret masking:** API keys and similar secrets appear as `••••••` to guests
- **Shared terminal:** the superhost shares it, hosts can view it, and typing is allowed only if the superhost enables it. Guests get no access
- **Hackathon Mode, Session Wrapped recap and replay** (replay uses pre-masked snapshots)
- **Hard session end:** when the superhost ends the session, every host and guest loses all access immediately

## Architecture

```
 Host VS Code ──┐                          ┌── Guest VS Code
 (raw text)     │      WebSocket relay     │   (masked, read-only
                ├────►  server/server.js ──┤    parallel: document)
 Host VS Code ──┘  mask secrets · roles ·  └── Guest VS Code
                   edit guard · fan-out
```

Nothing is peer-to-peer. Only the host's **active file** (its text and base name, not the full path) is shared, not the folder or project.

## Prerequisites

- Node.js 18 or newer, and npm
- VS Code (the extension's `package.json` requires `^1.140.0`; if F5 complains, update VS Code or lower `engines.vscode`)
- Git

## Quick start

### 1. Start the server

```bash
cd server
npm install
node server.js
```

It listens on `ws://localhost:8080`. Keep this terminal open. To use another port:

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

Open the `extension/parallel` folder in VS Code and press **F5** (choose *VS Code Extension Development Host* if asked, or click *Run Extension* in Run and Debug). A second window opens with Parallel loaded.

If there is no launch config, create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"]
    }
  ]
}
```

**Option B: prebuilt VSIX**

```bash
code --install-extension extension/parallel/parallel-0.0.1.vsix
```

### 3. Try a session

1. In the Extension Host window, open any file.
2. Press `Ctrl+Shift+P` and run **Parallel: Start Session**. Enter a name to get a 6-character code.
3. Open a second VS Code window with a separate profile for the guest:
   ```powershell
   code --extensionDevelopmentPath="<path>\extension\parallel" --user-data-dir="C:\temp\parallel-guest"
   ```
4. In that window run **Parallel: Join Session** and enter the code.
5. Approve the join from the host window.

To test secret masking, put a fake key in the file:

```js
const API_KEY = "sk-demo1234567890abcdefghijkl";
```

The guest should see `••••••` in its place.

## Using it across laptops

Run the server on one machine, then on every other machine set the VS Code setting:

```
parallel.serverUrl = ws://<host-laptop-ip>:8080
```

Find the IP with `ipconfig` (Windows) or `ifconfig` / `ip a`. Everyone must be on the same network, and Windows may ask you to allow Node through the firewall the first time. Internet-wide sessions are not supported yet; they would need a hosted server.

## Roles

| Role | How you get it | Can do |
|------|----------------|--------|
| **Superhost** | Starts the session | Approves joiners, promotes/demotes, shares the terminal, ends the session |
| **Host** | Promoted by the superhost | Editable copy of the file, can view the shared terminal |
| **Guest** | Joins with the code | Read-only masked view, remote cursors |

## Ending a session

When the superhost ends the session:

- All members and pending joiners lose their role, edit access and session code
- Guest and host sockets are closed by the server after about 5 seconds
- The superhost keeps its role for 60 seconds only, so the Wrapped commit counts can still arrive
- On the client, hosts and guests see "The host ended the session. Your access has been removed.", the read-only `parallel:` tab is closed, and any editable copy is closed without a save prompt
- The same cleanup runs if a guest is disconnected from the server mid-session

The Session Wrapped recap and replay are still delivered to everyone at the end, since they are demo features.


## Team
Samridh S Shetty
J Nishanth Bhat
Ishan K
Pratham Ashok Shetty