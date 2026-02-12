import {Notifications} from 'react-native-notifications';
import PushNotification from 'react-native-push-notification';
import {NOTIFICATION_CHANNELS} from '@constants/index';
import {NotificationPayload} from '@types/index';

export const configurePushNotifications = (): void => {
  PushNotification.configure({
    onRegister: (token) => {
      console.log('Push notification token:', token);
      // TODO: Send token to server
    },

    onNotification: (notification) => {
      console.log('Notification received:', notification);
      // Handle notification tap
      if (notification.userInteraction) {
        handleNotificationTap(notification.data);
      }
    },

    onAction: (notification) => {
      console.log('Notification action:', notification);
    },

    onRegistrationError: (err) => {
      console.error('Push notification registration error:', err);
    },

    permissions: {
      alert: true,
      badge: true,
      sound: true,
    },

    popInitialNotification: true,
    requestPermissions: true,
  });

  // Create notification channels for Android
  if (Platform.OS === 'android') {
    PushNotification.createChannel(
      {
        channelId: NOTIFICATION_CHANNELS.sessionAlerts.id,
        channelName: NOTIFICATION_CHANNELS.sessionAlerts.name,
        channelDescription: NOTIFICATION_CHANNELS.sessionAlerts.description,
        importance: NOTIFICATION_CHANNELS.sessionAlerts.importance,
        vibrate: true,
      },
      (created) => console.log(`Channel created: ${created}`),
    );

    PushNotification.createChannel(
      {
        channelId: NOTIFICATION_CHANNELS.syncAlerts.id,
        channelName: NOTIFICATION_CHANNELS.syncAlerts.name,
        channelDescription: NOTIFICATION_CHANNELS.syncAlerts.description,
        importance: NOTIFICATION_CHANNELS.syncAlerts.importance,
        vibrate: false,
      },
      (created) => console.log(`Channel created: ${created}`),
    );
  }
};

export const showLocalNotification = (
  payload: NotificationPayload,
  channelId: string = NOTIFICATION_CHANNELS.sessionAlerts.id,
): void => {
  PushNotification.localNotification({
    channelId,
    title: payload.title,
    message: payload.body,
    userInfo: payload.data,
    playSound: true,
    soundName: 'default',
    importance: 'high',
    priority: 'high',
  });
};

export const showScheduledNotification = (
  payload: NotificationPayload,
  date: Date,
  channelId: string = NOTIFICATION_CHANNELS.sessionAlerts.id,
): void => {
  PushNotification.localNotificationSchedule({
    channelId,
    title: payload.title,
    message: payload.body,
    userInfo: payload.data,
    date,
    allowWhileIdle: true,
  });
};

export const cancelAllNotifications = (): void => {
  PushNotification.cancelAllLocalNotifications();
};

export const cancelNotification = (id: string): void => {
  PushNotification.cancelLocalNotifications({id});
};

const handleNotificationTap = (data: any): void => {
  if (data?.type === 'handoff') {
    // Navigate to handoff screen
    console.log('Navigate to handoff:', data.handoffId);
  } else if (data?.type === 'session') {
    // Navigate to session details
    console.log('Navigate to session:', data.sessionId);
  }
};

import {Platform} from 'react-native';
