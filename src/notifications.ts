import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const REMINDER_CHANNEL_ID = 'task-reminders';

// Show reminder banners even when the app is open (in-app reminder).
export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Task reminders',
      description: 'In-app reminders for tasks',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    }).catch(() => {});
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export function reminderNotificationId(taskId: number): string {
  return `task-reminder-${taskId}`;
}

export async function scheduleTaskReminder(taskId: number, title: string, date: Date): Promise<void> {
  // Replace any existing reminder for this task.
  await cancelTaskReminder(taskId);
  await Notifications.scheduleNotificationAsync({
    identifier: reminderNotificationId(taskId),
    content: {
      title: 'HyperNotes reminder',
      body: title,
      sound: 'default',
      data: { type: 'task-reminder', taskId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelTaskReminder(taskId: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderNotificationId(taskId));
  } catch {
    // ignore — nothing scheduled
  }
}
