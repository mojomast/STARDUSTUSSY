import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '@constants/index';
import * as api from './api';

export const syncPendingChanges = async (): Promise<void> => {
  try {
    const pendingQueue = await AsyncStorage.getItem(STORAGE_KEYS.pendingQueue);
    if (!pendingQueue) return;

    const queue: Array<{
      method: string;
      endpoint: string;
      data: any;
      timestamp: number;
    }> = JSON.parse(pendingQueue);

    if (queue.length === 0) return;

    const failedItems: typeof queue = [];

    for (const item of queue) {
      try {
        switch (item.method) {
          case 'POST':
            await api.apiPost(item.endpoint, item.data);
            break;
          case 'PATCH':
            await api.apiPatch(item.endpoint, item.data);
            break;
          case 'DELETE':
            await api.apiDelete(item.endpoint);
            break;
        }
      } catch (error) {
        console.error('Failed to sync item:', item, error);
        failedItems.push(item);
      }
    }

    // Save failed items back to queue
    await AsyncStorage.setItem(
      STORAGE_KEYS.pendingQueue,
      JSON.stringify(failedItems),
    );

    console.log(`[Sync] Processed ${queue.length} items, ${failedItems.length} failed`);
  } catch (error) {
    console.error('[Sync] Error syncing pending changes:', error);
  }
};

export const queueChange = async (
  method: string,
  endpoint: string,
  data: any,
): Promise<void> => {
  try {
    const pendingQueue = await AsyncStorage.getItem(STORAGE_KEYS.pendingQueue);
    const queue = pendingQueue ? JSON.parse(pendingQueue) : [];

    queue.push({
      method,
      endpoint,
      data,
      timestamp: Date.now(),
    });

    await AsyncStorage.setItem(STORAGE_KEYS.pendingQueue, JSON.stringify(queue));
  } catch (error) {
    console.error('[Sync] Error queuing change:', error);
  }
};

export const clearSyncQueue = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.pendingQueue);
};
