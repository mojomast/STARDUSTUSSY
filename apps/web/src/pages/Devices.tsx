import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import Layout from '../components/Layout';
import DeviceList from '../components/handoff/DeviceList';
import QRCodeDisplay from '../components/handoff/QRCodeDisplay';
import { setScanning } from '../store/slices/handoffSlice';
import type { Device } from '../types/index.ts';
import styles from './Devices.module.css';

function Devices() {
  const dispatch = useDispatch<AppDispatch>();
  const { currentSession } = useSelector((state: RootState) => state.session);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showQRDisplay, setShowQRDisplay] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
  };

  const handleScanQR = () => {
    setShowQRScanner(true);
    dispatch(setScanning(true));
  };

  const handleShowQR = () => {
    setShowQRDisplay(true);
  };

  const handleScanComplete = (data: string) => {
    setShowQRScanner(false);
    dispatch(setScanning(false));
    // Handle the scanned data
    console.log('Scanned QR code:', data);
  };

  return (
    <Layout>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1>Connected Devices</h1>
            <p className={styles.subtitle}>Manage your devices and transfer sessions</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.actionButton} onClick={handleShowQR}>
              📱 Show QR
            </button>
            <button className={styles.actionButton} onClick={handleScanQR}>
              📷 Scan QR
            </button>
          </div>
        </header>

        <DeviceList
          onSelectDevice={handleDeviceSelect}
          selectedDeviceId={selectedDevice?.id}
          showActions={true}
        />

        {selectedDevice && (
          <div className={styles.selectedDevice}>
            <h3>Selected Device</h3>
            <div className={styles.selectedDeviceCard}>
              <span className={styles.selectedIcon}>
                {selectedDevice.type === 'mobile' ? '📱' : selectedDevice.type === 'tablet' ? '📲' : '💻'}
              </span>
              <div className={styles.selectedInfo}>
                <p className={styles.selectedName}>{selectedDevice.name}</p>
                <p className={styles.selectedPlatform}>{selectedDevice.platform}</p>
              </div>
              <button className={styles.handoffButton}>
                Continue Here
              </button>
            </div>
          </div>
        )}

        {showQRScanner && (
          <div className={styles.modalOverlay} onClick={() => setShowQRScanner(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <QRCodeDisplay
                mode="scan"
                onScanComplete={handleScanComplete}
                onClose={() => setShowQRScanner(false)}
              />
            </div>
          </div>
        )}

        {showQRDisplay && (
          <div className={styles.modalOverlay} onClick={() => setShowQRDisplay(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <QRCodeDisplay
                mode="display"
                sessionId={currentSession?.sessionId}
                onClose={() => setShowQRDisplay(false)}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Devices;
