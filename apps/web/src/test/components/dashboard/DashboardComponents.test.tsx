import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import MetricsCards from '../../../components/dashboard/MetricsCards';
import TimeRangeSelector from '../../../components/dashboard/TimeRangeSelector';
import AlertsPanel from '../../../components/dashboard/AlertsPanel';
import type { Alert, TimeRange } from '../types';

const mockAlerts: Alert[] = [
  {
    id: '1',
    type: 'warning',
    message: 'High reconnection failure rate detected',
    timestamp: new Date().toISOString(),
    resolved: false,
  },
  {
    id: '2',
    type: 'error',
    message: 'Session sync timeout',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    resolved: true,
  },
  {
    id: '3',
    type: 'info',
    message: 'Storage threshold reached',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    resolved: false,
  },
];

const createMockStore = (overrides = {}) => {
  return configureStore({
    reducer: {
      adminDashboard: () => ({
        activeSessions: {
          totalSessions: 42,
          activeDevices: 128,
          avgDevicesPerSession: 3.04,
          geographicDistribution: [],
        },
        reconnectionMetrics: {
          successRate: 0.95,
          failureRate: 0.05,
          avgReconnectionTime: 2500,
          backoffDistribution: [],
        },
        snapshotMetrics: {
          snapshotsPerHour: [],
          snapshotsPerDay: [],
          storageUsage: 15.5,
          storageLimit: 100,
          ttlExpiringToday: 12,
          ttlExpiringThisWeek: 89,
        },
        alerts: mockAlerts,
        timeRange: '24h' as TimeRange,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
        error: null,
        ...overrides,
      }),
      auth: () => ({
        token: 'test-token',
      }),
    },
  });
};

describe('MetricsCards', () => {
  it('renders metrics cards with correct values', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <MetricsCards />
      </Provider>
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
    expect(screen.getByText('15.50 GB')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const store = createMockStore({ isLoading: true });
    render(
      <Provider store={store}>
        <MetricsCards />
      </Provider>
    );

    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
  });

  it('displays change indicators', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <MetricsCards />
      </Provider>
    );

    expect(container.querySelector('.positive')).toBeInTheDocument();
    expect(container.querySelector('.negative')).toBeInTheDocument();
  });
});

describe('TimeRangeSelector', () => {
  it('renders time range buttons', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <TimeRangeSelector />
      </Provider>
    );

    expect(screen.getByText('1H')).toBeInTheDocument();
    expect(screen.getByText('24H')).toBeInTheDocument();
    expect(screen.getByText('7D')).toBeInTheDocument();
    expect(screen.getByText('30D')).toBeInTheDocument();
  });

  it('highlights active time range', () => {
    const store = createMockStore({ timeRange: '7d' });
    const { container } = render(
      <Provider store={store}>
        <TimeRangeSelector />
      </Provider>
    );

    const buttons = container.querySelectorAll('button');
    const activeButton = Array.from(buttons).find((btn) => btn.textContent === '7D');
    expect(activeButton).toHaveClass('active');
  });

  it('calls onChange when time range is selected', () => {
    const onChange = vi.fn();
    const store = createMockStore();
    render(
      <Provider store={store}>
        <TimeRangeSelector onChange={onChange} />
      </Provider>
    );

    fireEvent.click(screen.getByText('7D'));
    expect(onChange).toHaveBeenCalledWith('7d');
  });
});

describe('AlertsPanel', () => {
  it('renders list of alerts', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <AlertsPanel />
      </Provider>
    );

    expect(screen.getByText('High reconnection failure rate detected')).toBeInTheDocument();
    expect(screen.getByText('Session sync timeout')).toBeInTheDocument();
    expect(screen.getByText('Storage threshold reached')).toBeInTheDocument();
  });

  it('shows unresolved alert count badge', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <AlertsPanel />
      </Provider>
    );

    expect(screen.getByText('2')).toBeInTheDocument(); // 2 unresolved alerts
  });

  it('shows empty state when no alerts', () => {
    const store = createMockStore({ alerts: [] });
    render(
      <Provider store={store}>
        <AlertsPanel />
      </Provider>
    );

    expect(screen.getByText('No alerts to display')).toBeInTheDocument();
  });

  it('respects maxAlerts limit', () => {
    const manyAlerts = Array(20)
      .fill(null)
      .map((_, i) => ({
        id: `${i}`,
        type: 'info' as const,
        message: `Alert ${i}`,
        timestamp: new Date().toISOString(),
        resolved: false,
      }));

    const store = createMockStore({ alerts: manyAlerts });
    render(
      <Provider store={store}>
        <AlertsPanel maxAlerts={10} />
      </Provider>
    );

    expect(screen.getByText('Alert 0')).toBeInTheDocument();
    expect(screen.queryByText('Alert 15')).not.toBeInTheDocument();
  });
});
