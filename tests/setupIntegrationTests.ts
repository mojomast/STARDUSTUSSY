import { TestDataManager } from './utils/testDataManager';
import { ServiceClient } from './utils/serviceClient';

let testDataManager: TestDataManager;
let serviceClient: ServiceClient;

beforeAll(async () => {
  console.log('Setting up integration test environment...');
  
  testDataManager = new TestDataManager();
  serviceClient = new ServiceClient({
    baseURL: process.env.API_BASE_URL || 'http://localhost:8080',
    wsURL: process.env.WS_URL || 'ws://localhost:8080/ws',
  });
  
  // Verify services are available
  await serviceClient.healthCheck();
});

afterAll(async () => {
  console.log('Tearing down integration test environment...');
  await testDataManager?.cleanup();
  await serviceClient?.close();
});

export { testDataManager, serviceClient };
