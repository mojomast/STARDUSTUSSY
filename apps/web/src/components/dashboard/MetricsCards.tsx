import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { DashboardMetric } from '../../types/index.ts';
import styles from './MetricsCards.module.css';

interface MetricsCardsProps {
  metrics?: DashboardMetric[];
}

function MetricsCards({ metrics }: MetricsCardsProps) {
  const { activeSessions, reconnectionMetrics, snapshotMetrics, isLoading } = useSelector(
    (state: RootState) => state.adminDashboard
  );

  const getChangeIcon = (change: number) => {
    if (change > 0) return '↑';
    if (change < 0) return '↓';
    return '→';
  };

  const getChangeClass = (change: number) => {
    if (change > 0) return styles.positive;
    if (change < 0) return styles.negative;
    return styles.neutral;
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === '%') return `${value.toFixed(1)}%`;
    if (unit === 'ms') return `${value.toFixed(0)}ms`;
    if (unit === 'GB') return `${value.toFixed(2)} GB`;
    return value.toLocaleString();
  };

  const renderSparkline = (dataPoints: { value: number }[]) => {
    if (!dataPoints || dataPoints.length === 0) return null;

    const max = Math.max(...dataPoints.map((d) => d.value));
    const min = Math.min(...dataPoints.map((d) => d.value));
    const range = max - min || 1;

    return (
      <div className={styles.chart}>
        {dataPoints.slice(-20).map((point, i) => (
          <div
            key={i}
            className={styles.chartBar}
            style={{
              height: `${((point.value - min) / range) * 100}%`,
              opacity: 0.3 + (i / dataPoints.length) * 0.7,
            }}
          />
        ))}
      </div>
    );
  };

  const defaultMetrics: DashboardMetric[] = [
    {
      name: 'Active Sessions',
      value: activeSessions.totalSessions,
      change: 12.5,
      unit: '',
      dataPoints: [],
    },
    {
      name: 'Connected Devices',
      value: activeSessions.activeDevices,
      change: 8.3,
      unit: '',
      dataPoints: [],
    },
    {
      name: 'Reconnection Rate',
      value: reconnectionMetrics.successRate * 100,
      change: -2.1,
      unit: '%',
      dataPoints: [],
    },
    {
      name: 'Storage Used',
      value: snapshotMetrics.storageUsage,
      change: 15.7,
      unit: 'GB',
      dataPoints: [],
    },
  ];

  const displayMetrics = metrics || defaultMetrics;

  const getIcon = (name: string) => {
    if (name.includes('Session')) return '🔗';
    if (name.includes('Device')) return '📱';
    if (name.includes('Reconnection')) return '🔄';
    if (name.includes('Storage')) return '💾';
    return '📊';
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.grid}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.card} style={{ opacity: 0.5 }}>
              <div className={styles.header}>
                <div className={styles.icon}>⏳</div>
              </div>
              <p className={styles.value}>--</p>
              <p className={styles.label}>Loading...</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {displayMetrics.map((metric) => (
          <div key={metric.name} className={styles.card}>
            <div className={styles.header}>
              <div className={`${styles.icon} ${styles[metric.name.toLowerCase().replace(/\s+/g, '')]}`}>
                {getIcon(metric.name)}
              </div>
              <span className={`${styles.change} ${getChangeClass(metric.change)}`}>
                {getChangeIcon(metric.change)} {Math.abs(metric.change).toFixed(1)}%
              </span>
            </div>
            <p className={styles.value}>{formatValue(metric.value, metric.unit)}</p>
            <p className={styles.label}>{metric.name}</p>
            {renderSparkline(metric.dataPoints)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MetricsCards;
