import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { disconnectDevice, renameDevice } from '../../store/slices/handoffSlice';
import type { Device } from '../../types/index.ts';
import styles from './DeviceList.module.css';

interface DeviceListProps {
  onSelectDevice?: (device: Device) => void;
  selectedDeviceId?: string | null;
  showActions?: boolean;
}

function DeviceList({ onSelectDevice, selectedDeviceId, showActions = true }: DeviceListProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { devices } = useSelector((state: RootState) => state.session);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return '📱';
      case 'tablet':
        return '📲';
      case 'desktop':
        return '💻';
      default:
        return '📱';
    }
  };

  const handleRename = (device: Device) => {
    setEditingDevice(device.id);
    setEditName(device.name);
  };

  const handleSaveRename = async (deviceId: string) => {
    if (editName.trim()) {
      await dispatch(renameDevice({ deviceId, newName: editName.trim() }));
    }
    setEditingDevice(null);
    setEditName('');
  };

  const handleDisconnect = async (deviceId: string) => {
    if (confirm('Are you sure you want to disconnect this device?')) {
      await dispatch(disconnectDevice(deviceId));
    }
  };

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (devices.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📱</div>
        <p className={styles.emptyText}>No devices connected</p>
        <p className={styles.emptySubtext}>Your devices will appear here once connected</p>
      </div>
    );
  }

  return (
    <div className={styles.deviceListContainer}>
      <div className={styles.deviceListHeader}>
        <h3 className={styles.deviceListTitle}>Connected Devices</h3>
        <span className={styles.deviceCount}>{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={styles.devicesGrid}>
        {devices.map((device) => (
          <div
            key={device.id}
            className={`
              ${styles.deviceCard}
              ${selectedDeviceId === device.id ? styles.selected : ''}
              ${device.isCurrentDevice ? styles.current : ''}
            `}
            onClick={() => onSelectDevice?.(device)}
            role={onSelectDevice ? 'button' : undefined}
            tabIndex={onSelectDevice ? 0 : undefined}
          >
            <div className={styles.deviceIcon}>{getDeviceIcon(device.type)}</div>

            <div className={styles.deviceInfo}>
              {editingDevice === device.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleSaveRename(device.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(device.id);
                    if (e.key === 'Escape') setEditingDevice(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <h4 className={styles.deviceName}>{device.name}</h4>
                  <p className={styles.devicePlatform}>{device.platform}</p>
                </>
              )}

              <div className={styles.deviceMeta}>
                <span
                  className={`${styles.statusBadge} ${
                    device.isConnected ? styles.connected : styles.disconnected
                  }`}
                >
                  {device.isConnected ? 'Connected' : 'Offline'}
                </span>
                {device.isCurrentDevice && <span className={styles.currentBadge}>Current</span>}
                <span className={styles.lastActive}>{formatLastActive(device.lastActive)}</span>
              </div>
            </div>

            {showActions && !device.isCurrentDevice && (
              <div className={styles.deviceActions}>
                <button
                  className={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRename(device);
                  }}
                  title="Rename device"
                >
                  ✏️
                </button>
                <button
                  className={`${styles.actionButton} ${styles.danger}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnect(device.id);
                  }}
                  title="Disconnect device"
                >
                  🔌
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DeviceList;
