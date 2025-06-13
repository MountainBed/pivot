import * as vscode from 'vscode';
import { Snapshot } from '../snapshot/types';
import { saveSnapshot, deleteAllSnapshots, listSnapshots, restoreSnapshot, restoreSpecificSnapshot } from '../snapshot/manager';
import { SnapshotTreeProvider, SnapshotItem } from '../snapshot/treeProvider';

export function registerCommands(
	context: vscode.ExtensionContext,
	snapshotTreeProvider: SnapshotTreeProvider,
	statusBarItem: vscode.StatusBarItem
): vscode.Disposable[] {
	const saveSnapshotCmd = vscode.commands.registerCommand('pivot.saveSnapshot', async () => {
		await saveSnapshot(context, snapshotTreeProvider, statusBarItem);
	});

	const deleteAllSnapshotsCmd = vscode.commands.registerCommand('pivot.deleteAllSnapshots', async () => {
		await deleteAllSnapshots(context, snapshotTreeProvider);
	});

	const listSnapshotsCmd = vscode.commands.registerCommand('pivot.listSnapshots', async () => {
		await listSnapshots(context);
	});

	const restoreSnapshotCmd = vscode.commands.registerCommand('pivot.restoreSnapshot', async () => {
		await restoreSnapshot(context);
	});

	const restoreSpecificSnapshotCmd = vscode.commands.registerCommand('pivot.restoreSpecificSnapshot', async (snapshotOrItem: Snapshot | SnapshotItem) => {
		function isSnapshotItem(obj: any): obj is SnapshotItem {
			return obj && typeof obj === 'object' && 'snapshotData' in obj;
		}
		let snapshot: Snapshot;
		if (isSnapshotItem(snapshotOrItem)) {
			snapshot = snapshotOrItem.snapshotData!;
		} else {
			snapshot = snapshotOrItem as Snapshot;
		}
		if (!snapshot) {
			return;
		}
		await restoreSpecificSnapshot(snapshot);
	});

	return [
		saveSnapshotCmd,
		deleteAllSnapshotsCmd,
		listSnapshotsCmd,
		restoreSnapshotCmd,
		restoreSpecificSnapshotCmd
	];
} 