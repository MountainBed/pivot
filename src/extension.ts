import * as vscode from 'vscode';

let snapshotTreeProvider: SnapshotTreeProvider;

export function activate(context: vscode.ExtensionContext) {
	// Create status bar item for less intrusive notifications
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	context.subscriptions.push(statusBarItem);

	const saveSnapshot = vscode.commands.registerCommand('pivot.saveSnapshot', async () => {
		const snapshotData = context.workspaceState.get<{ snapshots: any[] }>('pivot.snapshots', { snapshots: [] });

		const newSnapshotNumber = snapshotData.snapshots.length + 1;
		const defaultName = `Snapshot ${newSnapshotNumber}`;
		const newSnapshotName = await vscode.window.showInputBox({
			prompt: 'Name your snapshot',
			value: defaultName,
			placeHolder: 'Enter a name for this snapshot'
		}) || defaultName;

		// Capture tab groups and their layout with additional metadata
		const tabGroups = vscode.window.tabGroups.all.map((group, groupIndex) => {
			const tabs = group.tabs
				.filter(tab => tab.input && (tab.input as any).uri)
				.map(tab => {
					const uri = (tab.input as any).uri.toString();
					const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
					let cursor = undefined;
					if (editor) {
						const pos = editor.selection.active;
						cursor = { line: pos.line, character: pos.character };
					}
					return {
						uri,
						cursor,
						isActive: tab.isActive,
						isPinned: tab.isPinned,
						isDirty: tab.isDirty
					};
				});

			return {
				groupIndex,
				viewColumn: group.viewColumn,
				isActive: group.isActive,
				tabs,
				// Additional metadata for layout hints
				size: group.tabs.length,
				hasActiveTab: group.tabs.some(tab => tab.isActive)
			};
		});

		const activeEditor = vscode.window.activeTextEditor;
		const activeFile = activeEditor ? activeEditor.document.uri.toString() : undefined;
		const activeGroupIndex = activeEditor ? vscode.window.tabGroups.all.findIndex(group => group.isActive) : -1;

		const newSnapshot = {
			name: newSnapshotName,
			timestamp: Date.now(),
			tabGroups,
			activeFile,
			activeGroupIndex,
			totalGroups: tabGroups.length,
			// Keep legacy openFiles for backward compatibility
			openFiles: tabGroups.flatMap(group => group.tabs)
		};

		snapshotData.snapshots.push(newSnapshot);

		await context.workspaceState.update('pivot.snapshots', snapshotData);
		
		// Show brief status bar message instead of popup
		statusBarItem.text = `📸 Saved "${newSnapshotName}"`;
		statusBarItem.show();
		setTimeout(() => statusBarItem.hide(), 3000); // Hide after 3 seconds
		
		snapshotTreeProvider.refresh();
	});

	const deleteAllSnapshots = vscode.commands.registerCommand('pivot.deleteAllSnapshots', async () => {
		await context.workspaceState.update('pivot.snapshots', { snapshots: [] });
		vscode.window.showInformationMessage('All pivot snapshots have been deleted.');
		snapshotTreeProvider.refresh();
	});

	const listSnapshots = vscode.commands.registerCommand('pivot.listSnapshots', async () => {
		const snapshotData = context.workspaceState.get<{ snapshots: any[] }>('pivot.snapshots', { snapshots: [] });
		if (!snapshotData.snapshots.length) {
			vscode.window.showInformationMessage('No pivot snapshots found.');
			return;
		}

		const items = snapshotData.snapshots.map(snap => ({
			label: snap.name,
			description: new Date(snap.timestamp).toLocaleString(),
			detail: snap.activeFile
		}));

		await vscode.window.showQuickPick(items, {
			placeHolder: 'Saved Pivot Snapshots',
			canPickMany: false
		});
	});

	const restoreSnapshot = vscode.commands.registerCommand('pivot.restoreSnapshot', async () => {
		const snapshotData = context.workspaceState.get<{ snapshots: any[] }>('pivot.snapshots', { snapshots: [] });
		if (!snapshotData.snapshots.length) {
			vscode.window.showInformationMessage('No pivot snapshots found to restore.');
			return;
		}

		const items = snapshotData.snapshots.map((snap, index) => ({
			label: snap.name,
			description: new Date(snap.timestamp).toLocaleString(),
			detail: `${snap.tabGroups ? snap.tabGroups.reduce((total: number, group: any) => total + group.tabs.length, 0) : snap.openFiles?.length || 0} files`,
			index: index
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a snapshot to restore',
			canPickMany: false
		});

		if (!selected) {
			return; // User cancelled
		}

		const snapshot = snapshotData.snapshots[selected.index];
		await restoreSnapshotLayout(snapshot);
	});

	const restoreSpecificSnapshot = vscode.commands.registerCommand('pivot.restoreSpecificSnapshot', async (snapshotOrItem: any) => {
		// Handle both cases: direct snapshot data or SnapshotItem from context menu
		let snapshot: any;
		if (snapshotOrItem && snapshotOrItem.snapshotData) {
			// Called from context menu - snapshotOrItem is a SnapshotItem
			snapshot = snapshotOrItem.snapshotData;
		} else {
			// Called directly - snapshotOrItem is the snapshot data
			snapshot = snapshotOrItem;
		}

		if (!snapshot) {
			return;
		}

		await restoreSnapshotLayout(snapshot);
	});

	// Helper function to restore snapshot layout
	async function restoreSnapshotLayout(snapshot: any) {
		// Close all current tabs
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');

		// Collect all files from the snapshot (works with both new and legacy formats)
		let allFiles: any[] = [];
		
		if (snapshot.tabGroups && snapshot.tabGroups.length > 0) {
			// New format - flatten all tabs from all groups
			allFiles = snapshot.tabGroups.flatMap((group: any) => group.tabs);
		} else {
			// Legacy format
			allFiles = snapshot.openFiles || [];
		}

		// Open all files
		const openedEditors: vscode.TextEditor[] = [];
		for (const file of allFiles) {
			try {
				const uri = vscode.Uri.parse(file.uri);
				const document = await vscode.workspace.openTextDocument(uri);
				const editor = await vscode.window.showTextDocument(document, { preview: false });
				
				// Set cursor position if available
				if (file.cursor && editor) {
					const position = new vscode.Position(file.cursor.line, file.cursor.character);
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(new vscode.Range(position, position));
				}
				
				openedEditors.push(editor);
			} catch (error) {
				vscode.window.showWarningMessage(`Could not open file: ${file.uri}`);
			}
		}

		// Set the active file if specified
		if (snapshot.activeFile) {
			try {
				const activeUri = vscode.Uri.parse(snapshot.activeFile);
				const activeDocument = await vscode.workspace.openTextDocument(activeUri);
				await vscode.window.showTextDocument(activeDocument);
			} catch (error) {
				// Active file couldn't be opened, that's ok
			}
		}

		vscode.window.showInformationMessage(`✅ Restored "${snapshot.name}" (${allFiles.length} files)`);
	}

	snapshotTreeProvider = new SnapshotTreeProvider(context);
	vscode.window.registerTreeDataProvider('pivotSnapshotsView', snapshotTreeProvider);

	context.subscriptions.push(saveSnapshot);
	context.subscriptions.push(deleteAllSnapshots);
	context.subscriptions.push(listSnapshots);
	context.subscriptions.push(restoreSnapshot);
	context.subscriptions.push(restoreSpecificSnapshot);
}

export function deactivate() {}

class SnapshotTreeProvider implements vscode.TreeDataProvider<SnapshotItem> {
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
		const snapshotData = this.context.workspaceState.get<{ snapshots: any[] }>('pivot.snapshots', { snapshots: [] });

		if (!element) {
			// Top-level: Snapshots
			return snapshotData.snapshots.map(snap => {
				if (snap.tabGroups && snap.tabGroups.length > 0) {
					// New format with tab groups
					const children = snap.tabGroups.map((group: any, index: number) => {
						const groupName = `Tab Group ${index + 1}`;
						const groupFiles = group.tabs.map((tab: any) =>
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
					const totalFiles = snap.tabGroups.reduce((total: number, group: any) => total + group.tabs.length, 0);
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
					const children = (snap.openFiles || []).map((f: any) =>
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

class SnapshotItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string,
		public readonly detail?: string,
		public readonly children: SnapshotItem[] = [],
		public readonly snapshotData?: any
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
