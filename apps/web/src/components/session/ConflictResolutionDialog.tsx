import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  resolveConflict,
  setShowConflictDialog,
} from '../../store/slices/sessionContinuitySlice';
import type { AppState } from '../../types/index.ts';
import styles from './ConflictResolutionDialog.module.css';

function ConflictResolutionDialog() {
  const dispatch = useDispatch<AppDispatch>();
  const { conflictData, showConflictDialog, isRestoring } = useSelector(
    (state: RootState) => state.sessionContinuity
  );

  const [selectedResolution, setSelectedResolution] = useState<'local' | 'remote' | 'merge' | null>(null);

  if (!showConflictDialog || !conflictData) return null;

  const { localState, remoteState, sessionId } = conflictData;

  const handleResolve = async () => {
    if (!selectedResolution) return;

    let mergedState: AppState | undefined;

    if (selectedResolution === 'merge') {
      // Simple merge strategy: combine both states with remote taking precedence for conflicts
      mergedState = { ...localState, ...remoteState };
    }

    await dispatch(
      resolveConflict({
        sessionId,
        resolution: selectedResolution,
        mergedState,
      })
    );
  };

  const handleClose = () => {
    dispatch(setShowConflictDialog(false));
  };

  const findDifferences = (local: AppState, remote: AppState): string[] => {
    const differences: string[] = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    allKeys.forEach((key) => {
      if (JSON.stringify(local[key]) !== JSON.stringify(remote[key])) {
        differences.push(key);
      }
    });

    return differences;
  };

  const differences = findDifferences(localState, remoteState);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Resolve State Conflict</h3>
          <button className={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.warning}>
            <p className={styles.warningText}>
              ⚠️ This session has been modified on another device. Please choose which state to keep.
            </p>
          </div>

          <div className={styles.compareGrid}>
            <div className={styles.statePanel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Current Device</span>
                <span className={`${styles.panelBadge} ${styles.local}`}>Local</span>
              </div>
              <div className={styles.panelContent}>
                <pre className={styles.stateCode}>{JSON.stringify(localState, null, 2)}</pre>
              </div>
            </div>

            <div className={styles.statePanel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Other Device</span>
                <span className={`${styles.panelBadge} ${styles.remote}`}>Remote</span>
              </div>
              <div className={styles.panelContent}>
                <pre className={styles.stateCode}>{JSON.stringify(remoteState, null, 2)}</pre>
              </div>
            </div>
          </div>

          {differences.length > 0 && (
            <div className={styles.differences}>
              <h4 className={styles.differencesTitle}>Differences Detected</h4>
              <ul className={styles.differenceList}>
                {differences.map((key) => (
                  <li key={key} className={styles.differenceItem}>
                    <span className={styles.differenceIcon}>⚡</span>
                    {key}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h4 className={styles.differencesTitle}>Choose Resolution</h4>
          <div className={styles.resolutionOptions}>
            <button
              className={`${styles.option} ${selectedResolution === 'local' ? styles.selected : ''}`}
              onClick={() => setSelectedResolution('local')}
            >
              <div className={styles.optionIcon}>💻</div>
              <h5 className={styles.optionTitle}>Keep Local</h5>
              <p className={styles.optionDescription}>Use current device state</p>
            </button>

            <button
              className={`${styles.option} ${selectedResolution === 'remote' ? styles.selected : ''}`}
              onClick={() => setSelectedResolution('remote')}
            >
              <div className={styles.optionIcon}>🌐</div>
              <h5 className={styles.optionTitle}>Keep Remote</h5>
              <p className={styles.optionDescription}>Use other device state</p>
            </button>

            <button
              className={`${styles.option} ${selectedResolution === 'merge' ? styles.selected : ''}`}
              onClick={() => setSelectedResolution('merge')}
            >
              <div className={styles.optionIcon}>🔀</div>
              <h5 className={styles.optionTitle}>Merge</h5>
              <p className={styles.optionDescription}>Combine both states</p>
            </button>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={`${styles.button} ${styles.secondary}`} onClick={handleClose}>
            Cancel
          </button>
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={handleResolve}
            disabled={!selectedResolution || isRestoring}
          >
            {isRestoring ? 'Resolving...' : 'Resolve Conflict'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionDialog;
