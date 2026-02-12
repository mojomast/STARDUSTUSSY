import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import Layout from '../components/Layout';
import HandoffModal from '../components/handoff/HandoffModal';
import RecentSessionsList from '../components/session/RecentSessionsList';
import ResumePrompt from '../components/session/ResumePrompt';
import ConflictResolutionDialog from '../components/session/ConflictResolutionDialog';
import StateRestorationAnimation from '../components/session/StateRestorationAnimation';
import MetricsCards from '../components/dashboard/MetricsCards';
import TimeRangeSelector from '../components/dashboard/TimeRangeSelector';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import ExportButton from '../components/dashboard/ExportButton';
import { fetchDashboardMetrics, fetchAlerts } from '../store/slices/adminDashboardSlice';
import { fetchRecentSessions } from '../store/slices/sessionContinuitySlice';
import type { RecentSession } from '../types/index.ts';
import styles from './Dashboard.module.css';

function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { currentSession, devices } = useSelector((state: RootState) => state.session);
  const { alerts, timeRange } = useSelector((state: RootState) => state.adminDashboard);
  const [isHandoffModalOpen, setIsHandoffModalOpen] = useState(false);
  
  useWebSocket();

  useEffect(() => {
    dispatch(fetchDashboardMetrics(timeRange));
    dispatch(fetchAlerts());
    dispatch(fetchRecentSessions());

    // Set up periodic refresh
    const interval = setInterval(() => {
      dispatch(fetchDashboardMetrics(timeRange));
      dispatch(fetchAlerts());
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [dispatch, timeRange]);

  const handleResumeSession = (session: RecentSession) => {
    // Handle session resume
    console.log('Resuming session:', session);
  };

  const handleHandoff = () => {
    setIsHandoffModalOpen(true);
  };

  return (
    <Layout>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Welcome back, {user?.name || user?.email}!</h1>
          <p className={styles.subtitle}>
            Manage your sessions and devices across all your platforms
          </p>
        </header>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>📱</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{devices.length}</div>
              <div className={styles.statLabel}>Connected Devices</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🔗</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>
                {currentSession ? 'Active' : 'None'}
              </div>
              <div className={styles.statLabel}>Current Session</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🔄</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>Real-time</div>
              <div className={styles.statLabel}>Sync Status</div>
            </div>
          </div>
        </div>

        <section className={styles.section}>
          <h2>Quick Actions</h2>
          <div className={styles.actions}>
            <button className={styles.actionButton}>
              <span className={styles.actionIcon}>➕</span>
              New Session
            </button>
            <button className={styles.actionButton} onClick={handleHandoff}>
              <span className={styles.actionIcon}>📤</span>
              Handoff
            </button>
            <button className={styles.actionButton}>
              <span className={styles.actionIcon}>📊</span>
              View History
            </button>
            <button className={styles.actionButton}>
              <span className={styles.actionIcon}>⚙️</span>
              Settings
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Recent Sessions</h2>
          <RecentSessionsList limit={5} onResume={handleResumeSession} />
        </section>

        <section className={`${styles.section} ${styles.adminSection}`}>
          <div className={styles.adminHeader}>
            <h2>Admin Dashboard</h2>
            <div className={styles.adminControls}>
              <TimeRangeSelector />
              <ExportButton />
            </div>
          </div>
          <MetricsCards />
        </section>

        {alerts.length > 0 && (
          <section className={styles.section}>
            <AlertsPanel maxAlerts={10} />
          </section>
        )}

        {currentSession && (
          <section className={styles.section}>
            <h2>Current Session State</h2>
            <pre className={styles.code}>
              {JSON.stringify(currentSession.state, null, 2)}
            </pre>
          </section>
        )}
      </div>

      <HandoffModal
        isOpen={isHandoffModalOpen}
        onClose={() => setIsHandoffModalOpen(false)}
        sessionId={currentSession?.sessionId || ''}
      />

      <ResumePrompt />
      <ConflictResolutionDialog />
      <StateRestorationAnimation />
    </Layout>
  );
}

export default Dashboard;
