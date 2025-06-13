import * as vscode from 'vscode';

import { SnapshotTreeProvider } from './snapshot/treeProvider';
import { registerCommands } from './commands/registerCommands';

let snapshotTreeProvider: SnapshotTreeProvider;

export function activate(context: vscode.ExtensionContext) {
	// Create status bar item for less intrusive notifications
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	context.subscriptions.push(statusBarItem);

	snapshotTreeProvider = new SnapshotTreeProvider(context);
	vscode.window.registerTreeDataProvider('pivotSnapshotsView', snapshotTreeProvider);

	const disposables = registerCommands(context, snapshotTreeProvider, statusBarItem);
	disposables.forEach(d => context.subscriptions.push(d));
}

export function deactivate() {}
