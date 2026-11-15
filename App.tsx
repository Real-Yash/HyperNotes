import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet, Alert, Pressable, useColorScheme, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { db, Folder, Task, TaskWithFolder, Recurrence, initDb } from './src/db';
import { themes, Theme, ThemeName } from './src/theme';
import { initNotifications, requestReminderPermission, scheduleTaskReminder, cancelTaskReminder } from './src/notifications';

// Register the foreground notification handler as early as possible.
initNotifications();

const RECUR_LABEL: Record<Recurrence, string> = { daily: 'D', weekly: 'W', monthly: 'M' };
const RECUR_NAME: Record<Recurrence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function fmtDue(ts: number): { label: string; overdue: boolean } {
  const day = startOfDay(ts);
  const today = startOfDay(Date.now());
  const diff = Math.round((day - today) / 86400000);
  const overdue = ts < Date.now() && diff <= 0;
  if (diff === 0) return { label: 'Today', overdue: false };
  if (diff === 1) return { label: 'Tomorrow', overdue: false };
  if (diff === -1) return { label: 'Yesterday', overdue: true };
  const d = new Date(ts);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return { label, overdue: diff < 0 };
}

function combineDateAndTime(datePart: Date, timePart: Date): Date {
  const d = new Date(datePart);
  d.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return d;
}

function tomorrowMorning9(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function IconBtn({ theme, label, onPress, active = true, accessibilityLabel }: {
  theme: Theme; label: string; onPress: () => void; active?: boolean; accessibilityLabel?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} hitSlop={8}
      style={({ pressed }) => [s.iconBtn, { opacity: pressed ? 0.5 : active ? 1 : 0.35 }]}>
      <Text style={s.iconBtnText}>{label}</Text>
    </Pressable>
  );
}

function MetaChip({ theme, label, tone = 'neutral' }: { theme: Theme; label: string; tone?: 'neutral' | 'accent' | 'danger' }) {
  const color = tone === 'danger' ? theme.danger : tone === 'accent' ? theme.accent : theme.muted;
  return (
    <View style={[s.metaChip, { borderColor: color }]}>
      <Text style={[s.metaChipText, { color }]}>{label}</Text>
    </View>
  );
}

function UndoBar({ theme, message, onUndo }: { theme: Theme; message: string; onUndo: () => void }) {
  return (
    <View style={[s.undoBar, { backgroundColor: theme.chip, borderColor: theme.border }]}>
      <Text style={[s.undoText, { color: theme.text }]} numberOfLines={1}>{message}</Text>
      <Pressable onPress={onUndo} hitSlop={8}>
        <Text style={[s.undoAction, { color: theme.accent }]}>UNDO</Text>
      </Pressable>
    </View>
  );
}

function Checkbox({ theme, completed, onPress }: { theme: Theme; completed: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={completed ? 'Mark incomplete' : 'Mark complete'} hitSlop={6}>
      <View style={[s.checkbox, {
        borderColor: completed ? theme.accent : theme.muted,
        backgroundColor: completed ? theme.accent : 'transparent',
      }]}>
        {completed && <Text style={[s.checkboxTick, { color: theme.onAccent }]}>✓</Text>}
      </View>
    </Pressable>
  );
}

/* ---------- Cross-folder task row (search & smart views) ---------- */

