import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState, AppDispatch } from '../../store';
import { fetchRecentSessions } from '../../store/slices/sessionContinuitySlice';
import type { RecentSession } from '../../types/index.ts';
import styles from './RecentSessionsList.module.css';

interface RecentSessionsListProps {
  limit?: number;
  onResume?: (session: RecentSession) => void;
}

function RecentSessionsList({ limit = 5, onResume }: RecentSessionsListProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { recentSessions, isRestoring } = useSelector((state: RootState) => state.sessionContinuity);

  useEffect(() => {
    dispatch(fetchRecentSessions());
  }, [dispatch]);

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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const displaySessions = recentSessions.slice(0, limit);

  if (displaySessions.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h4 className={styles.title}>Recent Sessions</h4>
        </div>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <p className={styles.emptyText}>No recent sessions</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>Recent Sessions</h4>
        <Link to="/sessions" className={styles.viewAll}>
          View all →
        </Link>
      </div>

      <div className={styles.sessionList}>
        {displaySessions.map((session) => (
          <div
            key={session.id}
            className={styles.sessionItem}
            onClick={() => onResume?.(session)}
            role={onResume ? 'button' : undefined}
            tabIndex={onResume ? 0 : undefined}
          >
            <div className={styles.deviceIcon}>{getDeviceIcon(session.deviceType)}</div>

            <div className={styles.sessionInfo}>
              <p className={styles.sessionDevice}>{session.deviceName}</p>
              <div className={styles.sessionMeta}>
                <span className={styles.sessionTime}>{formatLastActive(session.lastActivity)}</span>
                <span className={styles.sessionSize}>{formatSize(session.snapshotSize)}</span>
              </div>
            </div>

            {onResume && (
              <button
                className={styles.resumeButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(session);
                }}
                disabled={isRestoring}
              >
                Resume
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecentSessionsList;
