import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { resolveAlert, removeAlert, fetchAlerts } from '../../store/slices/adminDashboardSlice';
import type { Alert } from '../../types/index.ts';
import styles from './AlertsPanel.module.css';

interface AlertsPanelProps {
  maxAlerts?: number;
}

function AlertsPanel({ maxAlerts = 50 }: AlertsPanelProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { alerts, isLoading } = useSelector((state: RootState) => state.adminDashboard);

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'error':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'success':
        return '🟢';
      case 'info':
      default:
        return '🔵';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
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

  const handleResolve = async (alertId: string) => {
    await dispatch(resolveAlert(alertId));
  };

  const handleDismiss = (alertId: string) => {
    dispatch(removeAlert(alertId));
  };

  const handleRefresh = () => {
    dispatch(fetchAlerts());
  };

  const displayAlerts = alerts.slice(0, maxAlerts);
  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          🔔 Alerts
          {unresolvedCount > 0 && <span className={styles.badge}>{unresolvedCount}</span>}
        </h3>
        <div className={styles.actions}>
          <button className={styles.actionButton} onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {displayAlerts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✅</div>
            <p className={styles.emptyText}>No alerts to display</p>
          </div>
        ) : (
          displayAlerts.map((alert) => (
            <div key={alert.id} className={`${styles.alert} ${alert.resolved ? styles.resolved : ''}`}>
              <div className={`${styles.icon} ${styles[alert.type]}`}>{getAlertIcon(alert.type)}</div>

              <div className={styles.content}>
                <p className={styles.message}>{alert.message}</p>
                <div className={styles.meta}>
                  <span className={`${styles.type} ${styles[alert.type]}`}>{alert.type}</span>
                  <span className={styles.timestamp}>🕐 {formatTimestamp(alert.timestamp)}</span>
                </div>
              </div>

              <div className={styles.actionsCol}>
                {!alert.resolved && (
                  <button
                    className={styles.alertAction}
                    onClick={() => handleResolve(alert.id)}
                    title="Mark as resolved"
                  >
                    ✓
                  </button>
                )}
                <button
                  className={styles.alertAction}
                  onClick={() => handleDismiss(alert.id)}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertsPanel;
