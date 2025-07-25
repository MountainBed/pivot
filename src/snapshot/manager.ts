import * as vscode from 'vscode';
import { Snapshot, TabGroupSnapshot, TabSnapshot } from './types';

export async function saveSnapshot(context: vscode.ExtensionContext, snapshotTreeProvider: { refresh: () => void }, statusBarItem: vscode.StatusBarItem) {
	const snapshotData = context.workspaceState.get<{ snapshots: Snapshot[] }>('pivot.snapshots', { snapshots: [] });

	const newSnapshotNumber = snapshotData.snapshots.length + 1;
	const defaultName = `Snapshot ${newSnapshotNumber}`;
	const newSnapshotName = await vscode.window.showInputBox({
		prompt: 'Name your snapshot',
		value: defaultName,
		placeHolder: 'Enter a name for this snapshot'
	}) || defaultName;

	const tabGroups: TabGroupSnapshot[] = vscode.window.tabGroups.all.map((group, groupIndex) => {
		const tabs: TabSnapshot[] = group.tabs
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
			size: group.tabs.length,
			hasActiveTab: group.tabs.some(tab => tab.isActive)
		};
	});

	const activeEditor = vscode.window.activeTextEditor;
	const activeFile = activeEditor ? activeEditor.document.uri.toString() : undefined;
	const activeGroupIndex = activeEditor ? vscode.window.tabGroups.all.findIndex(group => group.isActive) : -1;

	const newSnapshot: Snapshot = {
		name: newSnapshotName,
		timestamp: Date.now(),
		tabGroups,
		activeFile,
		activeGroupIndex,
		totalGroups: tabGroups.length,
		openFiles: tabGroups.flatMap(group => group.tabs)
	};

	snapshotData.snapshots.push(newSnapshot);

	await context.workspaceState.update('pivot.snapshots', snapshotData);

	statusBarItem.text = `📸 Saved "${newSnapshotName}"`;
	statusBarItem.show();
	setTimeout(() => statusBarItem.hide(), 3000);

	snapshotTreeProvider.refresh();
}

export async function deleteAllSnapshots(context: vscode.ExtensionContext, snapshotTreeProvider: { refresh: () => void }) {
	await context.workspaceState.update('pivot.snapshots', { snapshots: [] });
	vscode.window.showInformationMessage('All pivot snapshots have been deleted.');
	snapshotTreeProvider.refresh();
}

export async function listSnapshots(context: vscode.ExtensionContext) {
	const snapshotData = context.workspaceState.get<{ snapshots: Snapshot[] }>('pivot.snapshots', { snapshots: [] });
	if (!snapshotData.snapshots.length) {
		vscode.window.showInformationMessage('No pivot snapshots found.');
		return;
	}

	const items = snapshotData.snapshots.map(snap => ({
		label: snap.name,
		description: new Date(snap.timestamp).toLocaleString(),
		detail: (snap.openFiles && snap.openFiles.length > 0)
			? snap.openFiles.map(f => {
				try {
					return vscode.workspace.asRelativePath(vscode.Uri.parse(f.uri), false).split(/[\\\/]/).pop();
				} catch {
					return f.uri;
				}
			}).join(', ')
			: ''
	}));

	await vscode.window.showQuickPick(items, {
		placeHolder: 'Saved Pivot Snapshots',
		canPickMany: false
	});
}

export async function restoreSnapshot(context: vscode.ExtensionContext) {
	const snapshotData = context.workspaceState.get<{ snapshots: Snapshot[] }>('pivot.snapshots', { snapshots: [] });
	if (!snapshotData.snapshots.length) {
		vscode.window.showInformationMessage('No pivot snapshots found to restore.');
		return;
	}

	const items = snapshotData.snapshots.map((snap, index) => ({
		label: snap.name,
		description: new Date(snap.timestamp).toLocaleString(),
		detail: `${snap.tabGroups ? snap.tabGroups.reduce((total: number, group: TabGroupSnapshot) => total + group.tabs.length, 0) : snap.openFiles?.length || 0} files`,
		index: index
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a snapshot to restore',
		canPickMany: false
	});

	if (!selected) {
		return;
	}

	const snapshot = snapshotData.snapshots[selected.index];
	await restoreSnapshotLayout(snapshot);
}

export async function restoreSpecificSnapshot(snapshot: Snapshot) {
	await restoreSnapshotLayout(snapshot);
}

export async function restoreSnapshotLayout(snapshot: Snapshot) {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');

	// If we have tab groups, restore them properly
	if (snapshot.tabGroups && snapshot.tabGroups.length > 0) {
		await restoreTabGroups(snapshot.tabGroups);
	} else {
		// Fallback to old format
		const allFiles = snapshot.openFiles || [];
		const openedEditors: vscode.TextEditor[] = [];
		
		for (const file of allFiles) {
			try {
				const uri = vscode.Uri.parse(file.uri);
				const document = await vscode.workspace.openTextDocument(uri);
				const editor = await vscode.window.showTextDocument(document, { preview: false });

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
	}

	// Set active file if specified
	if (snapshot.activeFile) {
		try {
			const activeUri = vscode.Uri.parse(snapshot.activeFile);
			const activeDocument = await vscode.workspace.openTextDocument(activeUri);
			await vscode.window.showTextDocument(activeDocument);
		} catch (error) {
			// Active file couldn't be opened, that's ok
		}
	}

	const totalFiles = snapshot.tabGroups 
		? snapshot.tabGroups.reduce((total, group) => total + group.tabs.length, 0)
		: snapshot.openFiles?.length || 0;
	
	vscode.window.showInformationMessage(`✅ Restored "${snapshot.name}" (${totalFiles} files)`);
}

async function restoreTabGroups(tabGroups: TabGroupSnapshot[]) {
	// Sort groups by viewColumn to ensure proper order
	const sortedGroups = [...tabGroups].sort((a, b) => a.viewColumn - b.viewColumn);
	
	for (let i = 0; i < sortedGroups.length; i++) {
		const group = sortedGroups[i];
		
		// Open the first file in the group to create the tab group
		if (group.tabs.length > 0) {
			try {
				const firstFile = group.tabs[0];
				const uri = vscode.Uri.parse(firstFile.uri);
				const document = await vscode.workspace.openTextDocument(uri);
				
				// Use the saved viewColumn for proper positioning
				const editor = await vscode.window.showTextDocument(document, { 
					preview: false,
					viewColumn: group.viewColumn
				});

				// Restore cursor position for first file
				if (firstFile.cursor && editor) {
					const position = new vscode.Position(firstFile.cursor.line, firstFile.cursor.character);
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(new vscode.Range(position, position));
				}

				// Open remaining files in the same group
				for (let j = 1; j < group.tabs.length; j++) {
					const file = group.tabs[j];
					try {
						const fileUri = vscode.Uri.parse(file.uri);
						const fileDocument = await vscode.workspace.openTextDocument(fileUri);
						const fileEditor = await vscode.window.showTextDocument(fileDocument, { 
							preview: false,
							viewColumn: group.viewColumn // Use the group's viewColumn
						});

						// Restore cursor position
						if (file.cursor && fileEditor) {
							const position = new vscode.Position(file.cursor.line, file.cursor.character);
							fileEditor.selection = new vscode.Selection(position, position);
							fileEditor.revealRange(new vscode.Range(position, position));
						}
					} catch (error) {
						vscode.window.showWarningMessage(`Could not open file: ${file.uri}`);
					}
				}
			} catch (error) {
				vscode.window.showWarningMessage(`Could not open first file in group: ${group.tabs[0]?.uri}`);
			}
		}
	}
} 