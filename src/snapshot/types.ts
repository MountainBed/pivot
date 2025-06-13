// Types for snapshot management in the Pivot extension

export interface CursorPosition {
  line: number;
  character: number;
}

export interface TabSnapshot {
  uri: string;
  cursor?: CursorPosition;
  isActive: boolean;
  isPinned: boolean;
  isDirty: boolean;
}

export interface TabGroupSnapshot {
  groupIndex: number;
  viewColumn: number;
  isActive: boolean;
  tabs: TabSnapshot[];
  size: number;
  hasActiveTab: boolean;
}

export interface Snapshot {
  name: string;
  timestamp: number;
  tabGroups: TabGroupSnapshot[];
  activeFile?: string;
  activeGroupIndex: number;
  totalGroups: number;
  openFiles: TabSnapshot[]; // for legacy support
} 