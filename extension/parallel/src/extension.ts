import * as vscode from 'vscode';
import { connect, send, onMessage, disconnect, session, isEditor } from './connection';
import { registerSafetyStatus } from './safety/status';
import { registerCreditCommands } from './safety/credit';
import { registerSafetyLogger } from './safety/log';
import { registerReplayLoader } from './replay/loader';
import { AdminDashboardManager } from './dashboard/panel';
import { ParticipantsProvider } from './sidebar';
import { registerTerminal, closeTerminals } from './terminal';

const SCHEME = 'parallel';
const MAX_SHARE_BYTES = 4 * 1024 * 1024;

let sharedText = '';
let sharedFile = 'shared.txt';
let sharedUri: vscode.Uri | undefined;
const sharedChanged = new vscode.EventEmitter<vscode.Uri>();

let hostDoc: vscode.TextDocument | undefined;
let hostFileName = 'shared.txt';
let sendTimer: NodeJS.Timeout | undefined;
let applyingRemote = false;
let warnedTooBig = false;

let lastPeers: { name: string; role: string; canEdit?: boolean }[] = [];

let joinedOk = false;

let pendingEditRequest = false;

let editorOpening: Promise<void> | undefined;

const cursors = new Map<string, { line: number; character: number }>();
const cursorTypes = new Map<string, vscode.TextEditorDecorationType>();
let cursorTimer: NodeJS.Timeout | undefined;

const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

const sidebar = new ParticipantsProvider();

function updateStatus(code?: string) {
    if (!session.role) {
        status.hide();
        return;
    }
    const editSuffix = session.role === 'guest' && session.canEdit ? ' (editor)' : '';
    status.text = `$(broadcast) Parallel: ${session.role}${editSuffix}` + (code ? ` · ${code}` : '');
    status.show();
}

function baseName(path: string): string {
    return path.split(/[\\/]/).pop() || 'shared.txt';
}

function languageFor(file: string): string | undefined {
    const ext = file.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        js: 'javascript', ts: 'typescript', py: 'python', md: 'markdown',
        json: 'json', html: 'html', css: 'css', java: 'java', c: 'c', cpp: 'cpp',
    };
    return ext ? map[ext] : undefined;
}

function isSharedDoc(doc: vscode.TextDocument): boolean {
    return doc === hostDoc ||
        (sharedUri !== undefined && doc.uri.toString() === sharedUri.toString());
}

function sendDoc() {
    if (!hostDoc) {
        return;
    }
    const text = hostDoc.getText();

    if (Buffer.byteLength(text, 'utf8') > MAX_SHARE_BYTES) {
        if (!warnedTooBig) {
            warnedTooBig = true;
            vscode.window.showWarningMessage(
                'Parallel: this file is too large to share (over 4 MB). Changes are not being sent.');
        }
        return;
    }
    warnedTooBig = false;
    send({ t: 'doc', text, file: hostFileName });
}

async function showSharedDoc(text: string, file: string) {
    sharedText = text;
    sharedFile = file || sharedFile;
    if (!sharedUri) {
        sharedUri = vscode.Uri.from({ scheme: SCHEME, path: '/' + sharedFile });
        const doc = await vscode.workspace.openTextDocument(sharedUri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } else {
        sharedChanged.fire(sharedUri);
    }
}

async function applyRemote(text: string) {
    sharedText = text;
    if (!hostDoc) {
        return;
    }
    const old = hostDoc.getText();
    if (old === text) {
        return;
    }

    let start = 0;
    const shortest = Math.min(old.length, text.length);
    while (start < shortest && old[start] === text[start]) {
        start++;
    }

    let oldEnd = old.length;
    let newEnd = text.length;
    while (oldEnd > start && newEnd > start && old[oldEnd - 1] === text[newEnd - 1]) {
        oldEnd--;
        newEnd--;
    }

    clearTimeout(sendTimer);
    applyingRemote = true;
    try {
        const range = new vscode.Range(
            hostDoc.positionAt(start),
            hostDoc.positionAt(oldEnd));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(hostDoc.uri, range, text.slice(start, newEnd));
        await vscode.workspace.applyEdit(edit);
    } finally {
        applyingRemote = false;
    }
}

async function closeReadOnlyTabs() {
    const tabs = vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.scheme === SCHEME);
    if (tabs.length > 0) {
        await vscode.window.tabGroups.close(tabs);
    }
}

async function openEditableCopy() {
    console.log(`[Parallel:becomeEditor] Opening editable document. Role=${session.role} lines=${sharedText.split('\n').length}`);
    await closeReadOnlyTabs();
    sharedUri = undefined;
    const doc = await vscode.workspace.openTextDocument({
        content: sharedText,
        language: languageFor(sharedFile),
    });
    hostDoc = doc;
    hostFileName = sharedFile;
    await vscode.window.showTextDocument(doc, { preview: false });
}

