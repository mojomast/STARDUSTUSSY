import BackgroundFetch from 'react-native-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {SYNC_CONFIG, STORAGE_KEYS} from '@constants/index';
import {syncPendingChanges} from './sync';

export const initBackgroundFetch = async (): Promise<void> => {
  try {
    await BackgroundFetch.configure(
      {
        minimumFetchInterval: SYNC_CONFIG.backgroundSyncInterval / 60, // Convert to minutes
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      async (taskId) => {
        console.log('[BackgroundFetch] Task start:', taskId);
        
        await performBackgroundSync();
        
        BackgroundFetch.finish(taskId);
      },
      async (taskId) => {
        console.log('[BackgroundFetch] Task timeout:', taskId);
        BackgroundFetch.finish(taskId);
      },
    );

    await BackgroundFetch.start();
    console.log('[BackgroundFetch] Started successfully');
  } catch (error) {
    console.error('[BackgroundFetch] Error:', error);
  }
};

export const stopBackgroundFetch = async (): Promise<void> => {
  try {
    await BackgroundFetch.stop();
    console.log('[BackgroundFetch] Stopped');
  } catch (error) {
    console.error('[BackgroundFetch] Error stopping:', error);
  }
};

export const performBackgroundSync = async (): Promise<void> => {
  try {
    // Check network connectivity
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('[BackgroundSync] No network connection');
      return;
    }

    // Check if user is authenticated
    const token = await AsyncStorage.getItem(STORAGE_KEYS.authToken);
    if (!token) {
      console.log('[BackgroundSync] Not authenticated');
      return;
    }

    // Sync pending changes
    await syncPendingChanges();

    // Update last sync time
    await AsyncStorage.setItem(
      STORAGE_KEYS.lastSyncTime,
      new Date().toISOString(),
    );

    console.log('[BackgroundSync] Completed successfully');
  } catch (error) {
    console.error('[BackgroundSync] Error:', error);
  }
};

// Headless task for Android
export const backgroundFetchHeadlessTask = async (event: {
  taskId: string;
  timeout: boolean;
}): Promise<void> => {
  console.log('[BackgroundFetch Headless] Task start:', event.taskId);

  if (event.timeout) {
    console.log('[BackgroundFetch Headless] Task timeout');
    BackgroundFetch.finish(event.taskId);
    return;
  }

  await performBackgroundSync();

  BackgroundFetch.finish(event.taskId);
};
