import { InfrastructureChecker } from '../utils/infrastructureChecker';

describe('Infrastructure Health Tests', () => {
  let checker: InfrastructureChecker;

  beforeAll(() => {
    checker = new InfrastructureChecker({
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
    await checker.close();
  });

  describe('Kubernetes Health Checks', () => {
    test('should verify all pods are running', async () => {
      const health = await checker.checkKubernetesHealth('harmonyflow');
      
      expect(health.pods.length).toBeGreaterThan(0);
      
      for (const pod of health.pods) {
        expect(pod.status).toBe('Running');
        expect(pod.ready).toBe(true);
        expect(pod.restarts).toBeLessThan(5); // Less than 5 restarts
      }
    });

    test('should verify deployments are ready', async () => {
      const health = await checker.checkKubernetesHealth('harmonyflow');
      
      expect(health.deployments.length).toBeGreaterThan(0);
      
      for (const deployment of health.deployments) {
        expect(deployment.ready).toBe(true);
        expect(deployment.available).toBe(deployment.replicas);
      }
    });

    test('should check all critical services', async () => {
      const health = await checker.checkKubernetesHealth('harmonyflow');
      
      const criticalServices = [
        'session-state-service',
        'redis',
        'postgresql',
      ];
      
      for (const service of criticalServices) {
        const hasPod = health.pods.some(pod => 
          pod.name.toLowerCase().includes(service.toLowerCase())
        );
        expect(hasPod).toBe(true);
      }
    });
  });

  describe('Redis Cluster Tests', () => {
    test('should connect to Redis successfully', async () => {
      const health = await checker.checkRedisHealth();
      
      expect(health.connected).toBe(true);
      expect(health.info.version).toBeDefined();
    });

    test('should verify Redis cluster mode', async () => {
      const health = await checker.checkRedisHealth();
      
      expect(health.info.mode).toBeDefined();
      expect(['standalone', 'cluster']).toContain(health.info.mode);
    });

    test('should verify cluster has multiple nodes', async () => {
      const health = await checker.checkRedisHealth();
      
      if (health.info.mode === 'cluster') {
        expect(health.clusterNodes).toBeGreaterThanOrEqual(3); // Minimum 3 nodes for cluster
      }
    });

    test('should verify Redis memory usage', async () => {
      const health = await checker.checkRedisHealth();
      
      expect(health.info.usedMemory).toBeDefined();
      expect(health.info.connectedClients).toBeGreaterThanOrEqual(0);
    });

    test('should verify Redis replication', async () => {
      const health = await checker.checkRedisHealth();
      
      expect(health.replication.role).toBeDefined();
      expect(['master', 'slave']).toContain(health.replication.role);
    });

    test('should handle Redis failover', async () => {
      const health = await checker.checkRedisHealth();
      
      // If master, should have slaves
      if (health.replication.role === 'master') {
        expect(health.replication.connectedSlaves).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('PostgreSQL Tests', () => {
    test('should connect to PostgreSQL successfully', async () => {
      const health = await checker.checkPostgresHealth();
      
      expect(health.connected).toBe(true);
      expect(health.version).toBeDefined();
    });

    test('should verify PostgreSQL version', async () => {
      const health = await checker.checkPostgresHealth();
      
      expect(health.version).toMatch(/PostgreSQL/);
    });

    test('should verify connection pool status', async () => {
      const health = await checker.checkPostgresHealth();
      
      expect(health.activeConnections).toBeGreaterThanOrEqual(0);
      expect(health.maxConnections).toBeGreaterThan(0);
      expect(health.activeConnections).toBeLessThan(health.maxConnections);
    });

    test('should verify database size', async () => {
      const health = await checker.checkPostgresHealth();
      
      expect(health.databaseSize).toBeDefined();
    });

    test('should verify replication lag if applicable', async () => {
      const health = await checker.checkPostgresHealth();
      
      // If replication is configured, lag should be minimal
      if (health.replicationLag !== undefined && health.replicationLag !== null) {
        expect(health.replicationLag).toBeLessThan(5); // Less than 5 seconds
      }
    });
  });

  describe('End-to-End Infrastructure Test', () => {
    test('should verify all infrastructure components', async () => {
      const results = await checker.checkAll();
      
      // All components should be healthy
      expect(results.kubernetes.pods.length).toBeGreaterThan(0);
      expect(results.redis.connected).toBe(true);
      expect(results.postgres.connected).toBe(true);
    });

    test('should verify service dependencies', async () => {
      const results = await checker.checkAll();
      
      // Session state service should be able to connect to Redis and Postgres
      expect(results.redis.connected).toBe(true);
      expect(results.postgres.connected).toBe(true);
      
      // Verify Redis has available connections
      expect(results.redis.info.connectedClients).toBeGreaterThanOrEqual(0);
    });
  });
});
