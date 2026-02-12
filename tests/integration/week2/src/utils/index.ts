/**
 * Test Utilities for HarmonyFlow Integration Tests
 */

import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { JWTClaims, TestUser, MessageType, WebSocketMessage } from '../types';

const DEFAULT_JWT_SECRET = 'harmony-flow-secret-key';
const DEFAULT_REFRESH_SECRET = 'harmony-flow-refresh-secret-key';

/**
 * Generate a test JWT token
 */
export function generateTestToken(user: TestUser, expiresIn: string = '15m'): string {
  const claims: JWTClaims = {
    user_id: user.userId,
    email: user.email,
    device_id: user.deviceId,
    session_id: user.sessionId,
    exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(claims, DEFAULT_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Generate an expired test token
 */
export function generateExpiredToken(user: TestUser): string {
  const claims: JWTClaims = {
    user_id: user.userId,
    email: user.email,
    device_id: user.deviceId,
    session_id: user.sessionId,
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200,
  };

  return jwt.sign(claims, DEFAULT_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Generate an invalid test token
 */
export function generateInvalidToken(): string {
  return 'invalid.token.here';
}

/**
 * Create a test user with random IDs
 */
export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    userId: overrides?.userId || uuidv4(),
    email: overrides?.email || `test-${Date.now()}@example.com`,
    deviceId: overrides?.deviceId || uuidv4(),
    sessionId: overrides?.sessionId || uuidv4(),
  };
}

/**
 * Build a WebSocket message
 */
export function buildMessage(
  type: MessageType,
  payload: Record<string, unknown> = {},
  overrides?: Partial<WebSocketMessage>
): WebSocketMessage {
  return {
    type,
    timestamp: Math.floor(Date.now() / 1000),
    payload,
    ...overrides,
  };
}

/**
 * Wait for a specified duration
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a promise that resolves after a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await wait(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Validate message structure
 */
export function isValidMessage(obj: unknown): obj is WebSocketMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const msg = obj as Partial<WebSocketMessage>;
  return (
    typeof msg.type === 'number' &&
    typeof msg.timestamp === 'number' &&
    typeof msg.payload === 'object'
  );
}

/**
 * Generate unique test IDs
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}-${uuidv4().slice(0, 8)}-${Date.now()}`;
}

/**
 * Test configuration
 */
export const testConfig = {
  wsUrl: process.env.WS_URL || 'ws://localhost:8080/ws',
  apiUrl: process.env.API_URL || 'http://localhost:8080',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '10000', 10),
  messageTimeout: parseInt(process.env.MESSAGE_TIMEOUT || '5000', 10),
};

/**
 * Test metrics collector
 */
export class TestMetrics {
  private results: Array<{ name: string; passed: boolean; duration: number }> = [];

  record(name: string, passed: boolean, duration: number): void {
    this.results.push({ name, passed, duration });
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const successRate = total > 0 ? (passed / total) * 100 : 0;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      total,
      passed,
      failed,
      successRate: successRate.toFixed(2),
      totalDuration,
      averageDuration: total > 0 ? (totalDuration / total).toFixed(2) : '0',
    };
  }

  getFailedTests() {
    return this.results.filter((r) => !r.passed);
  }
}
