import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from './theme';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const to12h = (h: number) => h % 12 === 0 ? 12 : h % 12;

const QUICK_TIMES = [
  { label: 'Morning', h: 9, m: 0 },
  { label: 'Noon', h: 12, m: 0 },
  { label: 'Evening', h: 18, m: 0 },
  { label: 'Night', h: 21, m: 0 },
];

export default function WhenSheet({ theme, visible, mode, title, initial, minimum, onCancel, onConfirm }: {
  theme: Theme;
  visible: boolean;
  mode: 'date' | 'datetime';
  title: string;
  initial?: Date;
  minimum?: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => { const d = initial ?? new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<Date>(() => initial ?? new Date());
  const [hour, setHour] = useState(() => to12h((initial ?? new Date()).getHours()));
  const [minute, setMinute] = useState(() => Math.round((initial ?? new Date()).getMinutes() / 5) * 5 % 60);
  const [isPM, setIsPM] = useState(() => (initial ?? new Date()).getHours() >= 12);

  useEffect(() => {
    if (!visible) return;
    const d = initial ?? new Date();
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(d);
    setHour(to12h(d.getHours()));
    setMinute(Math.round(d.getMinutes() / 5) * 5 % 60);
    setIsPM(d.getHours() >= 12);
  }, [visible]);

  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const total = daysInMonth(viewMonth);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const minDay = minimum ? startOfDay(minimum).getTime() : null;
  const isPastDay = (d: Date) => minDay !== null && startOfDay(d).getTime() < minDay;

  const result = (): Date => {
    const d = new Date(selected);
    if (mode === 'datetime') {
      const base = hour % 12;
      d.setHours(isPM ? base + 12 : base, minute, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0); // date-only anchor; consumers should reduce to day
    }
    return d;
  };
  const valid = mode === 'date' || result().getTime() > Date.now();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <View style={s.headerRow}>
            <Text style={[s.title, { color: theme.text }]}>{title}</Text>
            <Pressable onPress={onCancel} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.muted} />
            </Pressable>
          </View>

          {/* Month navigation */}
          <View style={s.monthRow}>
            <Pressable onPress={() => setViewMonth(addMonths(viewMonth, -1))} hitSlop={8} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <Text style={[s.monthLabel, { color: theme.text }]}>
              {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable onPress={() => setViewMonth(addMonths(viewMonth, 1))} hitSlop={8} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View style={s.weekRow}>
            {WEEKDAYS.map(w => (
              <Text key={w} style={[s.weekday, { color: theme.muted }]}>{w}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={s.grid}>
            {grid.map((d, i) => {
              if (!d) return <View key={'x' + i} style={s.dayCell} />;
              const disabled = isPastDay(d);
              const isSel = sameDay(d, selected);
              const isToday = sameDay(d, new Date());
              return (
                <Pressable
                  key={d.toDateString()}
                  disabled={disabled}
                  onPress={() => setSelected(d)}
                  style={[s.dayCell, s.dayInner,
                    isSel && { backgroundColor: theme.accent },
                    !isSel && isToday && { borderWidth: 1.5, borderColor: theme.accent },
                    disabled && { opacity: 0.25 },
                  ]}
                  accessibilityLabel={d.toDateString()}
                >
                  <Text style={[s.dayText, { color: isSel ? theme.onAccent : theme.text }]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Time controls (datetime only) */}
          {mode === 'datetime' && (
            <>
              <View style={s.quickRow}>
                {QUICK_TIMES.map(q => (
                  <Pressable
                    key={q.label}
                    onPress={() => { setHour(to12h(q.h)); setMinute(q.m); setIsPM(q.h >= 12); }}
                    style={[s.quickChip, { backgroundColor: theme.chip }]}
                  >
                    <Text style={[s.quickChipText, { color: theme.text }]}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.timeRow}>
                {/* Hour */}
                <View style={s.timeCol}>
                  <Pressable onPress={() => setHour(h => (h % 12) + 1)} hitSlop={6}><Ionicons name="chevron-up" size={22} color={theme.muted} /></Pressable>
                  <Text style={[s.timeDigit, { color: theme.text }]}>{hour}</Text>
                  <Pressable onPress={() => setHour(h => (h - 2 + 12) % 12 + 1)} hitSlop={6}><Ionicons name="chevron-down" size={22} color={theme.muted} /></Pressable>
                </View>
                <Text style={[s.timeColon, { color: theme.text }]}>:</Text>
                {/* Minute */}
                <View style={s.timeCol}>
                  <Pressable onPress={() => setMinute(m => (m + 5) % 60)} hitSlop={6}><Ionicons name="chevron-up" size={22} color={theme.muted} /></Pressable>
                  <Text style={[s.timeDigit, { color: theme.text }]}>{String(minute).padStart(2, '0')}</Text>
                  <Pressable onPress={() => setMinute(m => (m - 5 + 60) % 60)} hitSlop={6}><Ionicons name="chevron-down" size={22} color={theme.muted} /></Pressable>
                </View>
                {/* AM / PM */}
                <View style={s.ampmCol}>
                  {(['AM', 'PM'] as const).map(p => (
                    <Pressable
                      key={p}
                      onPress={() => setIsPM(p === 'PM')}
                      style={[s.ampmChip, { backgroundColor: (p === 'PM') === isPM ? theme.accent : theme.chip }]}
                    >
                      <Text style={[s.ampmText, { color: (p === 'PM') === isPM ? theme.onAccent : theme.text }]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Actions */}
          <View style={s.actions}>
            <Pressable onPress={onCancel} style={[s.btn, { borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[s.btnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => valid && onConfirm(result())}
              disabled={!valid}
              style={[s.btn, { backgroundColor: valid ? theme.accent : theme.chip }]}
            >
              <Text style={[s.btnText, { color: valid ? theme.onAccent : theme.muted }]}>Set</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  monthLabel: { fontSize: 14, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  dayCell: { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 1 },
  dayInner: { borderRadius: 999 },
  dayText: { fontSize: 13, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  quickChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  quickChipText: { fontSize: 12, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 12 },
  timeCol: { alignItems: 'center', gap: 2 },
  timeDigit: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'], width: 44, textAlign: 'center' },
  timeColon: { fontSize: 28, fontWeight: '800' },
  ampmCol: { gap: 6, marginLeft: 4 },
  ampmChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  ampmText: { fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  btn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  btnText: { fontSize: 14, fontWeight: '800' },
});
