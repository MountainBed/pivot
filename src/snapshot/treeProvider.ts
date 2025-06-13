import * as vscode from 'vscode';
import { Snapshot, TabGroupSnapshot, TabSnapshot } from './types';

export class SnapshotTreeProvider implements vscode.TreeDataProvider<SnapshotItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<SnapshotItem | undefined | void> = new vscode.EventEmitter<SnapshotItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<SnapshotItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SnapshotItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SnapshotItem): Promise<SnapshotItem[]> {
		const snapshotData = this.context.workspaceState.get<{ snapshots: Snapshot[] }>('pivot.snapshots', { snapshots: [] });

		if (!element) {
			// Top-level: Snapshots
			return snapshotData.snapshots.map(snap => {
				if (snap.tabGroups && snap.tabGroups.length > 0) {
					// New format with tab groups
					const children = snap.tabGroups.map((group: TabGroupSnapshot, index: number) => {
						const groupName = `Tab Group ${index + 1}`;
						const groupFiles = group.tabs.map((tab: TabSnapshot) =>
							new SnapshotItem(
								vscode.workspace.asRelativePath(vscode.Uri.parse(tab.uri)),
								tab.cursor ? `Line ${tab.cursor.line + 1}, Char ${tab.cursor.character + 1}` : '',
								tab.isActive ? 'Active tab' : undefined,
								[],
								snap
							)
						);
						return new SnapshotItem(
							groupName,
							`${group.tabs.length} file(s)`,
							group.isActive ? 'Active tab group' : undefined,
							groupFiles,
							snap
						);
					});

					// Create description with layout info
					const totalFiles = snap.tabGroups.reduce((total: number, group: TabGroupSnapshot) => total + group.tabs.length, 0);
					const description = new Date(snap.timestamp).toLocaleString();
					const detail = `${totalFiles} files in ${snap.tabGroups.length} tab group(s)`;

					return new SnapshotItem(
						snap.name,
						description,
						detail,
						children,
						snap
					);
				} else {
					// Legacy format - backward compatibility
					const children = (snap.openFiles || []).map((f: TabSnapshot) =>
						new SnapshotItem(
							vscode.workspace.asRelativePath(vscode.Uri.parse(f.uri)),
							f.cursor ? `Line ${f.cursor.line + 1}, Char ${f.cursor.character + 1}` : '',
							undefined,
							[],
							snap
						)
					);

					return new SnapshotItem(
						snap.name,
						new Date(snap.timestamp).toLocaleString(),
						snap.activeFile,
						children,
						snap
					);
				}
			});
		} else {
			// If the element has children, return them; otherwise, return empty array
			return element.children;
		}
	}
}

export class SnapshotItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string,
		public readonly detail?: string,
		public readonly children: SnapshotItem[] = [],
		public readonly snapshotData?: Snapshot
	) {
		super(
			label,
			children.length > 0
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None
		);
		this.description = description;
		this.tooltip = detail;
		
		// Add restore command for top-level snapshot items
		if (snapshotData) {
			this.command = {
				command: 'pivot.restoreSpecificSnapshot',
				title: 'Restore Snapshot',
				arguments: [snapshotData]
			};
			this.contextValue = 'snapshot';
		}
	}
} 