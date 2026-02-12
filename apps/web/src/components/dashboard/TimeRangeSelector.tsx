import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setTimeRange } from '../../store/slices/adminDashboardSlice';
import { fetchDashboardMetrics } from '../../store/slices/adminDashboardSlice';
import type { TimeRange } from '../../types/index.ts';
import styles from './TimeRangeSelector.module.css';

interface TimeRangeSelectorProps {
  onChange?: (range: TimeRange) => void;
}

function TimeRangeSelector({ onChange }: TimeRangeSelectorProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { timeRange } = useSelector((state: RootState) => state.adminDashboard);

  const ranges: { value: TimeRange; label: string }[] = [
    { value: '1h', label: '1H' },
    { value: '24h', label: '24H' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
  ];

  const handleChange = (range: TimeRange) => {
    dispatch(setTimeRange(range));
    dispatch(fetchDashboardMetrics(range));
    onChange?.(range);
  };

  return (
    <div className={styles.container}>
      <span className={styles.label}>Time Range:</span>
      <div className={styles.buttons}>
        {ranges.map((range) => (
          <button
            key={range.value}
            className={`${styles.button} ${timeRange === range.value ? styles.active : ''}`}
            onClick={() => handleChange(range.value)}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TimeRangeSelector;
