import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {AppDispatch, RootState} from '@store/index';
import {setSyncing, setLastSyncTime, setPendingChanges} from '@store/slices/syncSlice';
import {syncPendingChanges} from '@services/sync';
import {SYNC_CONFIG} from '@constants/index';

const BackgroundSync: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const {isOnline, pendingChanges} = useSelector((state: RootState) => state.sync);
  const {isAuthenticated} = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;

    const syncInterval = setInterval(async () => {
      if (pendingChanges > 0) {
        dispatch(setSyncing(true));
        try {
          await syncPendingChanges();
          dispatch(setLastSyncTime(new Date()));
          dispatch(setPendingChanges(0));
        } catch (error) {
          console.error('[BackgroundSync] Error:', error);
        } finally {
          dispatch(setSyncing(false));
        }
      }
    }, SYNC_CONFIG.syncInterval);

    return () => {
      clearInterval(syncInterval);
    };
  }, [isAuthenticated, isOnline, pendingChanges, dispatch]);

  return null;
};

export default BackgroundSync;
