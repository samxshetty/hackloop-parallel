# Parallel Session Replay Guide

## Overview

The Collaborative Session Replay feature captures and reconstructs collaborative coding sessions in Parallel. When a session ends, the recording is securely packaged and made available for instant interactive playback inside a VS Code webview or as an exported standalone single-file HTML report.

---

## What It Does

1. **Lightweight Lifecycle & Document Recording**:
   - Automatically tracks session events (`session_start`, `join_request`, `joined`, `denied`, `role_change`, `suggest`, `suggest_accepted`, `suggest_rejected`, `session_end`).
   - Captures masked document snapshots whenever editors publish document updates.
   - Computes a session summary with duration, total edits, suggestion metrics (suggested, accepted, rejected), and participants.

2. **Interactive Playback Webview**:
   - **Timeline Slider**: Scrub smoothly to any point in the session duration.
   - **Play / Pause & Variable Speeds**: Play back history in real-time or at 1x, 2x, 4x, or 8x speed.
   - **Idle Skip Toggle**: Automatically fast-forwards through inactive pauses longer than 5 seconds.
   - **Event Markers & Feed**: Color-coded markers along the timeline bar highlight joins, role changes, edits, and suggestions. Clicking any event jumps directly to that timestamp.
   - **Changed-Line Highlights**: Code lines altered in a snapshot temporarily highlight in green to draw attention to recent changes.
   - **Keyboard Navigation**: Spacebar toggles play/pause, left/right arrows jump between events, and Shift+left/right jumps 10 seconds.
   - **Summary Badges**: Prominent header card displaying session duration, edit count, suggestions breakdown, and participant names.

3. **Standalone HTML Export**:
   - Replays can be exported as a portable, single-file HTML document (`Parallel: Export Replay as HTML`).
   - The standalone file contains the complete interactive viewer and safely embedded JSON replay data with no external dependencies or CDNs.

---

## 30-Second Demo

1. **Start the Parallel Server**:
   ```bash
   cd server
   npm start
   ```

2. **Run a Session**:
   - Host runs `Parallel: Start Session` (e.g. name "Alice") on any active file.
   - Guest runs `Parallel: Join Session` with the 6-character code (e.g. name "Bob").
   - Host approves the join request.
   - Host makes edits to the shared file; guest submits a suggestion.
   - Host accepts or rejects the suggestion.

3. **View the Replay**:
   - Host closes the session / disconnects.
   - Both host and guest receive a notification: *"Session ended. Open replay?"*
   - Click **Open Replay** (or run `Parallel: Open Last Replay` / `Parallel: Open Replay File`).
   - Scrub the slider or press Space to play. Click the **Export HTML** button in the controls bar or run `Parallel: Export Replay as HTML` to save a portable report.

---

## Protocol & Message Types

| Message Type | Direction | Description | Payload Shape |
|---|---|---|---|
| `replay_ready` | Server $\to$ Client | Notifies participants that a recording has been finalized and saved. | `{ t: 'replay_ready', id: string }` |
| `summary` | Server $\to$ Client | Provides high-level session statistics upon session termination. | `{ t: 'summary', duration: number, edits: number, suggested: number, accepted: number, rejected: number, participants: string[] }` |
| `replay_get` | Client $\to$ Server | Requests full replay data for a specific recording ID. | `{ t: 'replay_get', id: string }` |
| `replay` | Server $\to$ Client | Returns complete replay payload (version 1) to authorized participants. | `{ t: 'replay', data: ReplayData }` |

---

## Storage & Safety Limits

- **In-Memory Buffering**: Session events and document snapshots are buffered entirely in memory during active sessions and flushed to disk only when the session ends.
- **200 KB per Snapshot**: Individual document snapshots larger than 200 KB are skipped with a marker to prevent memory exhaustion from giant binary or generated files.
- **5 MB Total Recording Cap**: A recording halts additional snapshots if the aggregated memory footprint reaches 5 MB.
- **20-File Disk Retention**: The server persists completed recordings under `server/replays/` and retains only the 20 most recent recordings, pruning older files automatically.
- **Filename Sanitization**: Recording identifiers are strict 12-character hex strings (`/^[a-f0-9]{12}$/`), eliminating path traversal risks (`../`).

---

## Security Notes

- **Zero Raw Secrets**:
  - All document snapshots pass through the server's secret masking pipeline (`maskSecrets`) before entering the recorder.
  - Suggestion previews in the event feed are masked and capped at 200 characters.
  - Raw credentials (such as AWS keys, GitHub tokens, database connection URIs, and passwords) never touch the recorder or replay files.
- **Zero Cursor Logging**:
  - Real-time cursor coordinates (`cursor` messages) are strictly transient and are never saved to recordings, keeping recording sizes minimal and preventing tracking noise.
- **Strict Authorization**:
  - Replay access via `replay_get` is restricted to authorized session participants.
  - Non-members or unauthorized requests are rejected with `{ t: 'error', msg: 'no replay' }`.
