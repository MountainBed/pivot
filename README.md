# Pivot

A VS Code extension that allows you to take point-in-time snapshots of your workspace, so you can pivot to other tasks and restore your previous state later.

## What it does

Pivot captures the current state of your VS Code workspace, including:

- All open files and tabs
- Tab groups and their layout
- Cursor positions
- Active file and tab group

This is perfect for when you need to switch contexts but want to return to exactly where you left off.

## Commands

### Save Snapshot

- **Command**: `Pivot: Save Snapshot`
- Captures the current workspace state and saves it

### Restore Snapshot

- **Command**: `Pivot: Restore Snapshot`
- Restores the a snapshot, reopening all files and restoring the layout

### List Snapshots

- **Command**: `Pivot: List Snapshots`
- Shows all saved snapshots in the output panel

### Delete All Snapshots

- **Command**: `Pivot: Delete All Snapshots`
- Removes all saved snapshots

## Views

### Pivot Snapshots View

Located in the Explorer panel, this view shows all your saved snapshots. You can:

- Click the restore button (✓) next to any snapshot to restore it
- See when each snapshot was created

## Usage

1. **Save your current state**: Use `Pivot: Save Snapshot` when you want to preserve your current workspace
2. **Switch to other work**: Open new files, close tabs, or work on different projects
3. **Restore when ready**: Use `Pivot: Restore Snapshot` or click the restore button in the Pivot Snapshots view to return to your previous state

Perfect for developers who frequently context-switch between different features, bug fixes, or projects!
