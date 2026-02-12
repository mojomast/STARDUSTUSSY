import { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { generateQRCode, scanQRCode, clearQRCode } from '../../store/slices/handoffSlice';
import styles from './QRCodeDisplay.module.css';

interface QRCodeDisplayProps {
  mode: 'display' | 'scan';
  sessionId?: string;
  onScanComplete?: (data: string) => void;
  onClose?: () => void;
}

function QRCodeDisplay({ mode, sessionId, onScanComplete, onClose }: QRCodeDisplayProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { qrCodeData, isLoading, error } = useSelector((state: RootState) => state.handoff);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes default

  useEffect(() => {
    if (mode === 'display' && sessionId) {
      dispatch(generateQRCode(sessionId));
    }

    return () => {
      dispatch(clearQRCode());
    };
  }, [mode, sessionId, dispatch]);

  useEffect(() => {
    if (mode === 'display' && qrCodeData) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            dispatch(generateQRCode(sessionId!));
            return 300;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [mode, qrCodeData, sessionId, dispatch]);

  const handleScan = useCallback(
    async (qrData: string) => {
      const result = await dispatch(scanQRCode(qrData));
      if (scanQRCode.fulfilled.match(result)) {
        onScanComplete?.(qrData);
      }
    },
    [dispatch, onScanComplete]
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateQRDataUrl = (data: string) => {
    // Simple QR code placeholder - in production, use a library like qrcode
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    canvas.width = 200;
    canvas.height = 200;

    // Background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 200);

    // Simple pattern representation
    ctx.fillStyle = 'black';
    const cellSize = 10;

    // Draw finder patterns (corners)
    const drawFinder = (x: number, y: number) => {
      ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = 'white';
      ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = 'black';
      ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize);
    };

    drawFinder(10, 10);
    drawFinder(130, 10);
    drawFinder(10, 130);

    // Draw data pattern (simplified)
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i);
      for (let j = 0; j < 8; j++) {
        if ((charCode >> j) & 1) {
          const x = 70 + ((i * 8 + j) % 12) * cellSize;
          const y = 70 + Math.floor((i * 8 + j) / 12) * cellSize;
          if (x < 190 && y < 190) {
            ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
          }
        }
      }
    }

    return canvas.toDataURL();
  };

  if (mode === 'scan') {
    return (
      <div className={styles.qrContainer}>
        <div className={styles.scannerContainer}>
          <div className={styles.scannerPlaceholder}>
            <span className={styles.scannerIcon}>📷</span>
            <span className={styles.scannerText}>Point camera at QR code</span>
          </div>
          <div className={styles.scannerFrame}>
            <div className={`${styles.scannerCorner} ${styles.tl}`} />
            <div className={`${styles.scannerCorner} ${styles.tr}`} />
            <div className={`${styles.scannerCorner} ${styles.bl}`} />
            <div className={`${styles.scannerCorner} ${styles.br}`} />
          </div>
        </div>

        <div className={styles.qrActions}>
          <input
            type="text"
            placeholder="Or enter code manually..."
            className={styles.qrButton}
            style={{ flex: 1, minWidth: '200px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleScan(e.currentTarget.value);
              }
            }}
          />
          <button className={`${styles.qrButton} ${styles.secondary}`} onClick={onClose}>
            Cancel
          </button>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}
      </div>
    );
  }

  return (
    <div className={styles.qrContainer}>
      <div className={styles.qrWrapper}>
        {isLoading ? (
          <div className={styles.qrPlaceholder}>⏳</div>
        ) : qrCodeData ? (
          <img
            src={generateQRDataUrl(qrCodeData)}
            alt="QR Code"
            className={styles.qrCode}
          />
        ) : (
          <div className={styles.qrPlaceholder}>❓</div>
        )}
      </div>

      <div className={styles.qrInstructions}>
        <h4 className={styles.qrTitle}>Scan to Connect</h4>
        <p className={styles.qrText}>
          Open SyncBridge on another device and scan this code to transfer your session
        </p>
      </div>

      {qrCodeData && (
        <div className={styles.expiresIn}>
          ⏱️ Expires in {formatTime(timeLeft)}
        </div>
      )}

      <div className={styles.qrActions}>
        <button
          className={`${styles.qrButton} ${styles.primary}`}
          onClick={() => sessionId && dispatch(generateQRCode(sessionId))}
          disabled={isLoading}
        >
          {isLoading ? 'Generating...' : '🔄 Regenerate'}
        </button>
        <button className={`${styles.qrButton} ${styles.secondary}`} onClick={onClose}>
          Close
        </button>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}
    </div>
  );
}

export default QRCodeDisplay;
