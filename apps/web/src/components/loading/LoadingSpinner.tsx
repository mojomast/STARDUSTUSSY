import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'gray';
  className?: string;
  label?: string;
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
  xl: 'w-16 h-16 border-4'
};

const colorClasses = {
  primary: 'border-blue-200 border-t-blue-600',
  secondary: 'border-purple-200 border-t-purple-600',
  success: 'border-green-200 border-t-green-600',
  warning: 'border-yellow-200 border-t-yellow-600',
  danger: 'border-red-200 border-t-red-600',
  gray: 'border-gray-200 border-t-gray-600'
};

export function LoadingSpinner({
  size = 'md',
  color = 'primary',
  className = '',
  label,
  fullScreen = false
}: LoadingSpinnerProps): React.ReactElement {
  const spinner = (
    <div
      className={`inline-block rounded-full animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`.trim()}
      role="status"
      aria-label={label || 'Loading'}
    >
      <span className="sr-only">{label || 'Loading'}</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-75 z-50"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-4">
          {spinner}
          {label && <p className="text-gray-600">{label}</p>}
        </div>
      </div>
    );
  }

  return label ? (
    <div className="flex flex-col items-center gap-2">
      {spinner}
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  ) : (
    spinner
  );
}

interface DotsLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
  label?: string;
}

export function DotsLoader({
  size = 'md',
  color = '#3b82f6',
  className = '',
  label
}: DotsLoaderProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-1 h-1',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  };

  return (
    <div className={`flex items-center gap-1 ${className}`} role="status" aria-label={label || 'Loading'}>
      <div className={`${sizeClasses[size]} rounded-full bg-current animate-bounce`} style={{ color, animationDelay: '0ms' }} />
      <div className={`${sizeClasses[size]} rounded-full bg-current animate-bounce`} style={{ color, animationDelay: '150ms' }} />
      <div className={`${sizeClasses[size]} rounded-full bg-current animate-bounce`} style={{ color, animationDelay: '300ms' }} />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

interface ProgressBarProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  className?: string;
  showLabel?: boolean;
  label?: string;
}

const progressSizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3'
};

const progressColorClasses = {
  primary: 'bg-blue-600',
  secondary: 'bg-purple-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-600',
  danger: 'bg-red-600'
};

export function ProgressBar({
  progress,
  size = 'md',
  color = 'primary',
  className = '',
  showLabel = false,
  label
}: ProgressBarProps): React.ReactElement {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full ${className}`} role="progressbar" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Loading progress'}>
      {showLabel && (
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{label || 'Loading'}</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${progressSizeClasses[size]}`}>
        <div
          className={`h-full ${progressColorClasses[color]} transition-all duration-300 ease-out`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

interface PulseLoaderProps {
  className?: string;
  label?: string;
}

export function PulseLoader({ className = '', label }: PulseLoaderProps): React.ReactElement {
  return (
    <div className={`flex space-x-1 ${className}`} role="status" aria-label={label || 'Loading'}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

export default LoadingSpinner;
