# Parallel Safety & Credit System

## Overview

The Parallel Safety and Credit system provides two core capabilities:
1. **Server-Side Secret Masking**: Automatically shields sensitive secrets (API keys, database URLs, tokens, passwords) in the host's document so that guests never receive raw credentials.
2. **Co-Author Credit Tracking**: Automatically records accepted suggestions from guests and prepares Git commit trailers (`Co-authored-by: <Name> <slug@parallel.invalid>`) with a single command.

---

## What It Does

### 1. Length-Preserving Secret Masking
- The server applies `maskSecrets` to all text delivered to guests (initial joins, late joins, document updates, and suggestions).
- Each secret is replaced with the exact same count of bullet characters (`•`), while preserving all line breaks (`\r\n` and `\n`).
- Document lengths, columns, line numbers, cursor markers, and selection highlights align perfectly between host and guest.
- For variable assignments (e.g., `password = "value"` or `token: 'value'`), only the secret value is masked; the variable name, formatting, and quotes remain intact.
- The host retains raw, unmodified code at all times.

### 2. Suggestion Protection Around Secrets
- When a guest submits a suggestion (`suggest`), the server analyzes whether the suggestion's target range overlaps any masked secret region.
- If an overlap is detected, the suggestion is tagged with `masked: true`, alerting the host before applying changes that could overwrite or expose hidden secrets.

### 3. Credit Ledger & Git Trailer Generation
- Every time a suggestion is accepted by the host, the guest's contribution is recorded in a session ledger.
- The command `Parallel: Commit With Credit` inspects the active Git repository, presents a QuickPick of credited contributors and their accepted suggestion count, prompts for custom or fallback emails (`<slug>@parallel.invalid`), and populates the Git commit input box with standardized `Co-authored-by` trailers.

### 4. Visibility & Safety Logging
- **Status Bar Item**: Displays `$(shield) N hidden` for the host, showing tooltip descriptions of hidden categories (e.g. AWS Access Key, Stripe API Key). Automatically hides when no secrets are present.
- **Safety Output Channel**: An output channel (`Parallel Safety`) logs timestamps for masked secrets, accepted suggestions, and generated commit credits.
- **Guest Notification**: Guests receive a friendly one-time notification upon joining: *"Some sensitive values are hidden by the host's safety filter."*

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
     const password = "mySecretPassword123";
     ```
   - Run `Parallel: Start Session` and choose a name.
   - Look at the status bar: `$(shield) 2 hidden`.
3. **Join as Guest**:
   - In a second VS Code window, run `Parallel: Join Session`, enter the 6-character code, and join.
   - Approve the guest in the host window.
   - The guest sees:
     ```typescript
     const aws = "••••••••••••••••••••";
     const password = "•••••••••••••••••••";
     ```
4. **Commit With Credit**:
   - Host reviews and accepts a guest suggestion.
   - Run `Parallel: Commit With Credit`.
   - Untick or edit emails if desired, then press Enter.
   - The Source Control commit input box is pre-filled with:
     ```text
     Implement shared changes

     Co-authored-by: Alice <alice@parallel.invalid>
     ```

---

## System Limits

- **Regex-based Heuristics**: Secret identification uses pattern matching. Highly obfuscated strings, custom encrypted formats, base64-encoded strings lacking standard headers, or unconventional variable names without assignment syntax may not be caught.
- **Plain Prose Safeguards**: The regex avoids false positives on words like "password" or "token" in plain comments/prose, requiring assignment operators (`=` or `:`) with values of at least 6 characters.

---

## Message Types Added / Enhanced

| Message Type | Direction | Payload | Description |
|---|---|---|---|
| `masked` | Server → Host | `{ "t": "masked", "count": number, "kinds": string[] }` | Sent to the host whenever the count of hidden secrets in the document changes. Never exposes secret values or locations. |
| `suggest` | Guest → Server → Host | `{ ..., "masked": boolean }` | Flagged with `"masked": true` if the suggested edit intersects a masked secret range. |
