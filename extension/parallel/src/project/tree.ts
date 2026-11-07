import * as vscode from 'vscode';
import * as path from 'path';

export interface ManifestEntry {
  path: string;
  size?: number;
}

export class ProjectFileItem extends vscode.TreeItem {
  public children: ProjectFileItem[] = [];

  constructor(
    public readonly label: string,
    public readonly relPath: string,
    public readonly isDirectory: boolean,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);

    this.tooltip = relPath;
    if (isDirectory) {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'folder';
    } else {
      this.iconPath = this.getFileIcon(label);
      this.contextValue = 'file';
      this.command = {
        command: 'parallel.openProjectFile',
        title: 'Open File',
        arguments: [relPath],
      };
    }
  }

  private getFileIcon(fileName: string): vscode.ThemeIcon {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
      case '.py':
      case '.java':
      case '.c':
      case '.cpp':
      case '.rs':
      case '.go':
      case '.html':
      case '.css':
      case '.scss':
        return new vscode.ThemeIcon('file-code');
      case '.json':
      case '.yaml':
      case '.yml':
      case '.xml':
      case '.toml':
        return new vscode.ThemeIcon('file-code');
      case '.md':
      case '.txt':
      case '.rst':
        return new vscode.ThemeIcon('file-text');
      default:
        return new vscode.ThemeIcon('file');
    }
  }
}

/**
 * TreeDataProvider that renders the shared project files tree.
 * Folders first, alphabetical order, appropriate icons, lazy expansion.
 */
export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ProjectFileItem | undefined | null | void> =
    new vscode.EventEmitter<ProjectFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProjectFileItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private rootItems: ProjectFileItem[] = [];

  public getTreeItem(element: ProjectFileItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: ProjectFileItem): vscode.ProviderResult<ProjectFileItem[]> {
    if (!element) {
      return this.rootItems;
    }
    return element.children;
  }

  /**
   * Updates the project tree from the manifest array.
   */
  public setManifest(manifest: ManifestEntry[]): void {
    if (!Array.isArray(manifest) || manifest.length === 0) {
      this.rootItems = [];
      this._onDidChangeTreeData.fire();
      return;
    }

    // Build hierarchy
    interface TreeNode {
      label: string;
      relPath: string;
      isDirectory: boolean;
      childrenMap: Map<string, TreeNode>;
    }

    const rootMap = new Map<string, TreeNode>();

    for (const entry of manifest) {
      if (!entry || typeof entry.path !== 'string') continue;
      const cleanPath = entry.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = cleanPath.split('/').filter(Boolean);
      if (parts.length === 0) continue;

      let currentMap = rootMap;
      let curPathAcc = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        curPathAcc = curPathAcc ? `${curPathAcc}/${part}` : part;
        const isDir = i < parts.length - 1;

        let node = currentMap.get(part);
        if (!node) {
          node = {
            label: part,
            relPath: curPathAcc,
            isDirectory: isDir,
            childrenMap: new Map(),
          };
          currentMap.set(part, node);
        } else if (isDir && !node.isDirectory) {
          node.isDirectory = true;
        }
        currentMap = node.childrenMap;
      }
    }

    function convertNode(node: TreeNode): ProjectFileItem {
      const state = node.isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      const item = new ProjectFileItem(node.label, node.relPath, node.isDirectory, state);
      if (node.isDirectory) {
        const childNodes = Array.from(node.childrenMap.values());
        // Sort: folders first, then files; alphabetical within each group
        childNodes.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
        });
        item.children = childNodes.map(convertNode);
      }
      return item;
    }

    const topNodes = Array.from(rootMap.values());
    topNodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
    });

    this.rootItems = topNodes.map(convertNode);
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clears the tree view.
   */
  public clear(): void {
    this.rootItems = [];
    this._onDidChangeTreeData.fire();
  }
}
