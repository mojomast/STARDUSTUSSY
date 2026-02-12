import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DeviceList from '../../../components/handoff/DeviceList';
import type { Device } from '../types';

const mockDevices: Device[] = [
  {
    id: '1',
    name: 'iPhone 15',
    type: 'mobile',
    platform: 'iOS 17',
    lastActive: new Date().toISOString(),
    isConnected: true,
    isCurrentDevice: true,
  },
  {
    id: '2',
    name: 'MacBook Pro',
    type: 'desktop',
    platform: 'macOS Sonoma',
    lastActive: new Date(Date.now() - 3600000).toISOString(),
    isConnected: true,
    isCurrentDevice: false,
  },
  {
    id: '3',
    name: 'iPad Air',
    type: 'tablet',
    platform: 'iPadOS 17',
    lastActive: new Date(Date.now() - 86400000).toISOString(),
    isConnected: false,
    isCurrentDevice: false,
  },
];

const createMockStore = (devices: Device[] = mockDevices) => {
  return configureStore({
    reducer: {
      session: () => ({
        devices,
        currentSession: null,
        connectionStatus: { connected: true, connecting: false, error: null, deviceId: null },
        isLoading: false,
        error: null,
      }),
    },
  });
};

describe('DeviceList', () => {
  it('renders empty state when no devices', () => {
    const store = createMockStore([]);
    render(
      <Provider store={store}>
        <DeviceList />
      </Provider>
    );

    expect(screen.getByText('No devices connected')).toBeInTheDocument();
  });

  it('renders list of devices', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <DeviceList />
      </Provider>
    );

    expect(screen.getByText('iPhone 15')).toBeInTheDocument();
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText('iPad Air')).toBeInTheDocument();
    expect(screen.getByText('3 devices')).toBeInTheDocument();
  });

  it('calls onSelectDevice when device is clicked', () => {
    const onSelectDevice = vi.fn();
    const store = createMockStore();
    render(
      <Provider store={store}>
        <DeviceList onSelectDevice={onSelectDevice} />
      </Provider>
    );

    fireEvent.click(screen.getByText('MacBook Pro'));
    expect(onSelectDevice).toHaveBeenCalledWith(mockDevices[1]);
  });

  it('highlights selected device', () => {
    const store = createMockStore();
    const { container } = render(
      <Provider store={store}>
        <DeviceList selectedDeviceId="2" />
      </Provider>
    );

    const deviceCards = container.querySelectorAll('[role="button"]');
    expect(deviceCards[1]).toHaveClass('selected');
  });

  it('shows current device badge', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <DeviceList />
      </Provider>
    );

    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('formats last active time correctly', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <DeviceList />
      </Provider>
    );

    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.getByText('1h ago')).toBeInTheDocument();
    expect(screen.getByText('1d ago')).toBeInTheDocument();
  });
});