async function becomeEditor() {
    if (hostDoc && !hostDoc.isClosed) {
        return;
    }
    if (editorOpening) {
        return editorOpening;
    }
    editorOpening = openEditableCopy().finally(() => {
        editorOpening = undefined;
    });
    return editorOpening;
}

async function revokeLocalEditor() {
    const wasEditing = session.canEdit;
    session.canEdit = false;
    pendingEditRequest = false;
    updateStatus();
    if (wasEditing && session.role !== 'superhost') {
        const active = vscode.window.activeTextEditor;
        if (active && hostDoc && active.document === hostDoc) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        hostDoc = undefined;
        sharedUri = undefined;
        await showSharedDoc(sharedText, sharedFile);
        vscode.window.showInformationMessage('Your edit access has been revoked by the host.');
    }
}

function resetShared() {
    closeTerminals();
    sharedUri = undefined;
    sharedText = '';
    hostDoc = undefined;
    lastPeers = [];
    joinedOk = false;
    warnedTooBig = false;
    session.name = '';
    session.canEdit = false;
    pendingEditRequest = false;
    clearCursors();
    sidebar.setPeers([]);
}

function hueFor(name: string): number {
    let h = 0;
    for (const c of name) {
        h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return h;
}

function typeFor(name: string): vscode.TextEditorDecorationType {
    let t = cursorTypes.get(name);
    if (!t) {
        t = vscode.window.createTextEditorDecorationType({
            backgroundColor: `hsla(${hueFor(name)}, 80%, 55%, 0.35)`,
        });
        cursorTypes.set(name, t);
    }
    return t;
}

function repaintCursors() {
    for (const editor of vscode.window.visibleTextEditors) {
        if (!isSharedDoc(editor.document)) {
            continue;
        }
        for (const [name, c] of cursors) {
            const doc = editor.document;
            const start = doc.validatePosition(new vscode.Position(c.line, c.character));
            const end = doc.validatePosition(new vscode.Position(c.line, c.character + 1));
            editor.setDecorations(typeFor(name), [{
                range: new vscode.Range(start, end),
                renderOptions: {
                    after: {
                        contentText: ` ${name} `,
                        color: '#ffffff',
                        backgroundColor: `hsl(${hueFor(name)}, 70%, 40%)`,
                        margin: '0 0 0 2px',
                    },
                },
            }]);
        }
    }
}

function removeCursor(name: string) {
    cursors.delete(name);
    cursorTypes.get(name)?.dispose();
    cursorTypes.delete(name);
}

function clearCursors() {
    for (const name of [...cursors.keys()]) {
        removeCursor(name);
    }
}

async function showCode(code: string) {
    const pick = await vscode.window.showInformationMessage(
        `Session started! Your code is ${code}`, 'Copy code');
    if (pick === 'Copy code') {
        await vscode.env.clipboard.writeText(code);
    }
}

async function handleJoinRequest(name: string) {
    const pick = await vscode.window.showInformationMessage(
        `${name} wants to join`, 'Approve', 'Deny');
    if (!pick) {
        return;
    }
    send({ t: 'decide', name, approve: pick === 'Approve' });
}

export function activate(context: vscode.ExtensionContext) {
    registerSafetyStatus(context);
    registerCreditCommands(context);
    registerSafetyLogger(context);
    registerReplayLoader(context);
    AdminDashboardManager.getInstance().init(context);

    onMessage('created', (msg) => {
        joinedOk = true;
        showCode(msg.code);
        sendDoc();
        updateStatus(msg.code);
    });
    onMessage('join_request', (msg) => handleJoinRequest(msg.name));
    onMessage('joined', (msg) => {
        joinedOk = true;
        vscode.window.showInformationMessage("You're in! The host approved you.");
        if (typeof msg.masked === 'number' && msg.masked > 0) {
            vscode.window.showInformationMessage("Some sensitive values are hidden by the host's safety filter.");
        }
        updateStatus();
    });
    onMessage('denied', () => {
        vscode.window.showWarningMessage('The host denied your request.');
        session.role = undefined;
        updateStatus();
        resetShared();
        disconnect();
    });
    onMessage('peers', (msg) => {
        lastPeers = msg.peers ??
            (msg.list ?? []).map((n: string) => ({ name: n, role: 'guest', canEdit: false }));
        sidebar.setPeers(lastPeers);
        console.log('peers:', lastPeers);
        sendDoc();
    });
    onMessage('doc', (msg) => {
        if (isEditor()) {
            applyRemote(msg.text).then(repaintCursors);
        } else {
            showSharedDoc(msg.text, msg.file);
            setTimeout(repaintCursors, 100);
        }
    });
    onMessage('cursor', (msg) => {
        cursors.set(msg.name, { line: msg.line, character: msg.character });
        repaintCursors();
    });
    onMessage('cursor_gone', (msg) => removeCursor(msg.name));

    onMessage('edit_request', async (msg) => {
        if (session.role !== 'superhost') {
            return;
        }
        const pick = await vscode.window.showInformationMessage(
            msg.name + ' requested edit access.',
            'Approve',
            'Reject'
        );
        if (!pick) {
            return;
        }
        send({ t: 'decide_edit', name: msg.name, approve: pick === 'Approve' });
    });

    onMessage('edit_status', async (msg) => {
        pendingEditRequest = false;
        if (msg.canEdit) {
            session.canEdit = true;
            updateStatus();
            await becomeEditor();
            vscode.window.showInformationMessage('Edit access granted by host.');
        } else {
            await revokeLocalEditor();
        }
    });

    onMessage('edit_granted', (msg) => {
        if (session.name !== msg.name) {
            vscode.window.showInformationMessage('Edit access granted to ' + msg.name + '.');
        }
    });
    onMessage('edit_denied', (msg) => {
        pendingEditRequest = false;
        session.canEdit = false;
        updateStatus();
        if (session.name === msg.name) {
            vscode.window.showWarningMessage('The host rejected your edit access request.');
        }
    });
    onMessage('edit_revoked', (msg) => {
        if (session.name !== msg.name) {
            vscode.window.showInformationMessage('Edit access revoked for ' + msg.name + '.');
        }
    });

    onMessage('left', (msg) => {
        vscode.window.showInformationMessage(
            msg.pending
                ? `${msg.name} left before being approved.`
                : `${msg.name} left the session.`);
    });
    onMessage('role', async (msg) => {
        session.role = msg.role;
        updateStatus();
        vscode.window.showInformationMessage(`You are now a ${msg.role}.`);
        if (msg.role === 'host') {
            session.canEdit = true;
            await becomeEditor();
        } else if (msg.role === 'guest') {
            await revokeLocalEditor();
        }
    });
    onMessage('ended', () => {
        vscode.window.showInformationMessage('The host ended the session.');
        session.role = undefined;
        updateStatus();
        resetShared();
        disconnect();
    });
    onMessage('error', (msg) => {
        vscode.window.showWarningMessage('Server: ' + (msg.msg ?? msg.message));
        if (msg.fatal && session.role !== undefined && !joinedOk) {

            session.role = undefined;
            updateStatus();
            resetShared();
            disconnect();
        }
    });
    onMessage('closed', () => {
        if (session.role !== undefined) {
            vscode.window.showWarningMessage('Disconnected from the server.');
        }
        session.role = undefined;
        updateStatus();
        resetShared();
    });

    const start = vscode.commands.registerCommand('parallel.start', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open the file you want to share first.');
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name (host)?' });
        if (!name || !name.trim()) {
            return;
        }

        resetShared();
        session.role = undefined;
        try {
            await connect();
        } catch (err: any) {
            vscode.window.showErrorMessage(
                'Cannot reach the server: ' + (err?.code ?? err?.message ?? err));
            return;
        }
        session.role = 'superhost';
        session.canEdit = true;
        session.name = name.trim().slice(0, 30);
        hostDoc = editor.document;
        hostFileName = baseName(editor.document.fileName);
        send({ t: 'create', name: session.name });
    });

    const join = vscode.commands.registerCommand('parallel.join', async () => {
        const code = await vscode.window.showInputBox({
            prompt: 'Session code',
            validateInput: (value) =>
                value.trim().length === 6 ? null : 'The code has 6 characters',
        });
        if (!code) {
            return;
        }
        const name = await vscode.window.showInputBox({ prompt: 'Your name?' });
        if (!name || !name.trim()) {
            return;
        }

        resetShared();
        session.role = undefined;
        try {
            await connect();
        } catch (err: any) {
            vscode.window.showErrorMessage(
                'Cannot reach the server: ' + (err?.code ?? err?.message ?? err));
            return;
        }
        session.role = 'guest';
        session.canEdit = false;
        session.name = name.trim().slice(0, 30);
        send({ t: 'join', code: code.trim().toUpperCase(), name: session.name });
        vscode.window.showInformationMessage('Waiting for the host to approve you...');
    });

    const requestEdit = vscode.commands.registerCommand('parallel.requestEditAccess', async () => {
        if (!session.role) {
            vscode.window.showErrorMessage('You are not in a Parallel session.');
            return;
        }
        if (isEditor()) {
            vscode.window.showInformationMessage('You already have edit access.');
            return;
        }
        if (pendingEditRequest) {
            vscode.window.showInformationMessage('Edit request already pending approval.');
            return;
        }
        pendingEditRequest = true;
        send({ t: 'request_edit' });
        vscode.window.showInformationMessage('Edit access requested from the host. Waiting for approval...');
    });

    const grantEdit = vscode.commands.registerCommand('parallel.grantEditAccess', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the superhost can grant edit access.');
            return;
        }
        const guests = lastPeers.filter((p) => !p.canEdit && p.role !== 'superhost');
        if (guests.length === 0) {
            vscode.window.showInformationMessage('No guests with read-only access found.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            guests.map((p) => ({ label: p.name })),
            { placeHolder: 'Select guest to grant edit access to' }
        );
        if (!who) {
            return;
        }
        send({ t: 'decide_edit', name: who.label, approve: true });
    });

    const revokeEdit = vscode.commands.registerCommand('parallel.revokeEditAccess', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the superhost can revoke edit access.');
            return;
        }

        const editors = lastPeers.filter((p) => p.canEdit && p.role === 'guest');
        if (editors.length === 0) {
            vscode.window.showInformationMessage('No participants currently have edit access.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            editors.map((p) => ({ label: p.name })),
            { placeHolder: 'Select editor to revoke edit access from' }
        );
        if (!who) {
            return;
        }
        send({ t: 'revoke_edit', name: who.label });
    });

    const changeRole = vscode.commands.registerCommand('parallel.changeRole', async () => {
        if (session.role !== 'superhost') {
            vscode.window.showErrorMessage('Only the super host can change roles.');
            return;
        }
        if (lastPeers.length === 0) {
            vscode.window.showInformationMessage('Nobody has joined yet.');
            return;
        }
        const who = await vscode.window.showQuickPick(
            lastPeers.map((p) => ({ label: p.name, description: p.role })),
            { placeHolder: 'Whose role do you want to change?' });
        if (!who) {
            return;
        }
        const role = await vscode.window.showQuickPick(['host', 'guest'],
            { placeHolder: `New role for ${who.label}` });
        if (!role) {
            return;
        }
        send({ t: 'role', name: who.label, role });
    });

    const jumpToPerson = vscode.commands.registerCommand(
        'parallel.jumpToPerson',
        async (arg?: string | { name: string }) => {
            let targetName = typeof arg === 'string' ? arg : arg?.name;
            if (!targetName) {
                if (lastPeers.length === 0) {
                    vscode.window.showInformationMessage('No participants in the session.');
                    return;
                }
                const pick = await vscode.window.showQuickPick(
                    lastPeers.map((p) => p.name),
                    { placeHolder: 'Select a participant to jump to' }
                );
                if (!pick) {
                    return;
                }
                targetName = pick;
            }

            const pos = cursors.get(targetName);
            if (!pos) {
                vscode.window.showInformationMessage(`No cursor position for ${targetName} yet.`);
                return;
            }

            const editor = (vscode.window.activeTextEditor && isSharedDoc(vscode.window.activeTextEditor.document))
                ? vscode.window.activeTextEditor
                : vscode.window.visibleTextEditors.find((e) => isSharedDoc(e.document));

            if (!editor) {
                vscode.window.showInformationMessage('The shared file is not open in an editor.');
                return;
            }

            const position = new vscode.Position(pos.line, pos.character);
            const range = new vscode.Range(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    );

    const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
        onDidChange: sharedChanged.event,
        provideTextDocumentContent: () => sharedText,
    });

    const watcher = vscode.workspace.onDidChangeTextDocument((e) => {
        if (!isEditor() || e.document !== hostDoc || applyingRemote) {
            return;
        }
        clearTimeout(sendTimer);
        sendTimer = setTimeout(sendDoc, 100);
    });

    const selectionWatcher = vscode.window.onDidChangeTextEditorSelection((e) => {
        if (!session.role || !isSharedDoc(e.textEditor.document)) {
            return;
        }
        clearTimeout(cursorTimer);
        cursorTimer = setTimeout(() => {
            const p = e.selections[0].active;
            send({ t: 'cursor', line: p.line, character: p.character });
        }, 50);
    });

    const visibleWatcher = vscode.window.onDidChangeVisibleTextEditors(() => repaintCursors());

    const openDashboard = vscode.commands.registerCommand('parallel.openAdminDashboard', () => {
        AdminDashboardManager.getInstance().open(context);
    });

    const participantsView = vscode.window.registerTreeDataProvider('parallel.participants', sidebar);
    const terminalDisposables = registerTerminal();

    context.subscriptions.push(
        start, join, changeRole, requestEdit, grantEdit, revokeEdit, jumpToPerson, openDashboard, provider,
        watcher, selectionWatcher, visibleWatcher, status, participantsView, ...terminalDisposables);
}

export function deactivate() {
    closeTerminals();
    disconnect();
}
