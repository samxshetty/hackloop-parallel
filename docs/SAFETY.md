# Parallel Safety & Credit System

## Overview

The Parallel Safety and Credit system provides core capabilities for secure collaborative editing:
1. **Server-Side Secret Masking**: Automatically shields sensitive secrets (API keys, database URLs, tokens, passwords) in the host's document so that guests never receive raw credentials.
2. **Hidden-Value Edit Protection**: Allows guests with edit access to safely edit the document. The server rejects any edits that touch or overwrite hidden secret values while safely applying edits elsewhere.
3. **Authoritative Contribution & Credit Tracking**: Authoritatively tracks accepted edits and lines changed per guest editor, preserving contribution history across access revocations and generating Git commit trailers (`Co-authored-by: <Name> <slug@parallel.invalid>`) with a single command.

---

## What It Does

### 1. Length-Preserving Secret Masking
- The server applies `maskSecrets` to all text delivered to guests (initial joins, late joins, and document updates).
- Each secret is replaced with the exact same count of bullet characters (`•`), while preserving all line breaks (`\r\n` and `\n`).
- Document lengths, columns, line numbers, cursor markers, and selection highlights align perfectly between host and guest.
- For variable assignments (e.g., `password = "value"` or `token: 'value'`), only the secret value is masked; the variable name, formatting, and quotes remain intact.
- The host retains raw, unmodified code at all times.

### 2. Hidden-Value Edit Rule
- Guests edit their local masked view of the document.
- When an edit arrives from a guest, the server computes the change region against the last masked document and verifies that it does not overlap any hidden secret span.
- **Edits touching hidden values are rejected**: If an edit intersects a masked region, the server rejects it with `{"t":"error","msg":"That value is hidden and can't be edited"}` and resyncs the guest to the last valid masked state.
- **Edits outside hidden values are reconciled**: Edits elsewhere in the file (or adjacent to hidden values) are applied to the server's raw document, preserving raw secrets on the host and broadcasting masked text to other guests.

### 3. Contribution Credit Rule
- Contribution credit is tracked authoritatively on the server for guests with active edit access.
- For every accepted edit from an approved guest, the server records the guest name, number of edits, and lines changed.
- **Burst coalescing**: Edits by the same guest within a 5-second window coalesce into a single edit entry with accumulated line counts.
- **Revocation preservation**: When a guest's edit access is revoked, their contribution record is retained with `revoked: true` so past work is not lost.
- **Host exclusion**: Session owners and hosts are never listed in the credit ledger.
- The command `Parallel: Commit With Credit` reads the server's credit ledger, presents a QuickPick of credited contributors with their edit count, line count, and revocation status, prompts for custom or fallback emails (`<slug>@parallel.invalid`), and populates the Git commit input box with standardized `Co-authored-by` trailers.

### 4. Visibility & Safety Logging
- **Status Bar Item**: Displays `$(shield) N hidden • M editors` for the host, showing tooltip descriptions of hidden secret categories and active contributors. Automatically hides when no secrets or contributors are present.
- **Safety Output Channel**: An output channel (`Parallel Safety`) logs timestamps for masked secrets, edit permissions granted or revoked, blocked edits near hidden values, and credited contributors. Secret values are never logged.

---

## 30-Second Demo

1. **Start Server**:
   ```bash
   cd server
   npm start
   ```
2. **Start Host Session**:
   - Open a file in VS Code containing a fake key or assignment:
     ```typescript
     const aws = "AKIA1234567890ABCDEF";
     const setting = "initial";
     ```
   - Run `Parallel: Start Session` and choose a name.
   - Look at the status bar: `$(shield) 1 hidden`.
3. **Join as Guest & Request Edit Access**:
   - In a second VS Code window, run `Parallel: Join Session`, enter the code, and join.
   - The guest sees:
     ```typescript
     const aws = "••••••••••••••••••••";
     const setting = "initial";
     ```
   - Guest requests edit access (`Parallel: Request Edit Access`); host approves.
4. **Collaborative Live Editing**:
   - Guest changes `setting = "updated"`. The edit is accepted, host retains the real AWS key, and host receives `{ t: 'credit' }`.
   - If guest attempts to edit `••••••••••••••••••••`, the edit is blocked with `"That value is hidden and can't be edited"`.
5. **Commit With Credit**:
   - Host runs `Parallel: Commit With Credit`.
   - The Source Control commit input box is pre-filled with:
     ```text
     Implement shared changes

     Co-authored-by: Alice <alice@parallel.invalid>
     ```

---

## System Limits

- **Regex-based Heuristics**: Secret identification uses pattern matching. Highly obfuscated strings, custom encrypted formats, base64-encoded strings lacking standard headers, or unconventional variable names without assignment syntax may not be caught.
- **Plain Prose Safeguards**: The regex avoids false positives on words like "password" or "token" in plain comments/prose, requiring assignment operators (`=` or `:`) with values of at least 6 characters.
- **Coalescing Window**: Contribution counts coalesce within a 5-second burst threshold to prevent rapid keystrokes from inflating commit credit counts.

---

## Message Types Added / Enhanced

| Message Type | Direction | Payload | Description |
|---|---|---|---|
| `masked` | Server → Host | `{ "t": "masked", "count": number, "kinds": string[] }` | Sent to the host whenever the count of hidden secrets in the document changes. Never exposes secret values or locations. |
| `credit` | Server → Host | `{ "t": "credit", "list": [{ "name": string, "edits": number, "lines": number, "revoked": boolean }] }` | Authoritative contribution ledger sent to the host (throttled to at most once per second). |
| `request_edit` | Guest → Server → Host | `{ "t": "request_edit" }` / `{ "t": "edit_request", "name": string }` | Guest requests live edit permission. |
| `decide_edit` | Host → Server | `{ "t": "decide_edit", "name": string, "approve": boolean }` | Superhost approves or denies guest edit access. |
| `revoke_edit` | Host → Server | `{ "t": "revoke_edit", "name": string }` | Superhost revokes guest edit access. |
| `edit_status` | Server → Guest | `{ "t": "edit_status", "canEdit": boolean }` | Notifies guest of their current edit permission. |
