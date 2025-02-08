import Dexie, { Table } from 'dexie';

export interface Page {
  id?: number;
  name: string;
  createdAt: Date;
  isDeleted: 0 | 1;
}

export interface Task {
  id?: number;
  pageId: number;
  title: string;
  notes?: string;
  completed: 0 | 1;
  completedAt?: Date;
  createdAt: Date;
  isDeleted: 0 | 1;
}

export interface HistoryEntry {
  id?: number;
  action: string;
  details: string;
  timestamp: Date;
}

class HyperNotesDB extends Dexie {
  pages!: Table<Page>;
  tasks!: Table<Task>;
  history!: Table<HistoryEntry>;

  constructor() {
    super('HyperNotesDB');
    this.version(1).stores({
      pages: '++id, name, createdAt, isDeleted',
      tasks: '++id, pageId, title, completed, completedAt, createdAt, isDeleted',
      history: '++id, action, timestamp'
    });
  }

  async addHistoryEntry(action: string, details: string) {
    await this.history.add({
      action,
      details,
      timestamp: new Date()
    });
  }
}

export const db = new HyperNotesDB();