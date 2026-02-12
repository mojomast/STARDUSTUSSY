// Test setup file
import 'jest';

// Mock WebSocket for Node.js environment
global.WebSocket = class WebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = WebSocket.CONNECTING;
  url = '';
  
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string): void {
    // Mock implementation
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code: 1000 } as CloseEvent);
  }
} as unknown as typeof WebSocket;

// Mock localStorage - make it writable so tests can reset
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'test-agent',
    language: 'en-US',
    platform: 'test-platform',
    hardwareConcurrency: 4,
    maxTouchPoints: 0,
  },
  writable: true,
  configurable: true,
});

// Mock screen
Object.defineProperty(global, 'screen', {
  value: {
    width: 1920,
    height: 1080,
    colorDepth: 24,
  },
  writable: true,
  configurable: true,
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    devicePixelRatio: 1,
    innerWidth: 1920,
    innerHeight: 1080,
  },
  writable: true,
  configurable: true,
});

// Mock Intl
Object.defineProperty(global, 'Intl', {
  value: {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: 'UTC' }),
    }),
  },
  writable: true,
  configurable: true,
});

// Mock btoa/atob for Node.js
global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
global.atob = jest.fn((str: string) => Buffer.from(str, 'base64').toString('binary'));

// Mock crypto
global.crypto = {
  randomUUID: jest.fn().mockReturnValue('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'),
} as unknown as typeof crypto;
