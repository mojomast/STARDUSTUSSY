import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ResumePrompt from '../../../components/session/ResumePrompt';
import RecentSessionsList from '../../../components/session/RecentSessionsList';
import ConflictResolutionDialog from '../../../components/session/ConflictResolutionDialog';
import type { RecentSession, AppState } from '../types';

const mockRecentSession: RecentSession = {
  id: 'session-1',
  deviceName: 'iPhone 15',
  deviceType: 'mobile',
  lastActivity: new Date(Date.now() - 3600000).toISOString(),
  state: { view: 'dashboard', filters: { date: '2024-01-01' } },
  snapshotSize: 1024,
};

const createMockStore = (overrides = {}) => {
  return configureStore({
    reducer: {
      sessionContinuity: () => ({
        recentSessions: [mockRecentSession],
        pendingResume: mockRecentSession,
        showResumePrompt: true,
        isRestoring: false,
        restorationProgress: 0,
        conflictData: null,
        showConflictDialog: false,
        ...overrides,
      }),
      auth: () => ({
        token: 'test-token',
      }),
    },
  });
};

describe('ResumePrompt', () => {
  it('renders when there is a pending resume', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <ResumePrompt />
      </Provider>
    );

    expect(screen.getByText('Resume Previous Session?')).toBeInTheDocument();
    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
  });

  it('does not render when no pending resume', () => {
    const store = createMockStore({ pendingResume: null, showResumePrompt: false });
    const { container } = render(
      <Provider store={store}>
        <ResumePrompt />
      </Provider>
    );

    expect(container.firstChild).toBeNull();
  });

  it('displays session preview', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <ResumePrompt />
      </Provider>
    );

    expect(screen.getByText('Session State')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
  });
});

describe('RecentSessionsList', () => {
  it('renders list of recent sessions', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <RecentSessionsList />
      </Provider>
    );

    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
  });

  it('shows empty state when no sessions', () => {
    const store = createMockStore({ recentSessions: [] });
    render(
      <Provider store={store}>
        <RecentSessionsList />
      </Provider>
    );

    expect(screen.getByText('No recent sessions')).toBeInTheDocument();
  });

  it('limits sessions based on limit prop', () => {
    const sessions = Array(10)
      .fill(null)
      .map((_, i) => ({
        ...mockRecentSession,
        id: `session-${i}`,
        deviceName: `Device ${i}`,
      }));

    const store = createMockStore({ recentSessions: sessions });
    render(
      <Provider store={store}>
        <RecentSessionsList limit={5} />
      </Provider>
    );

    expect(screen.getByText('Device 0')).toBeInTheDocument();
    expect(screen.queryByText('Device 9')).not.toBeInTheDocument();
  });
});

describe('ConflictResolutionDialog', () => {
  const mockLocalState: AppState = { view: 'list', count: 10 };
  const mockRemoteState: AppState = { view: 'grid', count: 15 };

  it('renders when there is a conflict', () => {
    const store = createMockStore({
      showConflictDialog: true,
      conflictData: {
        localState: mockLocalState,
        remoteState: mockRemoteState,
        sessionId: 'session-1',
      },
    });
    render(
      <Provider store={store}>
        <ConflictResolutionDialog />
      </Provider>
    );

    expect(screen.getByText('Resolve State Conflict')).toBeInTheDocument();
    expect(screen.getByText('Current Device')).toBeInTheDocument();
    expect(screen.getByText('Other Device')).toBeInTheDocument();
  });

  it('shows differences between states', () => {
    const store = createMockStore({
      showConflictDialog: true,
      conflictData: {
        localState: mockLocalState,
        remoteState: mockRemoteState,
        sessionId: 'session-1',
      },
    });
    render(
      <Provider store={store}>
        <ConflictResolutionDialog />
      </Provider>
    );

    expect(screen.getByText('Differences Detected')).toBeInTheDocument();
  });

  it('does not render when no conflict', () => {
    const store = createMockStore({ showConflictDialog: false, conflictData: null });
    const { container } = render(
      <Provider store={store}>
        <ConflictResolutionDialog />
      </Provider>
    );

    expect(container.firstChild).toBeNull();
  });
});
