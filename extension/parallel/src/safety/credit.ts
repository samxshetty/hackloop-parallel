import * as vscode from 'vscode';
import { ledger } from './ledger';
import { logSafety } from './log';

interface RepoPickItem extends vscode.QuickPickItem {
    repo: any;
}

interface GuestPickItem extends vscode.QuickPickItem {
    guest: { name: string; count: number };
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'guest';
}

export function registerCreditCommands(context: vscode.ExtensionContext) {
    const commitWithCredit = vscode.commands.registerCommand('parallel.commitWithCredit', async () => {
        // 1. Check for Git extension
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            vscode.window.showErrorMessage('Git extension is not available.');
            return;
        }

        const git = gitExtension.exports.getAPI(1);
        if (!git) {
            vscode.window.showErrorMessage('Could not load Git API (version 1).');
            return;
        }

        const repositories = git.repositories;
        if (!repositories || repositories.length === 0) {
            vscode.window.showErrorMessage('No Git repositories found in this workspace.');
            return;
        }

        // 2. Select repository (take first or quickpick if several)
        let repo = repositories[0];
        if (repositories.length > 1) {
            const repoItems: RepoPickItem[] = repositories.map((r: any) => ({
                label: vscode.workspace.asRelativePath(r.rootUri) || r.rootUri.fsPath,
                description: r.rootUri.fsPath,
                repo: r,
            }));
            const repoPick = await vscode.window.showQuickPick<RepoPickItem>(repoItems, {
                placeHolder: 'Select a Git repository for the commit',
            });
            if (!repoPick) {
                return;
            }
            repo = repoPick.repo;
        }

        // 3. Get credited guests
        const credited = ledger.getCreditedGuests();
        if (credited.length === 0) {
            vscode.window.showInformationMessage('No guests have accepted suggestions to credit yet.');
            return;
        }

        // 4. QuickPick listing credited guests with accepted counts (can untick)
        const items: GuestPickItem[] = credited.map((g) => ({
            label: g.name,
            description: `${g.count} accepted suggestion${g.count === 1 ? '' : 's'}`,
            picked: true,
            guest: g,
        }));

        const selected = await vscode.window.showQuickPick<GuestPickItem>(items, {
            canPickMany: true,
            placeHolder: 'Select contributors to credit (uncheck to exclude)',
        });

        if (!selected || selected.length === 0) {
            return;
        }

        // 5. Gather trailers with optional custom email
        const trailers: string[] = [];
        for (const item of selected) {
            const guestName = item.guest.name;
            const defaultEmail = `${slugify(guestName)}@parallel.invalid`;

            const emailInput = await vscode.window.showInputBox({
                prompt: `Email or GitHub noreply address for ${guestName}`,
                placeHolder: defaultEmail,
                value: defaultEmail,
            });

            const email = (emailInput && emailInput.trim()) ? emailInput.trim() : defaultEmail;
            const trailer = `Co-authored-by: ${guestName} <${email}>`;
            trailers.push(trailer);
            logSafety(`Credit applied: ${trailer}`);
        }

        // 6. Prefill repository inputBox
        const currentVal = repo.inputBox.value.trim();
        const trailerBlock = trailers.join('\n');
        if (currentVal) {
            repo.inputBox.value = `${currentVal}\n\n${trailerBlock}\n`;
        } else {
            repo.inputBox.value = `Implement shared changes\n\n${trailerBlock}\n`;
        }

        vscode.commands.executeCommand('workbench.view.scm');
        vscode.window.showInformationMessage('Co-author trailers added to commit message. Review and commit when ready.');
    });

    context.subscriptions.push(commitWithCredit);
}
