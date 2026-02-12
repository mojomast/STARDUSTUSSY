import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import styles from './StateRestorationAnimation.module.css';

interface StateRestorationAnimationProps {
  visible?: boolean;
}

function StateRestorationAnimation({ visible }: StateRestorationAnimationProps) {
  const { isRestoring, restorationProgress } = useSelector(
    (state: RootState) => state.sessionContinuity
  );

  const shouldShow = visible ?? isRestoring;

  if (!shouldShow) return null;

  const getStepStatus = (stepIndex: number) => {
    const threshold = (stepIndex + 1) * 25;
    if (restorationProgress >= threshold) return 'completed';
    if (restorationProgress >= threshold - 25) return 'active';
    return 'pending';
  };

  const steps = [
    { icon: '⬇️', label: 'Fetching' },
    { icon: '📦', label: 'Unpacking' },
    { icon: '🔧', label: 'Applying' },
    { icon: '✅', label: 'Ready' },
  ];

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.animation}>
          <div className={`${styles.circle} ${styles.outer}`} />
          <div className={`${styles.circle} ${styles.middle}`} />
          <div className={`${styles.circle} ${styles.inner}`} />
          <div className={styles.icon}>🔄</div>
          
          <div className={styles.particles}>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`${styles.particle} ${
                  i % 3 === 0 ? styles.blue : i % 3 === 1 ? styles.purple : styles.green
                }`}
                style={{
                  left: '50%',
                  top: '50%',
                  ['--end-x' as string]: `${Math.cos((i * Math.PI) / 3) * 100}px`,
                  ['--end-y' as string]: `${Math.sin((i * Math.PI) / 3) * 100}px`,
                }}
              />
            ))}
          </div>
        </div>

        <h2 className={styles.title}>Restoring Your Session</h2>
        <p className={styles.subtitle}>Please wait while we restore your previous state</p>

        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${restorationProgress}%` }}
            />
          </div>
          <div className={styles.progressInfo}>
            <span className={styles.progressLabel}>Restoring state...{/* Intentionally empty */}
            </span>
            <span className={styles.progressValue}>{Math.round(restorationProgress)}%</span>
          </div>
        </div>

        <div className={styles.steps}>
          {steps.map((step, index) => (
            <div
              key={step.label}
              className={`${styles.step} ${styles[getStepStatus(index)]}`}
            >
              <div className={styles.stepIcon}>{step.icon}</div>
              <span className={styles.stepLabel}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StateRestorationAnimation;
