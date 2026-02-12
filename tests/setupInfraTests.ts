import { InfrastructureChecker } from './utils/infrastructureChecker';

let infraChecker: InfrastructureChecker;

beforeAll(async () => {
  console.log('Setting up infrastructure test environment...');
  
  infraChecker = new InfrastructureChecker({
    kubeconfig: process.env.KUBECONFIG,
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379'),
    postgresHost: process.env.POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.POSTGRES_PORT || '5432'),
    postgresUser: process.env.POSTGRES_USER || 'harmonyflow',
    postgresPassword: process.env.POSTGRES_PASSWORD || 'password',
    postgresDB: process.env.POSTGRES_DB || 'harmonyflow',
  });
});

afterAll(async () => {
  console.log('Tearing down infrastructure test environment...');
  await infraChecker?.close();
});

export { infraChecker };
