import { TestSession, TestDevice, HandoffToken } from './types';

export class TestDataGenerator {
  private counter = 0;

  generateId(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${++this.counter}`;
  }

  createSession(options: {
    deviceCount?: number;
    stateData?: Record<string, unknown>;
    expiresInMinutes?: number;
  } = {}): TestSession {
    const now = new Date();
    const expiresIn = options.expiresInMinutes || 60;
    
    return {
      id: this.generateId('session'),
      name: `Test Session ${this.counter}`,
      state: options.stateData || this.generateRandomState(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + expiresIn * 60 * 1000),
    };
  }

  generateRandomState(): Record<string, unknown> {
    return {
      text: `Test content ${this.counter}`,
      counter: Math.floor(Math.random() * 1000),
      enabled: Math.random() > 0.5,
      items: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        completed: Math.random() > 0.5,
      })),
      metadata: {
        created: new Date().toISOString(),
        version: '1.0',
        tags: ['test', 'automation'],
      },
    };
  }

  generateComplexState(): Record<string, unknown> {
    return {
      user: {
        id: this.generateId('user'),
        name: 'Test User',
        email: 'test@example.com',
        preferences: {
          theme: 'dark',
          notifications: true,
          language: 'en',
        },
      },
      workspace: {
        id: this.generateId('workspace'),
        name: 'Test Workspace',
        projects: [
          {
            id: this.generateId('project'),
            name: 'Project Alpha',
            tasks: Array.from({ length: 10 }, (_, i) => ({
              id: this.generateId('task'),
              title: `Task ${i + 1}`,
              status: ['todo', 'in-progress', 'done'][Math.floor(Math.random() * 3)],
              priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
            })),
          },
        ],
      },
      settings: {
        autoSave: true,
        syncInterval: 5000,
        offlineMode: false,
      },
      timestamp: Date.now(),
    };
  }

  createDevice(type: 'mobile' | 'tablet' | 'desktop' = 'desktop'): TestDevice {
    const configs: Record<string, Partial<TestDevice>> = {
      mobile: {
        type: 'mobile',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 375, height: 667 },
      },
      tablet: {
        type: 'tablet',
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 1024, height: 1366 },
      },
      desktop: {
        type: 'desktop',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1280, height: 720 },
      },
    };

    const config = configs[type];
    return {
      id: this.generateId('device'),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.counter}`,
      type,
      userAgent: config.userAgent!,
      viewport: config.viewport!,
    };
  }

  createHandoffToken(sessionId: string, deviceId: string): HandoffToken {
    const now = new Date();
    return {
      token: this.generateId('token'),
      sessionId,
      deviceId,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes
    };
  }

  generateStateChanges(count: number = 5): Array<{ path: string; value: unknown }> {
    const changes = [];
    for (let i = 0; i < count; i++) {
      changes.push({
        path: `field${i + 1}`,
        value: `value-${Date.now()}-${i}`,
      });
    }
    return changes;
  }

  generateSessionName(): string {
    const adjectives = ['Creative', 'Productive', 'Collaborative', 'Dynamic', 'Innovative'];
    const nouns = ['Session', 'Workspace', 'Project', 'Meeting', 'Sync'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun} ${this.counter}`;
  }

  generateNetworkConditions(): Array<'excellent' | 'good' | 'poor' | 'offline'> {
    return ['excellent', 'good', 'poor', 'offline'];
  }

  createBulkSessions(count: number): TestSession[] {
    return Array.from({ length: count }, () => this.createSession());
  }

  createBulkDevices(count: number, types: Array<'mobile' | 'tablet' | 'desktop'> = ['desktop']): TestDevice[] {
    return Array.from({ length: count }, (_, i) => {
      const type = types[i % types.length];
      return this.createDevice(type);
    });
  }
}
