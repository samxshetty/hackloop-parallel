import * as vscode from 'vscode';
import { onMessage } from '../connection';

let statusBarItem: vscode.StatusBarItem | undefined;
let hiddenSecretCount = 0;
let secretKinds: string[] = [];
let contributorCount = 0;

export function registerSafetyStatus(context: vscode.ExtensionContext): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.name = 'Parallel Safety';

    onMessage('masked', (msg: { count?: number; kinds?: string[] }) => {
        hiddenSecretCount = typeof msg.count === 'number' ? msg.count : 0;
        secretKinds = Array.isArray(msg.kinds) ? msg.kinds : [];
        updateSafetyDisplay();
    });

    onMessage('credit', (msg: { list?: any[] }) => {
        if (msg && Array.isArray(msg.list)) {
            contributorCount = msg.list.length;
            updateSafetyDisplay();
        }
    });

    onMessage('ended', () => {
        resetSafetyStatus();
    });

    onMessage('closed', () => {
        resetSafetyStatus();
    });

    context.subscriptions.push(statusBarItem);
    return statusBarItem;
}

function updateSafetyDisplay() {
    if (!statusBarItem) {
        return;
    }

    if (hiddenSecretCount <= 0 && contributorCount <= 0) {
        statusBarItem.hide();
        return;
    }

    const parts: string[] = [];
    if (hiddenSecretCount > 0) {
        parts.push(`${hiddenSecretCount} hidden`);
    }
    if (contributorCount > 0) {
        parts.push(`${contributorCount} editor${contributorCount === 1 ? '' : 's'}`);
    }

    statusBarItem.text = `$(shield) ${parts.join(' • ')}`;

    const tooltips: string[] = [];
    if (hiddenSecretCount > 0) {
        const kindList = secretKinds.length > 0 ? secretKinds.join(', ') : 'Secrets';
        tooltips.push(`Hidden secrets (${hiddenSecretCount}): ${kindList}`);
    }
    if (contributorCount > 0) {
        tooltips.push(`Active contributors: ${contributorCount}`);
    }
    statusBarItem.tooltip = tooltips.join('\n');
    statusBarItem.show();
}

export function updateSafetyStatus(count: number, kinds: string[]) {
    hiddenSecretCount = count;
    secretKinds = kinds;
    updateSafetyDisplay();
}

export function resetSafetyStatus() {
    hiddenSecretCount = 0;
    secretKinds = [];
    contributorCount = 0;
    if (statusBarItem) {
        statusBarItem.hide();
    }
}

export function hideSafetyStatus() {
    resetSafetyStatus();
}
