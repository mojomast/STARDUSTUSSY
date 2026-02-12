import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { resumeSession, dismissResumePrompt } from '../../store/slices/sessionContinuitySlice';
import styles from './ResumePrompt.module.css';

function ResumePrompt() {
  const dispatch = useDispatch<AppDispatch>();
  const { pendingResume, isRestoring } = useSelector((state: RootState) => state.sessionContinuity);

  if (!pendingResume) return null;

  const handleResume = async () => {
    await dispatch(resumeSession(pendingResume.id));
  };

  const handleDismiss = () => {
    dispatch(dismissResumePrompt());
  };

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${days} days ago`;
  };

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

  return (
    <div className={styles.promptOverlay}>
      <div className={styles.prompt}>
        <div className={styles.promptIcon}>🔄</div>
        <h3 className={styles.promptTitle}>Resume Previous Session?</h3>
        <p className={styles.promptText}>
          We found an active session from another device. Would you like to continue where you left off?
        </p>

        <div className={styles.sessionPreview}>
          <div className={styles.previewHeader}>
            <span className={styles.previewDeviceIcon}>{getDeviceIcon(pendingResume.deviceType)}</span>
            <div className={styles.previewDeviceInfo}>
              <p className={styles.previewDeviceName}>{pendingResume.deviceName}</p>
              <p className={styles.previewDeviceMeta}>Last active {formatLastActive(pendingResume.lastActivity)}</p>
            </div>
          </div>

          {pendingResume.state && Object.keys(pendingResume.state).length > 0 && (
            <div className={styles.previewState}>
              <p className={styles.previewStateLabel}>Session State</p>
              <pre className={styles.previewStateContent}>
                {JSON.stringify(pendingResume.state, null, 2).slice(0, 200)}
                {JSON.stringify(pendingResume.state, null, 2).length > 200 && '...'}
              </pre>
            </div>
          )}

          <div className={styles.previewStats}>
            <div className={styles.previewStat}>
              <span className={styles.previewStatValue}>
                {(pendingResume.snapshotSize / 1024).toFixed(1)} KB
              </span>
              <span className={styles.previewStatLabel}>Data size</span>
            </div>
          </div>
        </div>

        <div className={styles.promptActions}>
          <button
            className={`${styles.promptButton} ${styles.secondary}`}
            onClick={handleDismiss}
            disabled={isRestoring}
          >
            Start Fresh
          </button>
          <button
            className={`${styles.promptButton} ${styles.primary}`}
            onClick={handleResume}
            disabled={isRestoring}
          >
            {isRestoring ? '⏳ Restoring...' : '✨ Resume Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResumePrompt;
