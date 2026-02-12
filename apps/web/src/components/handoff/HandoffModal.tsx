import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  initiateHandoff,
  cancelHandoff,
  updateHandoffProgress,
  setActiveHandoff,
  clearHandoffError,
} from '../../store/slices/handoffSlice';
import type { Device } from '../../types/index.ts';
import DeviceList from './DeviceList';
import QRCodeDisplay from './QRCodeDisplay';
import styles from './HandoffModal.module.css';

interface HandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

type HandoffStep = 'select' | 'method' | 'qr' | 'confirm' | 'transfer' | 'complete';

function HandoffModal({ isOpen, onClose, sessionId }: HandoffModalProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { activeHandoff, isLoading, error } = useSelector((state: RootState) => state.handoff);

  const [step, setStep] = useState<HandoffStep>('select');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [transferMethod, setTransferMethod] = useState<'device' | 'qr'>('device');

  const simulateProgress = useCallback(() => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        dispatch(updateHandoffProgress(100));
        setTimeout(() => {
          if (activeHandoff) {
            dispatch(setActiveHandoff({ ...activeHandoff, status: 'completed', progress: 100 }));
          }
        }, 500);
      } else {
        dispatch(updateHandoffProgress(Math.floor(progress)));
      }
    }, 500);
  }, [activeHandoff, dispatch]);

  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setSelectedDevice(null);
      setTransferMethod('device');
      dispatch(clearHandoffError());
    }
  }, [isOpen, dispatch]);

  useEffect(() => {
    if (activeHandoff) {
      if (activeHandoff.status === 'completed') {
        setStep('complete');
      } else if (activeHandoff.status === 'in_progress') {
        setStep('transfer');
        simulateProgress();
      }
    }
  }, [activeHandoff, simulateProgress]);

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
    setStep('method');
  };

  const handleMethodSelect = (method: 'device' | 'qr') => {
    setTransferMethod(method);
    if (method === 'qr') {
      setStep('qr');
    } else {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    if (selectedDevice) {
      await dispatch(
        initiateHandoff({
          targetDeviceId: selectedDevice.id,
          sessionId,
        })
      );
      setStep('transfer');
      simulateProgress();
    }
  };

  const handleCancel = async () => {
    if (activeHandoff) {
      await dispatch(cancelHandoff(activeHandoff.id));
    }
    onClose();
  };



  if (!isOpen) return null;

  const renderStepIndicator = () => (
    <div className={styles.stepIndicator}>
      {['select', 'method', 'confirm', 'transfer'].map((s, i) => (
        <div
          key={s}
          className={`
            ${styles.step}
            ${step === s ? styles.active : ''}
            ${['transfer', 'complete'].includes(step) && i < 3 ? styles.completed : ''}
          `}
        >
          {['transfer', 'complete'].includes(step) && i < 3 ? '✓' : i + 1}
        </div>
      ))}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 'select':
        return (
          <div className={styles.deviceSelection}>
            <h4 className={styles.selectionTitle}>Select target device</h4>
            <DeviceList onSelectDevice={handleDeviceSelect} showActions={false} />
          </div>
        );

      case 'method':
        return (
          <div>
            <h4 className={styles.selectionTitle}>Choose transfer method</h4>
            <div className={styles.transferMethod}>
              <button
                className={`${styles.methodCard} ${transferMethod === 'device' ? styles.selected : ''}`}
                onClick={() => handleMethodSelect('device')}
              >
                <div className={styles.methodIcon}>📡</div>
                <h5 className={styles.methodTitle}>Direct Transfer</h5>
                <p className={styles.methodDescription}>Send to selected device</p>
              </button>
              <button
                className={`${styles.methodCard} ${transferMethod === 'qr' ? styles.selected : ''}`}
                onClick={() => handleMethodSelect('qr')}
              >
                <div className={styles.methodIcon}>📷</div>
                <h5 className={styles.methodTitle}>QR Code</h5>
                <p className={styles.methodDescription}>Scan with another device</p>
              </button>
            </div>
          </div>
        );

      case 'qr':
        return <QRCodeDisplay mode="display" sessionId={sessionId} onClose={() => setStep('method')} />;

      case 'confirm':
        return (
          <div className={styles.confirmationContent}>
            <div className={styles.confirmationIcon}>📤</div>
            <h4 className={styles.confirmationTitle}>Ready to Transfer</h4>
            <p className={styles.confirmationText}>
              Your current session state will be transferred to the selected device
            </p>

            {selectedDevice && (
              <div className={styles.devicePreview}>
                <p className={styles.previewLabel}>Target Device</p>
                <div className={styles.previewDevice}>
                  <span className={styles.previewIcon}>
                    {selectedDevice.type === 'mobile' ? '📱' : selectedDevice.type === 'tablet' ? '📲' : '💻'}
                  </span>
                  <div className={styles.previewInfo}>
                    <p className={styles.previewName}>{selectedDevice.name}</p>
                    <p className={styles.previewPlatform}>{selectedDevice.platform}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'transfer':
        return (
          <div className={styles.statusMessage}>
            <div className={styles.statusIcon}>🔄</div>
            <h4 className={styles.statusTitle}>Transferring Session</h4>

            <div className={styles.progressContainer}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${activeHandoff?.progress || 0}%` }}
                />
              </div>
              <div className={styles.progressInfo}>
                <span className={styles.progressLabel}>Transferring state...</span>
                <span className={styles.progressValue}>{activeHandoff?.progress || 0}%</span>
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className={styles.statusMessage}>
            <div className={styles.statusIcon}>✅</div>
            <h4 className={styles.statusTitle}>Transfer Complete!</h4>
            <p className={styles.statusText}>
              Your session has been successfully transferred. You can now continue on your other device.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'select':
        return 'Continue on Another Device';
      case 'method':
        return 'Choose Transfer Method';
      case 'qr':
        return 'Scan QR Code';
      case 'confirm':
        return 'Confirm Transfer';
      case 'transfer':
        return 'Transfer in Progress';
      case 'complete':
        return 'Transfer Complete';
      default:
        return 'Handoff';
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{getStepTitle()}</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.modalContent}>
          {step !== 'qr' && step !== 'complete' && renderStepIndicator()}
          {renderStep()}
          {error && <div className={styles.errorMessage}>{error}</div>}
        </div>

        <div className={styles.modalFooter}>
          {step === 'select' && (
            <button className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
          )}

          {step === 'method' && (
            <>
              <button className={styles.secondaryButton} onClick={() => setStep('select')}>
                Back
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => setStep('confirm')}
                disabled={!transferMethod}
              >
                Continue
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button className={styles.secondaryButton} onClick={() => setStep('method')}>
                Back
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? 'Starting...' : 'Start Transfer'}
              </button>
            </>
          )}

          {step === 'transfer' && (
            <button className={styles.dangerButton} onClick={handleCancel}>
              Cancel Transfer
            </button>
          )}

          {step === 'complete' && (
            <button className={styles.primaryButton} onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default HandoffModal;
