import * as vscode from 'vscode';
import { onMessage } from '../connection';

let safetyChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!safetyChannel) {
        safetyChannel = vscode.window.createOutputChannel('Parallel Safety');
    }
    return safetyChannel;
}

export function logSafety(message: string) {
    const timestamp = new Date().toISOString();
    getChannel().appendLine(`[${timestamp}] ${message}`);
}

export function registerSafetyLogger(context: vscode.ExtensionContext) {
    const channel = getChannel();

    // Listen to secrets masked (never log secret values)
    onMessage('masked', (msg: { count?: number; kinds?: string[] }) => {
        const count = typeof msg.count === 'number' ? msg.count : 0;
        if (count > 0) {
            const kinds = Array.isArray(msg.kinds) && msg.kinds.length > 0 ? msg.kinds.join(', ') : 'Unknown';
            logSafety(`Masked ${count} secret(s): ${kinds}`);
        }
    });

    // Edit access granted
    onMessage('edit_granted', (msg: { name?: string }) => {
        if (msg && msg.name) {
            logSafety(`Edit access granted: ${msg.name}`);
        }
    });

    // Edit access revoked
    onMessage('edit_revoked', (msg: { name?: string }) => {
        if (msg && msg.name) {
            logSafety(`Edit access revoked: ${msg.name}`);
        }
    });

    // Edits blocked near hidden secrets
    onMessage('error', (msg: { msg?: string }) => {
        if (msg && typeof msg.msg === 'string' && (msg.msg.includes('hidden') || msg.msg.includes("can't be edited"))) {
            logSafety(`Edit blocked: ${msg.msg}`);
        }
    });

    // Contributors credited
    onMessage('credit', (msg: { list?: Array<{ name: string; edits: number; lines: number; revoked?: boolean }> }) => {
        if (msg && Array.isArray(msg.list) && msg.list.length > 0) {
            const summary = msg.list
                .map((c) => `${c.name} (${c.edits} edit${c.edits === 1 ? '' : 's'}, ${c.lines} line${c.lines === 1 ? '' : 's'}${c.revoked ? ', revoked' : ''})`)
                .join(', ');
            logSafety(`Contributors credited: ${summary}`);
        }
    });

    // Register command to view output channel
    const showCmd = vscode.commands.registerCommand('parallel.showSafetyLog', () => {
        channel.show(true);
    });

    context.subscriptions.push(channel, showCmd);
}
