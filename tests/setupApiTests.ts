import { ServiceClient } from './utils/serviceClient';

let serviceClient: ServiceClient;

beforeAll(async () => {
  console.log('Setting up API test environment...');
  
  serviceClient = new ServiceClient({
    baseURL: process.env.API_BASE_URL || 'http://localhost:8080',
    wsURL: process.env.WS_URL || 'ws://localhost:8080/ws',
  });
  
  // Verify API is available
  const health = await serviceClient.healthCheck();
  if (!health.healthy) {
    throw new Error('API health check failed');
  }
});

afterAll(async () => {
  console.log('Tearing down API test environment...');
  await serviceClient?.close();
});

export { serviceClient };
