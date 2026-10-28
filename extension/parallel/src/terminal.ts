import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { onMessage, send, session } from './connection';

// Shared terminal.
//   Superhost: runs a shell, shows it in a VS Code terminal and streams its output.
//   Host (promoted guest): sees the output in a mirror terminal. Can type only
//              while the superhost has switched typing on.
//   Guest: nothing. The server never sends terminal data to guests, and the
//              checks here are a second layer on top of the server's.

const FLUSH_MS = 50;          // batch output so we stay under the server's message-rate limit
const CHUNK = 16 * 1024;      // server accepts up to 64 KB per message
const MAX_LINE = 4096;        // longest command line accepted
const ESC_SEQ = new RegExp(String.fromCharCode(27) + '\\[[0-9;?]*[A-Za-z~]', 'g'); // arrow keys etc.

const toTerm = (s: string) => s.replace(/\r?\n/g, '\r\n');
const plain = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ');

// ---------- superhost: the real shell ----------

class ShellPty implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number | void>();
    onDidWrite = this.writeEmitter.event;
    onDidClose = this.closeEmitter.event;

    private proc: ChildProcessWithoutNullStreams | undefined;
    private line = '';
    private outBuf = '';
    private timer: NodeJS.Timeout | undefined;

    constructor(private cwd: string | undefined) { }

    open() {
        this.writeEmitter.fire('\x1b[1mParallel shared terminal\x1b[0m: hosts can see everything shown here.\r\n');
        this.startShell();
    }

    close() {
        clearTimeout(this.timer);
        this.stopShell();
    }

    // shows text here and queues it for the hosts
    private emit(text: string) {
        const t = toTerm(text);
        this.writeEmitter.fire(t);
        this.outBuf += t;
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), FLUSH_MS);
        }
    }

    private flush() {
        this.timer = undefined;
        while (this.outBuf.length > 0) {
            send({ t: 'term_data', data: this.outBuf.slice(0, CHUNK) });
            this.outBuf = this.outBuf.slice(CHUNK);
        }
    }

    private startShell() {
        const custom = vscode.workspace.getConfiguration('parallel').get<string>('terminalShell', '').trim();
        const win = process.platform === 'win32';
        const cmd = custom || (win ? 'cmd.exe' : (process.env.SHELL || '/bin/bash'));
        try {
            const proc = spawn(cmd, [], { cwd: this.cwd, env: process.env });
            this.proc = proc;
            proc.stdout.on('data', (d) => this.emit(d.toString()));
            proc.stderr.on('data', (d) => this.emit(d.toString()));
            proc.on('error', (err) => {
                this.emit(`\n[could not start ${cmd}: ${err.message}]\n`);
                this.proc = undefined;
            });
            proc.on('exit', (code) => {
                if (this.proc === proc) {
                    this.proc = undefined;
                    this.emit(`\n[shell exited (${code}). Press Enter to start a new one]\n`);
                }
            });
        } catch (err: any) {
            this.emit(`\n[could not start ${cmd}: ${err?.message ?? err}]\n`);
        }
    }

    private stopShell() {
        const p = this.proc;
        this.proc = undefined;
        p?.kill();
    }

    private run(line: string) {
        if (!this.proc) {
            this.startShell();
        }
        this.proc?.stdin.write(line + '\n');
    }

    // You typing in the terminal (line mode: the command runs when you press Enter)
    handleInput(data: string) {
        for (const ch of data.replace(ESC_SEQ, '')) {
            if (ch === '\r' || ch === '\n') {
                const line = this.line;
                this.line = '';
                this.emit('\n');
                this.run(line);
            } else if (ch === '\x7f' || ch === '\b') {
                if (this.line.length > 0) {
                    this.line = this.line.slice(0, -1);
                    this.emit('\b \b');
                }
            } else if (ch === '\x03') { // Ctrl+C: stop the shell, a new one starts on the next Enter
                this.line = '';
                this.emit('^C\n');
                this.stopShell();
            } else if (ch >= ' ' && this.line.length < MAX_LINE) {
                this.line += ch;
                this.emit(ch);
            }
        }
    }

    // A host's command (only called after the superhost allowed typing)
    runRemote(name: string, line: string) {
        const safe = plain(line).slice(0, MAX_LINE);
        this.emit(`\n[${plain(name).slice(0, 30)}] $ ${safe}\n`); // visible record of who ran what
        this.run(safe);
    }
}

// ---------- host: read-only mirror (typing only when allowed) ----------

class MirrorPty implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number | void>();
    onDidWrite = this.writeEmitter.event;
    onDidClose = this.closeEmitter.event;
    private line = '';

    constructor(public allowInput: boolean) { }

    open() {
        this.writeEmitter.fire('\x1b[1mParallel: superhost terminal\x1b[0m\r\n' + this.banner() + '\r\n');
    }

    close() { /* VS Code closed the tab; the owner side clears our reference */ }

    private banner() {
        return this.allowInput
            ? 'You can type here. Commands run on the SUPERHOST\'s computer.'
            : 'View only.';
    }

    feed(data: string) {
        this.writeEmitter.fire(data);
    }

    setAllow(allow: boolean) {
        this.allowInput = allow;
        this.line = '';
        this.writeEmitter.fire('\r\n\x1b[1m[' + this.banner() + ']\x1b[0m\r\n');
    }

    dispose() {
        this.closeEmitter.fire();
    }

    handleInput(data: string) {
        if (!this.allowInput) {
            return;
        }
        for (const ch of data.replace(ESC_SEQ, '')) {
            if (ch === '\r' || ch === '\n') {
                const line = this.line;
                this.line = '';
                this.writeEmitter.fire('\x1b[2K\r'); // erase what we typed: the superhost's output shows the command
                if (line.trim().length > 0) {
                    send({ t: 'term_input', data: line });
                }
            } else if (ch === '\x7f' || ch === '\b') {
                if (this.line.length > 0) {
                    this.line = this.line.slice(0, -1);
                    this.writeEmitter.fire('\b \b');
                }
            } else if (ch >= ' ' && this.line.length < MAX_LINE) {
                this.line += ch;
                this.writeEmitter.fire(ch);
            }
        }
    }
}

