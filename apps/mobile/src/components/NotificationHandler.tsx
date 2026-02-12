import React, {useEffect} from 'react';
import {useSelector} from 'react-redux';
import {RootState} from '@store/index';
import {showLocalNotification} from '@services/notifications';

const NotificationHandler: React.FC = () => {
  const sync = useSelector((state: RootState) => state.sync);
  const session = useSelector((state: RootState) => state.session);

  useEffect(() => {
    // Show notification when sync fails multiple times
    if (sync.syncErrors.length > 3) {
      showLocalNotification({
        title: 'Sync Error',
        body: 'Multiple sync errors detected. Please check your connection.',
        data: {type: 'sync_error'},
      });
    }
  }, [sync.syncErrors]);

  useEffect(() => {
    // Show notification for new handoff requests
    // This would be triggered by a WebSocket message in a real implementation
  }, []);

  return null;
};

export default NotificationHandler;
