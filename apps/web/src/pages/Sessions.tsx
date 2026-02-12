import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import Layout from '../components/Layout';
import RecentSessionsList from '../components/session/RecentSessionsList';
import ResumePrompt from '../components/session/ResumePrompt';
import StateRestorationAnimation from '../components/session/StateRestorationAnimation';
import {
  fetchRecentSessions,
  resumeSession,
} from '../store/slices/sessionContinuitySlice';
import type { RecentSession } from '../types/index.ts';
import styles from './Sessions.module.css';

function Sessions() {
  const dispatch = useDispatch<AppDispatch>();
  const { recentSessions, isRestoring } = useSelector(
    (state: RootState) => state.sessionContinuity
  );
  const [selectedSession, setSelectedSession] = useState<RecentSession | null>(null);

  useEffect(() => {
    dispatch(fetchRecentSessions());
  }, [dispatch]);

  const handleResume = async (session: RecentSession) => {
    setSelectedSession(session);
    await dispatch(resumeSession(session.id));
  };



  return (
    <Layout>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Session Management</h1>
          <p className={styles.subtitle}>View and manage your active and recent sessions</p>
        </header>

        <div className={styles.grid}>
          <div className={styles.mainColumn}>
            <section className={styles.section}>
              <h2>Recent Sessions</h2>
              <RecentSessionsList limit={10} onResume={handleResume} />
            </section>

            {recentSessions.length > 0 && (
              <section className={styles.section}>
                <h2>Session Statistics</h2>
                <div className={styles.stats}>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{recentSessions.length}</span>
                    <span className={styles.statLabel}>Total Sessions</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>
                      {(
                        recentSessions.reduce((acc, s) => acc + s.snapshotSize, 0) /
                        1024 /
                        1024
                      ).toFixed(2)}
                      MB
                    </span>
                    <span className={styles.statLabel}>Total Data</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>
                      {new Set(recentSessions.map((s) => s.deviceType)).size}
                    </span>
                    <span className={styles.statLabel}>Device Types</span>
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className={styles.sideColumn}>
            {selectedSession && (
              <section className={`${styles.section} ${styles.previewSection}`}>
                <h2>Session Preview</h2>
                <div className={styles.previewCard}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewIcon}>
                      {selectedSession.deviceType === 'mobile'
                        ? '📱'
                        : selectedSession.deviceType === 'tablet'
                        ? '📲'
                        : '💻'}
                    </span>
                    <div className={styles.previewInfo}>
                      <p className={styles.previewName}>{selectedSession.deviceName}</p>
                      <p className={styles.previewMeta}>
                        {new Date(selectedSession.lastActivity).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {selectedSession.state && (
                    <div className={styles.previewState}>
                      <p className={styles.previewLabel}>Session State</p>
                      <pre className={styles.previewCode}>
                        {JSON.stringify(selectedSession.state, null, 2).slice(0, 500)}
                        {JSON.stringify(selectedSession.state, null, 2).length > 500 && '...'}
                      </pre>
                    </div>
                  )}

                  <button
                    className={styles.resumeButton}
                    onClick={() => handleResume(selectedSession)}
                    disabled={isRestoring}
                  >
                    {isRestoring ? '⏳ Resuming...' : '🔄 Resume This Session'}
                  </button>
                </div>
              </section>
            )}

            <section className={styles.section}>
              <h2>Quick Tips</h2>
              <ul className={styles.tips}>
                <li>Sessions are automatically saved every 30 seconds</li>
                <li>You can resume sessions from any connected device</li>
                <li>Inactive sessions expire after 30 days</li>
                <li>Use handoff to transfer sessions between devices</li>
              </ul>
            </section>
          </div>
        </div>
      </div>

      <ResumePrompt />
      <StateRestorationAnimation />
    </Layout>
  );
}

export default Sessions;
