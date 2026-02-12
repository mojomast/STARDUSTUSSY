import { randomUUID } from 'crypto';
import { DatabaseHelper } from './database';

export interface TestUser {
  id?: string;
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
  createdAt?: Date;
}

export interface TestSession {
  id?: string;
  userId: string;
  deviceId: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  status: 'active' | 'inactive' | 'handing_off';
  createdAt?: Date;
  lastActivityAt?: Date;
}

export const TestUsers: Record<string, TestUser> = {
  standard: {
    name: 'Test User',
    email: 'test.user@harmonyflow.test',
    password: 'TestPassword123!',
    role: 'user',
  },
  admin: {
    name: 'Admin User',
    email: 'admin@harmonyflow.test',
    password: 'AdminPass123!',
    role: 'admin',
  },
  newUser: {
    name: 'New Test User',
    email: 'new.user@harmonyflow.test',
    password: 'NewUserPass123!',
    role: 'user',
  },
};

export async function createTestUser(
  db: DatabaseHelper,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  const uniqueId = randomUUID().slice(0, 8);
  const user: TestUser = {
    name: `Test User ${uniqueId}`,
    email: `test.${uniqueId}@harmonyflow.test`,
    password: 'TestPassword123!',
    role: 'user',
    ...overrides,
  };

  // Insert into test database
  const result = await db.query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, created_at`,
    [randomUUID(), user.name, user.email, await hashPassword(user.password), user.role]
  );

  user.id = result.rows[0].id;
  user.createdAt = result.rows[0].created_at;

  return user;
}

export async function cleanupTestUser(db: DatabaseHelper, email: string): Promise<void> {
  await db.query('DELETE FROM users WHERE email = $1', [email]);
  await db.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
  await db.query('DELETE FROM device_states WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
}

export async function createTestSession(
  db: DatabaseHelper,
  userId: string,
  overrides: Partial<TestSession> = {}
): Promise<TestSession> {
  const session: TestSession = {
    userId,
    deviceId: randomUUID(),
    deviceType: 'desktop',
    status: 'active',
    ...overrides,
  };

  const result = await db.query(
    `INSERT INTO sessions (id, user_id, device_id, device_type, status, created_at, last_activity_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, created_at, last_activity_at`,
    [randomUUID(), session.userId, session.deviceId, session.deviceType, session.status]
  );

  session.id = result.rows[0].id;
  session.createdAt = result.rows[0].created_at;
  session.lastActivityAt = result.rows[0].last_activity_at;

  return session;
}

export async function cleanupAllTestData(db: DatabaseHelper): Promise<void> {
  // Clean up in order to respect foreign key constraints
  await db.query("DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test')");
  await db.query("DELETE FROM snapshots WHERE session_id IN (SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test'))");
  await db.query("DELETE FROM session_deltas WHERE session_id IN (SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test'))");
  await db.query("DELETE FROM device_states WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test')");
  await db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test')");
  await db.query("DELETE FROM users WHERE email LIKE '%@harmonyflow.test'");
}

// Test data generators
export function generateUniqueEmail(prefix = 'test'): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@harmonyflow.test`;
}

export function generatePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function generateDeviceId(): string {
  return `device-${randomUUID().slice(0, 8)}`;
}

// Simple password hash for testing (in production, use bcrypt)
async function hashPassword(password: string): Promise<string> {
  // This is a mock hash - in real implementation, use proper hashing
  return `hashed_${password}`;
}

// Test state templates
export const TestStates = {
  dashboard: {
    currentView: 'dashboard',
    filters: {
      dateRange: 'last7days',
      status: 'all',
    },
    sortBy: 'lastActivity',
    sortOrder: 'desc',
  },
  sessionActive: {
    currentView: 'session',
    sessionId: null,
    state: {
      progress: 45,
      currentStep: 3,
      data: {},
    },
  },
  handoffInProgress: {
    currentView: 'handoff',
    sourceDevice: null,
    targetDevice: null,
    status: 'awaiting_confirmation',
  },
};
