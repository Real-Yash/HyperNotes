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

  // ---- v2 migrations (idempotent) ----
  const taskCols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(tasks)`);
  const colNames = taskCols.map(c => c.name);
  if (!colNames.includes('reminderAt')) {
    await db.execAsync(`ALTER TABLE tasks ADD COLUMN reminderAt INTEGER`);
  }
  if (!colNames.includes('dueAt')) {
    await db.execAsync(`ALTER TABLE tasks ADD COLUMN dueAt INTEGER`);
  }
  if (!colNames.includes('recurrence')) {
    await db.execAsync(`ALTER TABLE tasks ADD COLUMN recurrence TEXT`);
  }
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tasks_dueAt ON tasks(dueAt)`);

  // ---- FTS5 full-text search over tasks ----
  await db.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(title, notes, content="");
    CREATE TRIGGER IF NOT EXISTS tasks_fts_ai AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.id, new.title, coalesce(new.notes, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS tasks_fts_ad AFTER DELETE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, notes)
      VALUES ('delete', old.id, old.title, coalesce(old.notes, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS tasks_fts_au AFTER UPDATE ON tasks BEGIN
      INSERT INTO tasks_fts(tasks_fts, rowid, title, notes)
      VALUES ('delete', old.id, old.title, coalesce(old.notes, ''));
      INSERT INTO tasks_fts(rowid, title, notes)
      VALUES (new.id, new.title, coalesce(new.notes, ''));
    END;
  `);

  // One-time FTS backfill, tracked with PRAGMA user_version.
  const uv = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((uv?.user_version ?? 0) < 2) {
    await db.execAsync(`INSERT INTO tasks_fts(rowid, title, notes) SELECT id, title, coalesce(notes, '') FROM tasks`);
    await db.execAsync('PRAGMA user_version = 2');
  }
}

export interface Page {
  id?: number;
  name: string;
  createdAt: Date | number;
  isDeleted: 0 | 1;
}

export type Recurrence = 'daily' | 'weekly' | 'monthly';

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
  dueAt?: number | null;
  recurrence?: Recurrence | null;
}

export interface TaskWithPage extends Task {
  pageName: string;
}

function addInterval(ts: number, recurrence: Recurrence): number {
  const d = new Date(ts);
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

async function log(action: string, details: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO history (action, details, timestamp) VALUES (?, ?, ?)', [action, details, Date.now()]);
}

function escapeFts(query: string): string {
  return query
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

export const db = {
  async getPageById(id: number): Promise<Page | null> {
    await initDb();
    const d = await getDb();
    return (await d.getFirstAsync<any>('SELECT * FROM pages WHERE id = ?', [id])) ?? null;
  },
  async getPages(deleted: boolean): Promise<Page[]> {
    await initDb();
    const d = await getDb();
    const v = deleted ? 1 : 0;
    return d.getAllAsync<any>('SELECT * FROM pages WHERE isDeleted = ? ORDER BY createdAt DESC', [v]);
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
    return d.getAllAsync<any>('SELECT * FROM tasks WHERE pageId = ? AND isDeleted = 0 ORDER BY completed ASC, dueAt IS NULL, dueAt ASC, createdAt DESC', [pageId]);
  },
  async getDeletedTasks(): Promise<Task[]> {
    await initDb();
    const d = await getDb();
    return d.getAllAsync<any>('SELECT * FROM tasks WHERE isDeleted = 1 ORDER BY createdAt DESC');
  },

  /** Cross-page due lists. `view`: 'today' = due today or overdue; 'upcoming' = next 7 days. */
  async getDueTasks(view: 'today' | 'upcoming'): Promise<TaskWithPage[]> {
    await initDb();
    const d = await getDb();
    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const end = endOfToday.getTime();
    if (view === 'today') {
      return d.getAllAsync<any>(
        `SELECT t.*, p.name AS pageName FROM tasks t JOIN pages p ON p.id = t.pageId
         WHERE t.isDeleted = 0 AND t.completed = 0 AND t.dueAt IS NOT NULL AND t.dueAt <= ?
         ORDER BY t.dueAt ASC`,
        [end],
      );
    }
    const week = new Date(end);
    week.setDate(week.getDate() + 7);
    return d.getAllAsync<any>(
      `SELECT t.*, p.name AS pageName FROM tasks t JOIN pages p ON p.id = t.pageId
       WHERE t.isDeleted = 0 AND t.completed = 0 AND t.dueAt IS NOT NULL AND t.dueAt > ? AND t.dueAt <= ?
       ORDER BY t.dueAt ASC`,
      [end, week.getTime()],
    );
  },

  /** Full-text search across pages' tasks (titles + notes), best match first. */
  async searchTasks(query: string, limit = 50): Promise<TaskWithPage[]> {
    await initDb();
    const q = escapeFts(query);
    if (!q) return [];
    const d = await getDb();
    return d.getAllAsync<any>(
      `SELECT t.*, p.name AS pageName
       FROM tasks_fts JOIN tasks t ON t.id = tasks_fts.rowid
       JOIN pages p ON p.id = t.pageId
       WHERE tasks_fts MATCH ? AND t.isDeleted = 0 AND p.isDeleted = 0
       ORDER BY rank LIMIT ?`,
      [q, limit],
    );
  },

  async searchPages(query: string): Promise<Page[]> {
    await initDb();
    const d = await getDb();
    const like = `%${query.trim()}%`;
    return d.getAllAsync<any>('SELECT * FROM pages WHERE isDeleted = 0 AND name LIKE ? ORDER BY createdAt DESC', [like]);
  },

  async createTask(pageId: number, title: string) {
    await initDb();
    const d = await getDb();
    const t = title.trim();
    if (!t) return;
    await d.runAsync('INSERT INTO tasks (pageId, title, notes, completed, createdAt, isDeleted) VALUES (?, ?, "", 0, ?, 0)', [pageId, t, Date.now()]);
    await log('add_task', 'Added task: ' + t);
  },

  /** Toggle completion. Completing a recurring task spawns the next occurrence. */
  async toggleTask(id: number) {
    const d = await getDb();
    const row = await d.getFirstAsync<any>(
      'SELECT completed, pageId, title, notes, recurrence, dueAt FROM tasks WHERE id = ?',
      [id],
    );
    if (!row) return;
    const now = row.completed === 1 ? 0 : 1;
    if (now === 1) {
      await d.runAsync('UPDATE tasks SET completed = 1, completedAt = ?, reminderAt = NULL WHERE id = ?', [Date.now(), id]);
      if (row.recurrence) {
        const base = row.dueAt && row.dueAt > Date.now() ? row.dueAt : Date.now();
        const next = addInterval(base, row.recurrence as Recurrence);
        await d.runAsync(
          'INSERT INTO tasks (pageId, title, notes, completed, createdAt, isDeleted, dueAt, recurrence) VALUES (?, ?, ?, 0, ?, 0, ?, ?)',
          [row.pageId, row.title, row.notes ?? '', Date.now(), next, row.recurrence],
        );
        await log('recur_spawn', `Next ${row.recurrence} occurrence of "${row.title}" due ${new Date(next).toISOString()}`);
      }
    } else {
      await d.runAsync('UPDATE tasks SET completed = 0, completedAt = NULL WHERE id = ?', [id,]);
    }
    await log('toggle_task', (now === 1 ? 'Completed' : 'Uncompleted') + ' task id:' + id);
  },

  async deleteTask(id: number) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET isDeleted = 1, reminderAt = NULL WHERE id = ?', [id]);
    await log('delete_task', 'Deleted task id:' + id);
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
  async setReminder(id: number, reminderAt: number | null) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET reminderAt = ? WHERE id = ?', [reminderAt, id]);
    await log('set_reminder', reminderAt ? `Reminder set for task id:${id} at ${new Date(reminderAt).toISOString()}` : `Reminder cleared for task id:${id}`);
  },
  async setDue(id: number, dueAt: number | null) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET dueAt = ? WHERE id = ?', [dueAt, id]);
    await log('set_due', dueAt ? `Due set for task id:${id} at ${new Date(dueAt).toISOString()}` : `Due cleared for task id:${id}`);
  },
  async setRecurrence(id: number, recurrence: Recurrence | null) {
    const d = await getDb();
    await d.runAsync('UPDATE tasks SET recurrence = ? WHERE id = ?', [recurrence, id]);
    await log('set_recurrence', recurrence ? `Recurrence ${recurrence} set for task id:${id}` : `Recurrence cleared for task id:${id}`);
  },
};
