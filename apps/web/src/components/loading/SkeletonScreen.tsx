import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps): React.ReactElement {
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-sm',
    rounded: 'rounded-lg'
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: ''
  };

  const style = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined
  };

  return (
    <div
      className={`bg-gray-200 ${variantClasses[variant]} ${animationClasses[animation]} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

interface SkeletonScreenProps {
  type: 'dashboard' | 'sessions' | 'devices' | 'settings';
}

export function SkeletonScreen({ type }: SkeletonScreenProps): React.ReactElement {
  const renderDashboard = (): React.ReactElement => (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="circular" width={40} height={40} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow-sm">
            <Skeleton variant="text" width="60%" height={20} className="mb-4" />
            <Skeleton variant="text" width="40%" height={32} />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg shadow-sm p-6">
        <Skeleton variant="text" width="30%" height={24} className="mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton variant="text" width="40%" height={16} />
              <Skeleton variant="text" width="20%" height={16} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSessions = (): React.ReactElement => (
    <div className="space-y-4 p-6">
      <div className="flex justify-between items-center mb-6">
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rectangular" width={120} height={36} />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <Skeleton variant="circular" width={48} height={48} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="60%" height={16} />
              <Skeleton variant="text" width="40%" height={14} />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton variant="rectangular" width={80} height={32} />
            <Skeleton variant="rectangular" width={80} height={32} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderDevices = (): React.ReactElement => (
    <div className="space-y-4 p-6">
      <div className="flex justify-between items-center mb-6">
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rectangular" width={120} height={36} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1">
                <Skeleton variant="text" width="70%" height={16} />
                <Skeleton variant="text" width="50%" height={14} className="mt-1" />
              </div>
            </div>
            <Skeleton variant="text" width="30%" height={12} />
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = (): React.ReactElement => (
    <div className="space-y-6 p-6 max-w-2xl">
      <Skeleton variant="text" width={200} height={32} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white p-6 rounded-lg shadow-sm space-y-4">
          <Skeleton variant="text" width={150} height={20} />
          <div className="space-y-3">
            <Skeleton variant="text" width="100%" height={16} />
            <Skeleton variant="rectangular" width="60%" height={40} />
          </div>
        </div>
      ))}
    </div>
  );

  const screens: Record<string, () => React.ReactElement> = {
    dashboard: renderDashboard,
    sessions: renderSessions,
    devices: renderDevices,
    settings: renderSettings
  };

  return screens[type]();
}

export default SkeletonScreen;
