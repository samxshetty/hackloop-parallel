import * as vscode from 'vscode';

// Represents a participant received from the server
export interface Peer {
    name: string;
    role: string;
    canEdit?: boolean;
}

/**
 * TreeDataProvider that displays the list of session participants in the sidebar.
 */
export class ParticipantsProvider implements vscode.TreeDataProvider<Peer> {
    // Event emitter used to notify VS Code when the participant list changes
    private _onDidChangeTreeData: vscode.EventEmitter<Peer | undefined | null | void> =
        new vscode.EventEmitter<Peer | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Peer | undefined | null | void> =
        this._onDidChangeTreeData.event;

    // In-memory list of current participants
    private peers: Peer[] = [];

    /**
     * Update the participant list and refresh the tree view.
     */
    public setPeers(peers: Peer[]): void {
        this.peers = peers;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Return the visual representation for each participant row in the tree view.
     */
    public getTreeItem(element: Peer): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);

        // Label is the participant's name, description is their role
        item.description = element.role;

        // Use a full star for superhost/host, and a person icon for guests
        if (element.role === 'superhost' || element.role === 'host') {
            item.iconPath = new vscode.ThemeIcon('star-full');
        } else {
            item.iconPath = new vscode.ThemeIcon('person');
        }

        // Clicking on a participant triggers the jumpToPerson command
        item.command = {
            command: 'parallel.jumpToPerson',
            title: 'Jump to Person',
            arguments: [element.name],
        };

        return item;
    }

    /**
     * Return top-level participants when root is requested, or empty array for children.
     */
    public getChildren(element?: Peer): vscode.ProviderResult<Peer[]> {
        if (!element) {
            return this.peers;
        }
        return [];
    }
}
