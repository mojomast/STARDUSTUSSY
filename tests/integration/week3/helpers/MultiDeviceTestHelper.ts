import { Browser, BrowserContext, Page } from '@playwright/test';

export interface DeviceConfig {
  name: string;
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor?: number;
}

export interface TestDevice {
  context: BrowserContext;
  page: Page;
  name: string;
  id: string;
}

export class MultiDeviceTestHelper {
  private browser: Browser;
  private devices: TestDevice[] = [];
  private deviceCounter = 0;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  async createDevice(config?: Partial<DeviceConfig>): Promise<TestDevice> {
    const defaultConfig: DeviceConfig = {
      name: `Device-${this.deviceCounter + 1}`,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Desktop Chrome',
      deviceScaleFactor: 1,
      ...config,
    };

    const context = await this.browser.newContext({
      viewport: defaultConfig.viewport,
      userAgent: defaultConfig.userAgent,
      deviceScaleFactor: defaultConfig.deviceScaleFactor,
    });

    const page = await context.newPage();
    const device: TestDevice = {
      context,
      page,
      name: defaultConfig.name,
      id: `device-${++this.deviceCounter}`,
    };

    this.devices.push(device);
    return device;
  }

  async createMobileDevice(name?: string): Promise<TestDevice> {
    return this.createDevice({
      name: name || 'Mobile Device',
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      deviceScaleFactor: 2,
    });
  }

  async createDesktopDevice(name?: string): Promise<TestDevice> {
    return this.createDevice({
      name: name || 'Desktop Device',
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
  }

  async createTabletDevice(name?: string): Promise<TestDevice> {
    return this.createDevice({
      name: name || 'Tablet Device',
      viewport: { width: 1024, height: 1366 },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
      deviceScaleFactor: 2,
    });
  }

  async createSession(device: TestDevice): Promise<string> {
    await device.page.goto('/');
    await device.page.waitForLoadState('networkidle');
    
    await device.page.click('[data-testid="create-session-btn"]');
    await device.page.waitForSelector('[data-testid="session-id"]', { timeout: 10000 });
    
    const sessionId = await device.page.locator('[data-testid="session-id"]').textContent();
    if (!sessionId) {
      throw new Error('Failed to create session - no session ID found');
    }
    
    return sessionId;
  }

  async getHandoffToken(device: TestDevice): Promise<string> {
    await device.page.click('[data-testid="handoff-btn"]');
    await device.page.waitForSelector('[data-testid="handoff-token"]', { timeout: 5000 });
    
    const token = await device.page.locator('[data-testid="handoff-token"]').textContent();
    if (!token) {
      throw new Error('Failed to get handoff token');
    }
    
    return token;
  }

  async joinSession(device: TestDevice, handoffToken: string): Promise<void> {
    await device.page.goto(`/?handoff=${handoffToken}`);
    await device.page.waitForLoadState('networkidle');
    await device.page.waitForSelector('[data-testid="session-connected"]', { timeout: 10000 });
  }

  async setState(device: TestDevice, value: string): Promise<void> {
    await device.page.fill('[data-testid="state-input"]', value);
    await device.page.click('[data-testid="save-state-btn"]');
    await device.page.waitForSelector('[data-testid="save-status"]:has-text("Saved")', { timeout: 5000 });
  }

  async getState(device: TestDevice): Promise<string> {
    return device.page.locator('[data-testid="state-input"]').inputValue();
  }

  async verifyStateSync(devices: TestDevice[], expectedValue: string, timeout = 5000): Promise<void> {
    for (const device of devices) {
      await device.page.waitForFunction(
        (expected) => {
          const input = document.querySelector('[data-testid="state-input"]') as HTMLInputElement;
          return input?.value === expected;
        },
        expectedValue,
        { timeout }
      );
    }
  }

  async disconnectDevice(device: TestDevice): Promise<void> {
    await device.context.setOffline(true);
  }

  async reconnectDevice(device: TestDevice): Promise<void> {
    await device.context.setOffline(false);
    await device.page.waitForSelector('[data-testid="connection-status"]:has-text(/connected/i)', { timeout: 15000 });
  }

  async closeDevice(device: TestDevice): Promise<void> {
    await device.context.close();
    this.devices = this.devices.filter(d => d.id !== device.id);
  }

  getDevices(): TestDevice[] {
    return [...this.devices];
  }

  async cleanup(): Promise<void> {
    for (const device of this.devices) {
      await device.context.close().catch(() => {});
    }
    this.devices = [];
    this.deviceCounter = 0;
  }

  async measureHandoffLatency(sourceDevice: TestDevice, targetDevice: TestDevice): Promise<number> {
    const handoffToken = await this.getHandoffToken(sourceDevice);
    
    const startTime = Date.now();
    await this.joinSession(targetDevice, handoffToken);
    const latency = Date.now() - startTime;
    
    return latency;
  }

  async simulateNetworkCondition(device: TestDevice, condition: 'offline' | 'slow' | 'fast'): Promise<void> {
    switch (condition) {
      case 'offline':
        await device.context.setOffline(true);
        break;
      case 'slow':
        await device.context.setOffline(false);
        // Simulate slow 3G
        await device.page.context().route('**/*', async (route) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          await route.continue();
        });
        break;
      case 'fast':
        await device.context.setOffline(false);
        await device.context.clearRoutes();
        break;
    }
  }
}