// ---------- state ----------

let ownerTerm: vscode.Terminal | undefined;
let ownerPty: ShellPty | undefined;
let allowInput = false;

let mirrorTerm: vscode.Terminal | undefined;
let mirrorPty: MirrorPty | undefined;

function closeMirror() {
    const t = mirrorTerm;
    mirrorTerm = undefined;
    mirrorPty = undefined;
    t?.dispose();
}

function openMirror(allow: boolean) {
    closeMirror();
    mirrorPty = new MirrorPty(allow);
    mirrorTerm = vscode.window.createTerminal({ name: 'Parallel: Host terminal', pty: mirrorPty });
    mirrorTerm.show(true);
    vscode.window.showInformationMessage('The superhost shared their terminal with you.');
}

function stopSharing(tellServer: boolean) {
    const t = ownerTerm;
    ownerTerm = undefined;
    ownerPty = undefined;
    allowInput = false;
    if (tellServer) {
        send({ t: 'term_close' });
    }
    t?.dispose();
}

// Called when the session ends or we leave: close everything terminal-related
export function closeTerminals() {
    if (ownerTerm) {
        stopSharing(true);
    }
    closeMirror();
}

// ---------- commands and messages ----------

export function registerTerminal(): vscode.Disposable[] {
    onMessage('term_open', (msg) => {
        if (session.role !== 'host') {
            return; // guests never get this from the server; ignore it if it ever arrived
        }
        openMirror(!!msg.allowInput);
    });
    onMessage('term_data', (msg) => {
        if (session.role === 'host' && typeof msg.data === 'string') {
            mirrorPty?.feed(msg.data);
        }
    });
    onMessage('term_allow_input', (msg) => {
        if (session.role === 'host') {
            mirrorPty?.setAllow(!!msg.allow);
        }
    });
    onMessage('term_close', () => closeMirror());
    onMessage('term_input', (msg) => {
        // only the superhost runs commands, and only while typing is switched on
        if (session.role !== 'superhost' || !allowInput || !ownerPty) {
            return;
        }
        if (typeof msg.name !== 'string' || typeof msg.data !== 'string') {
            return;
        }
        ownerPty.runRemote(msg.name, msg.data);
    });

    const share = vscode.commands.registerCommand('parallel.shareTerminal', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the superhost can share a terminal.');
            return;
        }
        if (ownerTerm) {
            ownerTerm.show();
            return;
        }
        const pick = await vscode.window.showWarningMessage(
            'Share a terminal with the hosts?',
            {
                modal: true,
                detail: 'Hosts will see everything this terminal prints, including any secrets. ' +
                    'Guests never see it. Hosts can only type if you switch that on separately.',
            },
            'Share');
        if (pick !== 'Share') {
            return;
        }
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        allowInput = false;
        ownerPty = new ShellPty(cwd);
        ownerTerm = vscode.window.createTerminal({ name: 'Parallel: Shared terminal', pty: ownerPty });
        ownerTerm.show();
        send({ t: 'term_open' });
    });

    const stop = vscode.commands.registerCommand('parallel.stopSharingTerminal', () => {
        if (!ownerTerm) {
            vscode.window.showInformationMessage('You are not sharing a terminal.');
            return;
        }
        stopSharing(true);
        vscode.window.showInformationMessage('Stopped sharing the terminal.');
    });

    const toggle = vscode.commands.registerCommand('parallel.toggleTerminalInput', async () => {
        if (session.role !== 'superhost' || !ownerTerm) {
            vscode.window.showErrorMessage('Share a terminal first (Parallel: Share Terminal).');
            return;
        }
        if (!allowInput) {
            const pick = await vscode.window.showWarningMessage(
                'Let hosts type in your terminal?',
                {
                    modal: true,
                    detail: 'Hosts will be able to run commands on YOUR computer, as you. ' +
                        'Only allow this for people you trust. You can switch it off any time.',
                },
                'Allow typing');
            if (pick !== 'Allow typing' || !ownerTerm) {
                return;
            }
        }
        allowInput = !allowInput;
        send({ t: 'term_allow_input', allow: allowInput });
        vscode.window.showInformationMessage(
            allowInput ? 'Hosts can now type in your terminal.' : 'Hosts are back to view only.');
    });

    // the superhost closed the shared terminal tab themselves
    const closeWatcher = vscode.window.onDidCloseTerminal((t) => {
        if (t === ownerTerm) {
            stopSharing(true);
        } else if (t === mirrorTerm) {
            mirrorTerm = undefined;
            mirrorPty = undefined;
        }
    });

    return [share, stop, toggle, closeWatcher];
}
