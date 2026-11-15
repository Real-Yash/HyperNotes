import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, Button, StyleSheet, Alert, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { db, Page, Task, initDb } from './src/db';
import { initNotifications, requestReminderPermission, scheduleTaskReminder, cancelTaskReminder } from './src/notifications';

// Register the foreground notification handler as early as possible.
initNotifications();

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

function HomeScreen({ onOpenPage, onOpenBin }: { onOpenPage: (page: Page) => void; onOpenBin: () => void }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    await initDb();
    setPages(await db.getPages(false));
    setReady(true);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    await db.createPage(name);
    setNewName('');
    load();
  };

  const remove = (p: Page) => {
    Alert.alert('Delete page?', `"${p.name}" will be moved to Bin.`, [
      { text: 'Cancel' },
      { text: 'Delete', onPress: async () => { await db.deletePage(p.id!); load(); } },
    ]);
  };

  const filtered = pages.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  if (!ready) return <View style={s.center}><Text>Loading…</Text></View>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>HyperNotes</Text>
        <Button title="Bin" onPress={onOpenBin} />
      </View>
      <TextInput style={s.input} placeholder="Search pages…" value={query} onChangeText={setQuery} />
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="New page name" value={newName} onChangeText={setNewName} onSubmitEditing={create} />
        <Button title="+" onPress={create} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => onOpenPage(item)}>
            <View style={s.cardRow}>
              <Text style={s.cardTitle}>{item.name}</Text>
              <Button title="🗑" onPress={() => remove(item)} />
            </View>
            <Text style={s.muted}>Created {new Date(item.createdAt).toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.muted}>No pages yet. Create one above.</Text>}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function PageScreen({ page, onBack }: { page: Page; onBack: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [pickerTask, setPickerTask] = useState<Task | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime' | null>(null);
  const [pendingDate, setPendingDate] = useState<Date>(new Date());

  const load = async () => setTasks(await db.getTasks(page.id!));
  useEffect(() => { load(); }, []);

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
      { text: 'In 1 hour', onPress: () => scheduleReminder(t, new Date(Date.now() + 60 * 60 * 1000)) },
      { text: 'Tomorrow 9:00 AM', onPress: () => scheduleReminder(t, tomorrowMorning9()) },
      {
        text: 'Pick date & time…',
        onPress: () => {
          setPendingDate(new Date(Date.now() + 60 * 60 * 1000));
          setPickerTask(t);
          setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date');
        },
      },
    ];
    if (t.reminderAt) {
      options.push({ text: 'Clear reminder', onPress: () => clearReminder(t) });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(
      'Task reminder',
      t.reminderAt ? `Currently set for ${new Date(t.reminderAt).toLocaleString()}` : 'When should we remind you?',
      options,
    );
  };

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    await db.createTask(page.id!, title);
    setNewTask('');
    load();
  };

  const toggle = (t: Task) => {
    Alert.alert(t.completed === 1 ? 'Mark incomplete?' : 'Mark complete?', undefined, [
      { text: 'Cancel' },
      { text: 'OK', onPress: async () => {
        if (t.completed === 0 && t.id) await cancelTaskReminder(t.id); // completing
        await db.toggleTask(t.id!);
        load();
      } },
    ]);
  };

  const removeTask = (t: Task) => {
    Alert.alert('Delete task?', 'It will be moved to Trash.', [
      { text: 'Cancel' },
      { text: 'Delete', onPress: async () => {
        if (t.id) await cancelTaskReminder(t.id);
        await db.deleteTask(t.id!);
        load();
      } },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Button title="‹ Back" onPress={onBack} />
        <Text style={s.title}>{page.name}</Text>
      </View>
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Add a new task…" value={newTask} onChangeText={setNewTask} onSubmitEditing={addTask} />
        <Button title="+" onPress={addTask} />
      </View>
      {pickerMode && pickerTask && (
        <DateTimePicker
          value={pendingDate}
          mode={pickerMode}
          minimumDate={new Date()}
          is24Hour
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            if (Platform.OS === 'android' && event.type === 'dismissed') {
              setPickerMode(null);
              setPickerTask(null);
              return;
            }
            const picked = selected ?? pendingDate;
            if (pickerMode === 'date') {
              setPendingDate(picked);
              setPickerMode('time');
              return;
            }
            const finalDate = pickerMode === 'datetime' ? picked : combineDateAndTime(pendingDate, picked);
            const task = pickerTask;
            setPickerMode(null);
            setPickerTask(null);
            scheduleReminder(task, finalDate);
          }}
        />
      )}
      <FlatList
        data={tasks}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              <TouchableOpacity onPress={() => toggle(item)}>
                <Text style={s.checkbox}>{item.completed === 1 ? '✅' : '⬜'}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={item.completed === 1 ? s.strike : undefined}>{item.title}</Text>
                {!!item.completedAt && <Text style={s.muted}>Done {new Date(item.completedAt).toLocaleString()}</Text>}
                {!!item.reminderAt && <Text style={s.reminder}>⏰ {new Date(item.reminderAt).toLocaleString()}</Text>}
              </View>
              <TouchableOpacity onPress={() => bellPress(item)} accessibilityLabel="Set reminder">
                <Text style={[s.bell, item.reminderAt ? s.bellActive : s.bellMuted]}>⏰</Text>
              </TouchableOpacity>
              <Button title={expanded === item.id ? '▲' : '▼'} onPress={() => setExpanded(expanded === item.id ? null : item.id!)} />
              <Button title="🗑" onPress={() => removeTask(item)} />
            </View>
            {expanded === item.id && (
              <TextInput
                style={s.textarea}
                placeholder="Add notes…"
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
        )}
      />
    </SafeAreaView>
  );
}

