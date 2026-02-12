import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { exportData } from '../../store/slices/adminDashboardSlice';
import type { ExportData } from '../../types/index.ts';
import styles from './ExportButton.module.css';

function ExportButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { timeRange, isLoading } = useSelector((state: RootState) => state.adminDashboard);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json'>('csv');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'sessions',
    'reconnections',
    'snapshots',
  ]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async () => {
    const exportConfig: ExportData = {
      format: selectedFormat,
      timeRange,
      metrics: selectedMetrics,
    };

    await dispatch(exportData(exportConfig));
    setIsOpen(false);
  };

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  };

  const formatOptions = [
    { value: 'csv', label: 'CSV', icon: '📊' },
    { value: 'json', label: 'JSON', icon: '📄' },
  ];

  const metricOptions = [
    { value: 'sessions', label: 'Session Metrics' },
    { value: 'reconnections', label: 'Reconnection Metrics' },
    { value: 'snapshots', label: 'Snapshot Metrics' },
    { value: 'alerts', label: 'Alerts' },
  ];

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.button}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
      >
        📥 Export {isLoading && '...'}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>Export Data</div>

          <div className={styles.dropdownSection}>
            <p className={styles.sectionTitle}>Format</p>
            {formatOptions.map((option) => (
              <button
                key={option.value}
                className={styles.option}
                onClick={() => setSelectedFormat(option.value as 'csv' | 'json')}
                style={{
                  background: selectedFormat === option.value ? '#eff6ff' : undefined,
                }}
              >
                <span className={styles.optionIcon}>{option.icon}</span>
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.dropdownSection}>
            <p className={styles.sectionTitle}>Metrics</p>
            {metricOptions.map((option) => (
              <button
                key={option.value}
                className={styles.option}
                onClick={() => toggleMetric(option.value)}
                style={{
                  background: selectedMetrics.includes(option.value) ? '#eff6ff' : undefined,
                }}
              >
                <span className={styles.optionIcon}>
                  {selectedMetrics.includes(option.value) ? '☑️' : '⬜'}
                </span>
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.dropdownFooter}>
            <button
              className={styles.exportButton}
              onClick={handleExport}
              disabled={selectedMetrics.length === 0 || isLoading}
            >
              {isLoading ? 'Exporting...' : `Export ${selectedMetrics.length} metric(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportButton;
