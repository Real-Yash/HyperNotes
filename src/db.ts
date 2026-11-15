import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('hypernotes.db');
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageId INTEGER NOT NULL,
      title TEXT NOT NULL,
      notes TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      completedAt INTEGER,
      createdAt INTEGER NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);
  // Migration: add reminderAt to tasks if missing (existing installs).
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(tasks)`);
  if (!cols.some(c => c.name === 'reminderAt')) {
    await db.execAsync(`ALTER TABLE tasks ADD COLUMN reminderAt INTEGER`);
  }
}

export interface Page {
  id?: number;
  name: string;
  createdAt: Date | number;
  isDeleted: 0 | 1;
}

export interface Task {
  id?: number;
  pageId: number;
  title: string;
  notes?: string;
  completed: 0 | 1;
  completedAt?: Date | number | null;
  createdAt: Date | number;
  isDeleted: 0 | 1;
  reminderAt?: number | null;
}

function toDate(v: Date | number): number {
  return v instanceof Date ? v.getTime() : Number(v);
}

async function log(action: string, details: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO history (action, details, timestamp) VALUES (?, ?, ?)', [action, details, Date.now()]);
}

export const db = {
  async getPages(deleted: boolean): Promise<Page[]> {
    await initDb();
    const d = await getDb();
    const v = deleted ? 1 : 0;
    const rows = await d.getAllAsync<any>('SELECT * FROM pages WHERE isDeleted = ? ORDER BY createdAt DESC', [v]);
    return rows.map(r => ({ ...r, createdAt: r.createdAt }));
  },
  async createPage(name: string) {
    await initDb();
    const d = await getDb();
    const n = name.trim();
    if (!n) return;
    await d.runAsync('INSERT INTO pages (name, createdAt, isDeleted) VALUES (?, ?, 0)', [n, Date.now()]);
    await log('create_page', 'Created page: ' + n);
  },
  async deletePage(id: number) {
    const d = await getDb();
    await d.runAsync('UPDATE pages SET isDeleted = 1 WHERE id = ?', [id]);
    await log('delete_page', 'Deleted page id:' + id);
  },
  async restorePage(id: number) {
    const d = await getDb();
    await d.runAsync('UPDATE pages SET isDeleted = 0 WHERE id = ?', [id]);
    await log('restore_page', 'Restored page id:' + id);
  },
  async getTasks(pageId: number): Promise<Task[]> {
    await initDb();
    const d = await getDb();
    const rows = await d.getAllAsync<any>('SELECT * FROM tasks WHERE pageId = ? AND isDeleted = 0 ORDER BY createdAt DESC', [pageId]);
    return rows;
  },
  async getDeletedTasks(): Promise<Task[]> {
    await initDb();
    const d = await getDb();
    return d.getAllAsync<any>('SELECT * FROM tasks WHERE isDeleted = 1 ORDER BY createdAt DESC');
  },
  async createTask(pageId: number, title: string) {
    await initDb();
    const d = await getDb();
    const t = title.trim();
    if (!t) return;
    await d.runAsync('INSERT INTO tasks (pageId, title, notes, completed, createdAt, isDeleted) VALUES (?, ?, "", 0, ?, 0)', [pageId, t, Date.now()]);
    await log('add_task', 'Added task: ' + t);
  },
  async toggleTask(id: number) {
    const d = await getDb();
    const row = await d.getFirstAsync<any>('SELECT completed FROM tasks WHERE id = ?', [id]);
    if (!row) return;
    const now = row.completed === 1 ? 0 : 1;
    // Completing a task clears its reminder; un-completing does not restore it.
    if (now === 1) {
      await d.runAsync('UPDATE tasks SET completed = ?, completedAt = ?, reminderAt = NULL WHERE id = ?', [now, Date.now(), id]);
    } else {
      await d.runAsync('UPDATE tasks SET completed = ?, completedAt = ? WHERE id = ?', [now, null, id]);
    }
    await log('toggle_task', (now === 1 ? 'Completed' : 'Uncompleted') + ' task id:' + id);
  },
  async deleteTask(id: number) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET isDeleted = 1, reminderAt = NULL WHERE id = ?', [id]);
    await log('delete_task', 'Deleted task id:' + id);
  },
  async setReminder(id: number, reminderAt: number | null) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET reminderAt = ? WHERE id = ?', [reminderAt, id]);
    await log('set_reminder', reminderAt ? `Reminder set for task id:${id} at ${new Date(reminderAt).toISOString()}` : `Reminder cleared for task id:${id}`);
  },
  async restoreTask(id: number) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET isDeleted = 0 WHERE id = ?', [id]);
    await log('restore_task', 'Restored task id:' + id);
  },
  async updateNotes(id: number, notes: string) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET notes = ? WHERE id = ?', [notes, id]);
    await log('update_notes', 'Updated notes for task id:' + id);
  },
};