function CrossTaskRow({ theme, task, onToggle, onOpen }: {
  theme: Theme; task: TaskWithFolder; onToggle: (t: TaskWithFolder) => void; onOpen: (t: TaskWithFolder) => void;
}) {
  return (
    <Pressable onPress={() => onOpen(task)} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.cardRow}>
        <Checkbox theme={theme} completed={task.completed === 1} onPress={() => onToggle(task)} />
        <View style={{ flex: 1 }}>
          <Text style={[s.folderTag, { color: theme.muted }]} numberOfLines={1}>{task.folderName}</Text>
          <Text style={[s.taskTitle, { color: theme.text }]} numberOfLines={2}>{task.title}</Text>
          <View style={s.metaRow}>
            {!!task.dueAt && (() => {
              const f = fmtDue(task.dueAt!);
              return <MetaChip theme={theme} label={`📅 ${f.label}`} tone={f.overdue ? 'danger' : 'accent'} />;
            })()}
            {!!task.recurrence && <MetaChip theme={theme} label={`🔁 ${RECUR_NAME[task.recurrence!]}`} />}
            {!!task.reminderAt && <MetaChip theme={theme} label="⏰" />}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Screens ---------- */

function HomeScreen({ theme, themeName, onToggleTheme, onOpenFolder, onOpenBin }: {
  theme: Theme; themeName: ThemeName; onToggleTheme: () => void;
  onOpenFolder: (p: Folder) => void; onOpenBin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'today' | 'upcoming'>('all');
  const [dueTasks, setDueTasks] = useState<TaskWithFolder[]>([]);
  const [foundTasks, setFoundTasks] = useState<TaskWithFolder[]>([]);
  const [foundFolders, setFoundFolders] = useState<Folder[]>([]);
  const [ready, setReady] = useState(false);
  const [undo, setUndo] = useState<{ message: string; action: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndo = (message: string, action: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, action });
    undoTimer.current = setTimeout(() => setUndo(null), 4500);
  };

  const load = async () => {
    await initDb();
    setFolders(await db.getFolders(false));
    setCounts(await db.getFolderCounts());
    setReady(true);
  };
  useEffect(() => { load(); }, []);

  const refreshSmart = async () => {
    if (view === 'all') { setDueTasks([]); return; }
    setDueTasks(await db.getDueTasks(view));
  };
  useEffect(() => { refreshSmart(); }, [view]);

  // Debounced FTS search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setFoundTasks([]); setFoundFolders([]); return; }
    const t = setTimeout(async () => {
      setFoundTasks(await db.searchTasks(q));
      setFoundFolders(await db.searchFolders(q));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const refreshAll = () => { load(); refreshSmart(); };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    await db.createFolder(name);
    setNewName('');
    refreshAll();
  };

  const removeFolder = (p: Folder) => {
    db.deleteFolder(p.id!).then(refreshAll);
    showUndo(`"${p.name}" moved to Bin`, () => { db.restoreFolder(p.id!).then(refreshAll); });
  };

  const toggleTask = async (t: Task | TaskWithFolder) => {
    if (t.completed === 0 && t.id) await cancelTaskReminder(t.id);
    await db.toggleTask(t.id!);
    refreshAll();
    if (t.completed === 0) {
      showUndo('Done ✓', () => db.toggleTask(t.id!).then(refreshAll));
    }
  };

  const openTaskFolder = async (t: TaskWithFolder) => {
    const folder = await db.getFolderById(t.pageId);
    if (folder) onOpenFolder(folder);
  };

  const searching = query.trim().length > 0;

  const chips: Array<{ key: typeof view; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
  ];

  if (!ready) {
    return <View style={[s.fill, { backgroundColor: theme.bg }]}><Text style={[s.muted, { color: theme.muted }]}>Loading…</Text></View>;
  }

  return (
    <View style={[s.screen, { backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Status/nav bars are translucent; insets.top/bottom handle 3-button vs gesture nav. */}

      <View style={s.header}>
        <Text style={[s.title, { color: theme.text }]}>HyperNotes</Text>
        <View style={s.headerRight}>
          <IconBtn theme={theme} label={themeName === 'dark' ? '☀️' : '🌙'} onPress={onToggleTheme} accessibilityLabel="Toggle theme" />
          <Pressable onPress={onOpenBin} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <Text style={[s.binBtn, { color: theme.accent }]}>Bin</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        style={[s.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
        placeholder="Search tasks & folders…"
        placeholderTextColor={theme.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      {!searching && (
        <View style={s.chipsRow}>
          {chips.map(c => (
            <Pressable key={c.key} onPress={() => setView(c.key)} hitSlop={4}
              style={[s.chip, { backgroundColor: view === c.key ? theme.chipActive : theme.chip }]}>
              <Text style={[s.chipText, { color: view === c.key ? theme.onChipActive : theme.text }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {searching ? (
        <FlatList
          data={foundTasks}
          keyExtractor={item => 't' + item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={foundFolders.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={[s.section, { color: theme.muted }]}>FOLDERS</Text>
              {foundFolders.map(p => (
                <Pressable key={p.id} onPress={() => onOpenFolder(p)} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[s.taskTitle, { color: theme.text }]}>📄 {p.name}</Text>
                </Pressable>
              ))}
              <Text style={[s.section, { color: theme.muted, marginTop: 8 }]}>TASKS</Text>
            </View>
          ) : undefined}
          renderItem={({ item }) => <CrossTaskRow theme={theme} task={item} onToggle={toggleTask} onOpen={openTaskFolder} />}
          ListEmptyComponent={foundFolders.length === 0 ? <Text style={[s.muted, { color: theme.muted }]}>No matches for “{query.trim()}”.</Text> : undefined}
        />
      ) : view !== 'all' ? (
        <FlatList
          data={dueTasks}
          keyExtractor={item => 'd' + item.id}
          renderItem={({ item }) => <CrossTaskRow theme={theme} task={item} onToggle={toggleTask} onOpen={openTaskFolder} />}
          ListEmptyComponent={
            <Text style={[s.muted, { color: theme.muted }]}>
              {view === 'today' ? 'Nothing due today or overdue. Nice.' : 'Nothing due in the next 7 days.'}
            </Text>
          }
        />
      ) : (
        <>
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="New folder name"
              placeholderTextColor={theme.muted}
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={create}
            />
            <Pressable onPress={create} style={[s.addBtn, { backgroundColor: theme.accent }]} accessibilityLabel="Create folder">
              <Text style={[s.addBtnText, { color: theme.onAccent }]}>＋</Text>
            </Pressable>
          </View>
          <FlatList
            data={folders}
            keyExtractor={item => String(item.id)}
            numColumns={2}
            columnWrapperStyle={s.tileRow}
            contentContainerStyle={{ gap: 12, marginTop: 12 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => onOpenFolder(item)} style={[s.tile, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={s.tileTopRow}>
                  <Text style={s.tileIcon}>🗂️</Text>
                  <IconBtn theme={theme} label="🗑" onPress={() => removeFolder(item)} accessibilityLabel="Move folder to Bin" />
                </View>
                <View>
                  <Text style={[s.tileName, { color: theme.text }]} numberOfLines={2}>{item.name}</Text>
                  <Text style={[s.tileMeta, { color: theme.muted }]}>{counts[item.id!] ?? 0} open task{(counts[item.id!] ?? 0) === 1 ? '' : 's'}</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={[s.muted, { color: theme.muted }]}>No folders yet. Create one above.</Text>}
          />
        </>
      )}

      {undo && <UndoBar theme={theme} message={undo.message} onUndo={() => { undo.action(); setUndo(null); }} />}
    </View>
  );
}

function FolderScreen({ theme, themeName, onToggleTheme, folder, onBack }: {
  theme: Theme; themeName: ThemeName; onToggleTheme: () => void; folder: Folder; onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [reminderMode, setReminderMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [dueTask, setDueTask] = useState<Task | null>(null);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const [undo, setUndo] = useState<{ message: string; action: () => void } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => setTasks(await db.getTasks(folder.id!));
  useEffect(() => { load(); }, []);

  const showUndo = (message: string, action: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, action });
    undoTimer.current = setTimeout(() => setUndo(null), 4500);
  };

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    await db.createTask(folder.id!, title);
    setNewTask('');
    load();
  };

  const toggle = async (t: Task) => {
    if (t.completed === 0 && t.id) await cancelTaskReminder(t.id);
    await db.toggleTask(t.id!);
    load();
    const completing = t.completed === 0;
    showUndo(completing ? (t.recurrence ? `Done ✓ — next ${RECUR_NAME[t.recurrence]} task scheduled` : 'Done ✓') : 'Reopened',
      () => { db.toggleTask(t.id!).then(load); });
  };

  const removeTask = async (t: Task) => {
    if (t.id) await cancelTaskReminder(t.id);
    await db.deleteTask(t.id!);
    load();
    showUndo('Moved to Trash', () => { db.restoreTask(t.id!).then(load); });
  };

  /* Reminders */
  const scheduleReminder = async (t: Task, date: Date) => {
    if (date.getTime() <= Date.now()) {
      Alert.alert('Pick a future time', 'The reminder must be set in the future.');
      return;
    }
    const granted = await requestReminderPermission();
    if (!granted) {
      Alert.alert('Notifications disabled', 'Enable notifications for HyperNotes in system settings to get task reminders.');
      return;
    }
    await scheduleTaskReminder(t.id!, t.title, date);
    await db.setReminder(t.id!, date.getTime());
    load();
  };
  const clearReminder = async (t: Task) => {
    await cancelTaskReminder(t.id!);
    await db.setReminder(t.id!, null);
    load();
  };
  const bellPress = (t: Task) => {
    const options: Array<{ text: string; onPress?: () => void; style?: 'cancel' }> = [
      { text: 'In 1 hour', onPress: () => scheduleReminder(t, new Date(Date.now() + 3600_000)) },
      { text: 'Tomorrow 9:00 AM', onPress: () => scheduleReminder(t, tomorrowMorning9()) },
      {
        text: 'Pick date & time…',
        onPress: () => { setPendingDate(new Date(Date.now() + 3600_000)); setReminderTask(t); setReminderMode(Platform.OS === 'ios' ? 'datetime' : 'date'); },
      },
    ];
    if (t.reminderAt) options.push({ text: 'Clear reminder', onPress: () => clearReminder(t) });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Task reminder', t.reminderAt ? `Set for ${new Date(t.reminderAt).toLocaleString()}` : 'When should we remind you?', options);
  };

  /* Due date */
  const duePress = (t: Task) => {
    if (t.dueAt) {
      Alert.alert('Due date', `Currently due ${new Date(t.dueAt).toLocaleString()}`, [
        { text: 'Change…', onPress: () => { setPendingDate(new Date(t.dueAt!)); setDueTask(t); } },
        { text: 'Clear', onPress: async () => { await db.setDue(t.id!, null); load(); } },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      setPendingDate(new Date());
      setDueTask(t);
    }
  };

  /* Recurrence */
  const recurrencePress = (t: Task) => {
    Alert.alert('Repeat', 'How often should this task repeat after completion?', [
      { text: 'None', onPress: async () => { await db.setRecurrence(t.id!, null); load(); } },
      { text: 'Daily', onPress: async () => { await db.setRecurrence(t.id!, 'daily'); load(); } },
      { text: 'Weekly', onPress: async () => { await db.setRecurrence(t.id!, 'weekly'); load(); } },
      { text: 'Monthly', onPress: async () => { await db.setRecurrence(t.id!, 'monthly'); load(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderTask = ({ item }: { item: Task }) => {
    const due = item.dueAt ? fmtDue(item.dueAt) : null;
    const done = item.completed === 1;
    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.cardRow}>
          <Checkbox theme={theme} completed={done} onPress={() => toggle(item)} />
          <View style={{ flex: 1 }}>
            <Text style={[s.taskTitle, { color: theme.text }, done && { textDecorationLine: 'line-through', color: theme.muted }]}>{item.title}</Text>
            {!!item.completedAt && <Text style={[s.muted, { color: theme.muted }]}>Done {new Date(item.completedAt).toLocaleString()}</Text>}
            <View style={s.metaRow}>
              {due && <MetaChip theme={theme} label={`📅 ${due.label}`} tone={due.overdue ? 'danger' : 'accent'} />}
              {!!item.reminderAt && <MetaChip theme={theme} label={`⏰ ${new Date(item.reminderAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} />}
              {!!item.recurrence && <MetaChip theme={theme} label={`🔁 ${RECUR_NAME[item.recurrence]}`} />}
            </View>
          </View>
          <IconBtn theme={theme} label="🔁" active={!!item.recurrence} onPress={() => recurrencePress(item)} accessibilityLabel="Set repeat" />
          <IconBtn theme={theme} label="⏰" active={!!item.reminderAt} onPress={() => bellPress(item)} accessibilityLabel="Set reminder" />
          <IconBtn theme={theme} label="📅" active={!!item.dueAt} onPress={() => duePress(item)} accessibilityLabel="Set due date" />
        </View>
        <View style={[s.cardRow, { marginTop: 6, justifyContent: 'flex-end' }]}>
          <IconBtn theme={theme} label={expanded === item.id ? 'Hide notes ▴' : 'Notes ▾'} onPress={() => setExpanded(expanded === item.id ? null : item.id!)} />
          <IconBtn theme={theme} label="🗑" onPress={() => removeTask(item)} accessibilityLabel="Move to Trash" />
        </View>
        {expanded === item.id && (
          <TextInput
            style={[s.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            placeholder="Add notes…"
            placeholderTextColor={theme.muted}
            multiline
            value={notesDraft[item.id!] ?? item.notes ?? ''}
            onChangeText={v => setNotesDraft(prev => ({ ...prev, [item.id!]: v }))}
            onBlur={async () => {
              const v = notesDraft[item.id!] ?? item.notes ?? '';
              await db.updateNotes(item.id!, v);
              load();
            }}
          />
        )}
      </View>
    );
  };

  return (
    <View style={[s.screen, { backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <Text style={[s.binBtn, { color: theme.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[s.title, { color: theme.text, fontSize: 20 }]} numberOfLines={1}>{folder.name}</Text>
        <IconBtn theme={theme} label={themeName === 'dark' ? '☀️' : '🌙'} onPress={onToggleTheme} accessibilityLabel="Toggle theme" />
      </View>

      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
          placeholder="Add a new task…"
          placeholderTextColor={theme.muted}
          value={newTask}
          onChangeText={setNewTask}
          onSubmitEditing={addTask}
        />
        <Pressable onPress={addTask} style={[s.addBtn, { backgroundColor: theme.accent }]} accessibilityLabel="Add task">
          <Text style={[s.addBtnText, { color: theme.onAccent }]}>＋</Text>
        </Pressable>
      </View>

      <FlatList data={tasks} keyExtractor={item => String(item.id)} renderItem={renderTask} style={{ marginTop: 12 }}
        ListEmptyComponent={<Text style={[s.muted, { color: theme.muted }]}>No tasks yet. Add one above.</Text>} />

      {/* Due-date picker (single step) */}
      {dueTask && (
        <DateTimePicker
          value={pendingDate}
          mode="date"
          minimumDate={new Date(Date.now() - 365 * 86400000)}
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            if (Platform.OS === 'android' && event.type === 'dismissed') { setDueTask(null); return; }
            const picked = selected ?? pendingDate;
            const t = dueTask;
            setDueTask(null);
            db.setDue(t.id!, picked.getTime()).then(load);
          }}
        />
      )}

      {/* Reminder picker (Android: date then time; iOS: datetime) */}
      {reminderMode && reminderTask && (
        <DateTimePicker
          value={pendingDate}
          mode={reminderMode}
          minimumDate={new Date()}
          is24Hour
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            if (Platform.OS === 'android' && event.type === 'dismissed') { setReminderMode(null); setReminderTask(null); return; }
            const picked = selected ?? pendingDate;
            if (reminderMode === 'date') { setPendingDate(picked); setReminderMode('time'); return; }
            const finalDate = reminderMode === 'datetime' ? picked : combineDateAndTime(pendingDate, picked);
            const task = reminderTask;
            setReminderMode(null);
            setReminderTask(null);
            scheduleReminder(task, finalDate);
          }}
        />
      )}

      {undo && <UndoBar theme={theme} message={undo.message} onUndo={() => { undo.action(); setUndo(null); }} />}
    </View>
  );
}

function BinScreen({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = async () => {
    setFolders(await db.getFolders(true));
    setTasks(await db.getDeletedTasks());
  };
  useEffect(() => { load(); }, []);

  return (
    <View style={[s.screen, { backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
          <Text style={[s.binBtn, { color: theme.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[s.title, { color: theme.text, fontSize: 20 }]}>Bin / Trash</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={[s.section, { color: theme.muted }]}>DELETED FOLDERS</Text>
      <FlatList
        data={folders}
        keyExtractor={i => 'p' + i.id}
        renderItem={({ item }) => (
          <View style={[s.card, s.cardRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.taskTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            <Pressable onPress={async () => { await db.restoreFolder(item.id!); load(); }} style={[s.chip, { backgroundColor: theme.chip }]}>
              <Text style={[s.chipText, { color: theme.text }]}>Restore</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={[s.muted, { color: theme.muted }]}>No deleted folders</Text>}
      />
      <Text style={[s.section, { color: theme.muted }]}>DELETED TASKS (TRASH)</Text>
      <FlatList
        data={tasks}
        keyExtractor={i => 't' + i.id}
        renderItem={({ item }) => (
          <View style={[s.card, s.cardRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.taskTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>🗑 {item.title}</Text>
            <Pressable onPress={async () => { await db.restoreTask(item.id!); load(); }} style={[s.chip, { backgroundColor: theme.chip }]}>
              <Text style={[s.chipText, { color: theme.text }]}>Restore</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={[s.muted, { color: theme.muted }]}>No deleted tasks</Text>}
      />
    </View>
  );
}

export default function App() {
  const scheme = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(null);
  const themeName: ThemeName = override ?? (scheme === 'dark' ? 'dark' : 'light');
  const theme = themes[themeName];

  const [screen, setScreen] = useState<'home' | 'folder' | 'bin'>('home');
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);

  const toggleTheme = () => setOverride(themeName === 'dark' ? 'light' : 'dark');

  let content: React.ReactNode;
  if (screen === 'folder' && currentFolder) {
    content = <FolderScreen theme={theme} themeName={themeName} onToggleTheme={toggleTheme} folder={currentFolder} onBack={() => setScreen('home')} />;
  } else if (screen === 'bin') {
    content = <BinScreen theme={theme} onBack={() => setScreen('home')} />;
  } else {
    content = (
      <HomeScreen
        theme={theme}
        themeName={themeName}
        onToggleTheme={toggleTheme}
        onOpenFolder={p => { setCurrentFolder(p); setScreen('folder'); }}
        onOpenBin={() => setScreen('bin')}
      />
    );
  }

  return (
    <SafeAreaProvider>
      {/* Icons over translucent status bar; Android nav bar button style follows our theme (gesture vs 3-button handled by the OS). */}
      <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
      <NavigationBar style={themeName === 'dark' ? 'light' : 'dark'} />
      {content}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  tileRow: { gap: 12 },
  tile: {
    flex: 1, aspectRatio: 1.25, borderWidth: 1, borderRadius: 18,
    padding: 14, justifyContent: 'space-between',
  },
  tileTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileIcon: { fontSize: 30 },
  tileName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  tileMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  iconBtnText: { fontSize: 17 },
  checkbox: {
    width: 24, height: 24, borderWidth: 2, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxTick: { fontSize: 15, fontWeight: '800' },
  metaChip: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 1, marginRight: 6, marginTop: 4,
    alignSelf: 'flex-start',
  },
  metaChipText: { fontSize: 11, fontWeight: '600' },
  folderTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  taskTitle: { fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 1 },
  undoBar: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    elevation: 6,
  },
  undoText: { flex: 1, fontSize: 13, fontWeight: '500' },
  undoAction: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, minHeight: 44,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  binBtn: { fontSize: 16, fontWeight: '700' },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 14, marginBottom: 6 },
  muted: { fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10, fontSize: 15,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 22, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8, minHeight: 90, textAlignVertical: 'top', fontSize: 14 },
});
