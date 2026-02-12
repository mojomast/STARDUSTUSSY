import { useSelector } from 'react-redux';
import type { RootState } from '../store/index.ts';
import styles from './ConnectionStatus.module.css';

function ConnectionStatus() {
  const { connectionStatus } = useSelector((state: RootState) => state.session);
  const { connected, connecting, error } = connectionStatus;

  let statusClass = styles.disconnected;
  let statusText = 'Disconnected';
  if (connected) {
    statusClass = styles.connected;
    statusText = 'Connected';
  } else if (connecting) {
    statusClass = styles.connecting;
    statusText = 'Connecting...';
  } else if (error) {
    statusClass = styles.error;
    statusText = 'Error';
  }

  return (
    <div className={styles.container}>
      <span className={`${styles.indicator} ${statusClass}`}></span>
      <span className={styles.text}>{statusText}</span>
      {error && <span className={styles.errorTooltip}>{error}</span>}
    </div>
  );
}

export default ConnectionStatus;
