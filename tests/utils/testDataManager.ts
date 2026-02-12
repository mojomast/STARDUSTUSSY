import Redis from 'ioredis';
import { Pool, Client as PGClient } from 'pg';

export interface TestDataManagerConfig {
  redisHost?: string;
  redisPort?: number;
  postgresHost?: string;
  postgresPort?: number;
  postgresUser?: string;
  postgresPassword?: string;
  postgresDB?: string;
}

export interface TestSnapshot {
  sessionId: string;
  userId: string;
  stateData: Record<string, unknown>;
  createdAt?: Date;
  expiresAt?: Date;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  createdAt?: Date;
}

export class TestDataManager {
  private redis: Redis | null = null;
  private pgPool: Pool | null = null;
  private createdSnapshots: string[] = [];
  private createdUsers: string[] = [];
  private config: TestDataManagerConfig;

  constructor(config: TestDataManagerConfig = {}) {
    this.config = {
      redisHost: config.redisHost || 'localhost',
      redisPort: config.redisPort || 6379,
      postgresHost: config.postgresHost || 'localhost',
      postgresPort: config.postgresPort || 5432,
      postgresUser: config.postgresUser || 'harmonyflow',
      postgresPassword: config.postgresPassword || 'password',
      postgresDB: config.postgresDB || 'harmonyflow',
    };
  }

  private async getRedis(): Promise<Redis> {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.config.redisHost,
        port: this.config.redisPort,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });
    }
    return this.redis;
  }

  private async getPostgresPool(): Promise<Pool> {
    if (!this.pgPool) {
      this.pgPool = new Pool({
        host: this.config.postgresHost,
        port: this.config.postgresPort,
        user: this.config.postgresUser,
        password: this.config.postgresPassword,
        database: this.config.postgresDB,
      });
    }
    return this.pgPool;
  }

  async createTestSnapshot(snapshot: TestSnapshot): Promise<void> {
    const redis = await this.getRedis();
    const key = `session:${snapshot.sessionId}`;
    
    await redis.setex(
      key,
      3600, // 1 hour TTL
      JSON.stringify({
        session_id: snapshot.sessionId,
        user_id: snapshot.userId,
        state_data: snapshot.stateData,
        created_at: snapshot.createdAt?.toISOString() || new Date().toISOString(),
        expires_at: snapshot.expiresAt?.toISOString() || new Date(Date.now() + 3600000).toISOString(),
      })
    );
    
    this.createdSnapshots.push(key);
  }

  async getTestSnapshot(sessionId: string): Promise<TestSnapshot | null> {
    const redis = await this.getRedis();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    return {
      sessionId: parsed.session_id,
      userId: parsed.user_id,
      stateData: parsed.state_data,
      createdAt: new Date(parsed.created_at),
      expiresAt: new Date(parsed.expires_at),
    };
  }

  async deleteTestSnapshot(sessionId: string): Promise<void> {
    const redis = await this.getRedis();
    const key = `session:${sessionId}`;
    await redis.del(key);
    
    const index = this.createdSnapshots.indexOf(key);
    if (index > -1) {
      this.createdSnapshots.splice(index, 1);
    }
  }

  async createTestUser(user: TestUser): Promise<void> {
    const pool = await this.getPostgresPool();
    
    await pool.query(
      `INSERT INTO users (id, email, name, created_at) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name`,
      [
        user.id,
        user.email,
        user.name,
        user.createdAt || new Date(),
      ]
    );
    
    this.createdUsers.push(user.id);
  }

  async getTestUser(userId: string): Promise<TestUser | null> {
    const pool = await this.getPostgresPool();
    
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async deleteTestUser(userId: string): Promise<void> {
    const pool = await this.getPostgresPool();
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    const index = this.createdUsers.indexOf(userId);
    if (index > -1) {
      this.createdUsers.splice(index, 1);
    }
  }

  async cleanup(): Promise<void> {
    // Clean up Redis snapshots
    if (this.redis) {
      for (const key of this.createdSnapshots) {
        await this.redis.del(key);
      }
      await this.redis.quit();
      this.redis = null;
    }
    
    // Clean up PostgreSQL users
    if (this.pgPool) {
      for (const userId of this.createdUsers) {
        await this.pgPool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
      await this.pgPool.end();
      this.pgPool = null;
    }
    
    this.createdSnapshots = [];
    this.createdUsers = [];
  }

  async clearAllTestData(): Promise<void> {
    const redis = await this.getRedis();
    const pool = await this.getPostgresPool();
    
    // Clear all session keys
    const sessionKeys = await redis.keys('session:*');
    if (sessionKeys.length > 0) {
      await redis.del(...sessionKeys);
    }
    
    // Clear test users
    await pool.query("DELETE FROM users WHERE email LIKE '%@test.harmonyflow.com'");
  }
}
