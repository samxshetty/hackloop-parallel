# Parallel

Live shared coding sessions in VS Code. One person hosts a file, others join with a 6-character code, and everyone sees edits as they happen.

## Commands

- **Parallel: Start Session**: share the file you have open and get a join code.
- **Parallel: Join Session**: enter a code to join. The host approves you.
- **Parallel: Change Role**: the super host can promote a guest to host, or demote a host to guest.

## Roles

- **Super host**: starts the session, can edit, promote, demote and end it.
- **Host**: promoted by the super host, can edit directly.
- **Guest**: sees the file read-only.

## Setup

A Parallel server must be running. Set its address in Settings under `parallel.serverUrl` (default `ws://localhost:8080`).