function BinScreen({ onBack }: { onBack: () => void }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = async () => {
    setPages(await db.getPages(true));
    setTasks(await db.getDeletedTasks());
  };
  useEffect(() => { load(); }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Button title="‹ Back" onPress={onBack} />
        <Text style={s.title}>Bin / Trash</Text>
      </View>
      <Text style={s.section}>Deleted Pages</Text>
      <FlatList
        data={pages}
        keyExtractor={i => 'p' + i.id}
        renderItem={({ item }) => (
          <View style={s.cardRow}>
            <Text style={{ flex: 1 }}>{item.name}</Text>
            <Button title="Restore" onPress={async () => { await db.restorePage(item.id!); load(); }} />
          </View>
        )}
        ListEmptyComponent={<Text style={s.muted}>No deleted pages</Text>}
      />
      <Text style={s.section}>Deleted Tasks (Trash)</Text>
      <FlatList
        data={tasks}
        keyExtractor={i => 't' + i.id}
        renderItem={({ item }) => (
          <View style={s.cardRow}>
            <Text style={{ flex: 1 }}>🗑 {item.title}</Text>
            <Button title="Restore" onPress={async () => { await db.restoreTask(item.id!); load(); }} />
          </View>
        )}
        ListEmptyComponent={<Text style={s.muted}>No deleted tasks</Text>}
      />
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'page' | 'bin'>('home');
  const [currentPage, setCurrentPage] = useState<Page | null>(null);

  if (screen === 'page' && currentPage) {
    return <PageScreen page={currentPage} onBack={() => setScreen('home')} />;
  }
  if (screen === 'bin') {
    return <BinScreen onBack={() => setScreen('home')} />;
  }
  return <HomeScreen onOpenPage={p => { setCurrentPage(p); setScreen('page'); }} onOpenBin={() => setScreen('bin')} />;
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  muted: { color: '#888', fontSize: 12, marginTop: 4 },
  strike: { textDecorationLine: 'line-through', color: '#888' },
  reminder: { color: '#b45309', fontSize: 12, marginTop: 2 },
  bell: { fontSize: 20 },
  bellActive: { opacity: 1 },
  bellMuted: { opacity: 0.35 },
  checkbox: { fontSize: 20 },
  textarea: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 8, minHeight: 90, textAlignVertical: 'top' },
});
