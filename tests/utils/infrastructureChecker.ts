import { KubeConfig, CoreV1Api, AppsV1Api } from '@kubernetes/client-node';
import Redis from 'ioredis';
import { Client as PGClient } from 'pg';

export interface InfrastructureConfig {
  kubeconfig?: string;
  redisHost: string;
  redisPort: number;
  postgresHost: string;
  postgresPort: number;
  postgresUser: string;
  postgresPassword: string;
  postgresDB: string;
}

export interface K8sHealthStatus {
  namespace: string;
  pods: {
    name: string;
    status: string;
    ready: boolean;
    restarts: number;
  }[];
  deployments: {
    name: string;
    replicas: number;
    available: number;
    ready: boolean;
  }[];
}

export interface RedisHealthStatus {
  connected: boolean;
  info: {
    version: string;
    mode: string;
    connectedClients: number;
    usedMemory: string;
    uptimeInSeconds: number;
  };
  clusterNodes: number;
  replication: {
    role: string;
    connectedSlaves: number;
  };
}

export interface PostgresHealthStatus {
  connected: boolean;
  version: string;
  activeConnections: number;
  maxConnections: number;
  databaseSize: string;
  replicationLag?: number;
}

export class InfrastructureChecker {
  private k8sApi: CoreV1Api | null = null;
  private k8sAppsApi: AppsV1Api | null = null;
  private redis: Redis | null = null;
  private pgClient: PGClient | null = null;
  private config: InfrastructureConfig;

  constructor(config: InfrastructureConfig) {
    this.config = config;
  }

  private initializeK8s(): void {
    if (!this.k8sApi) {
      const kc = new KubeConfig();
      if (this.config.kubeconfig) {
        kc.loadFromFile(this.config.kubeconfig);
      } else {
        kc.loadFromDefault();
      }
      this.k8sApi = kc.makeApiClient(CoreV1Api);
      this.k8sAppsApi = kc.makeApiClient(AppsV1Api);
    }
  }

  private async getRedis(): Promise<Redis> {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
      });
    }
    return this.redis;
  }

  private async getPostgresClient(): Promise<PGClient> {
    if (!this.pgClient) {
      this.pgClient = new PGClient({
        host: this.config.postgresHost,
        port: this.config.postgresPort,
        user: this.config.postgresUser,
        password: this.config.postgresPassword,
        database: this.config.postgresDB,
        connectionTimeoutMillis: 5000,
      });
      await this.pgClient.connect();
    }
    return this.pgClient;
  }

  async checkKubernetesHealth(namespace: string = 'harmonyflow'): Promise<K8sHealthStatus> {
    this.initializeK8s();
    
    const podList = await this.k8sApi!.listNamespacedPod(namespace);
    const deploymentList = await this.k8sAppsApi!.listNamespacedDeployment(namespace);
    
    const pods = podList.body.items.map(pod => ({
      name: pod.metadata!.name!,
      status: pod.status!.phase!,
      ready: pod.status!.containerStatuses?.every(c => c.ready) || false,
      restarts: pod.status!.containerStatuses?.reduce((sum, c) => sum + (c.restartCount || 0), 0) || 0,
    }));
    
    const deployments = deploymentList.body.items.map(deployment => ({
      name: deployment.metadata!.name!,
      replicas: deployment.spec!.replicas || 0,
      available: deployment.status!.availableReplicas || 0,
      ready: deployment.status!.readyReplicas === deployment.spec!.replicas,
    }));
    
    return {
      namespace,
      pods,
      deployments,
    };
  }

  async checkRedisHealth(): Promise<RedisHealthStatus> {
    const redis = await this.getRedis();
    
    const info = await redis.info();
    const infoLines = info.split('\r\n');
    
    const parseInfo = (key: string): string => {
      const line = infoLines.find(l => l.startsWith(`${key}:`));
      return line ? line.split(':')[1] : '';
    };
    
    const clusterInfo = await redis.cluster('INFO').catch(() => null);
    const replicationInfo = await redis.info('replication');
    
    return {
      connected: redis.status === 'ready',
      info: {
        version: parseInfo('redis_version'),
        mode: parseInfo('redis_mode'),
        connectedClients: parseInt(parseInfo('connected_clients')) || 0,
        usedMemory: parseInfo('used_memory_human'),
        uptimeInSeconds: parseInt(parseInfo('uptime_in_seconds')) || 0,
      },
      clusterNodes: clusterInfo ? Object.keys(clusterInfo).length : 1,
      replication: {
        role: replicationInfo.includes('role:master') ? 'master' : 'slave',
        connectedSlaves: (replicationInfo.match(/slave\d+:/g) || []).length,
      },
    };
  }

  async checkPostgresHealth(): Promise<PostgresHealthStatus> {
    const client = await this.getPostgresClient();
    
    const versionResult = await client.query('SELECT version()');
    const connectionsResult = await client.query(
      "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'"
    );
    const maxConnectionsResult = await client.query('SHOW max_connections');
    const sizeResult = await client.query(
      "SELECT pg_size_pretty(pg_database_size(current_database())) as size"
    );
    
    // Check replication lag if applicable
    const replicationResult = await client.query(`
      SELECT 
        CASE 
          WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
          ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
        END AS lag_seconds
    `).catch(() => ({ rows: [{ lag_seconds: null }] }));
    
    return {
      connected: true,
      version: versionResult.rows[0].version,
      activeConnections: parseInt(connectionsResult.rows[0].count),
      maxConnections: parseInt(maxConnectionsResult.rows[0].max_connections),
      databaseSize: sizeResult.rows[0].size,
      replicationLag: replicationResult.rows[0].lag_seconds,
    };
  }

  async checkAll(): Promise<{
    kubernetes: K8sHealthStatus;
    redis: RedisHealthStatus;
    postgres: PostgresHealthStatus;
  }> {
    const [kubernetes, redis, postgres] = await Promise.all([
      this.checkKubernetesHealth(),
      this.checkRedisHealth(),
      this.checkPostgresHealth(),
    ]);
    
    return { kubernetes, redis, postgres };
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    
    if (this.pgClient) {
      await this.pgClient.end();
      this.pgClient = null;
    }
  }
}
