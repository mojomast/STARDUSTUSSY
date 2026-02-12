import { Pool, PoolClient } from 'pg';

export class DatabaseHelper {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;

  async connect(): Promise<void> {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'harmonyflow_test',
      user: process.env.POSTGRES_USER || 'harmonyflow',
      password: process.env.POSTGRES_PASSWORD || 'password',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.client = await this.pool.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    if (!this.client) {
      throw new Error('Database not connected');
    }
    return await this.client.query(text, params);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new Error('Database not connected');
    }

    await this.client.query('BEGIN');
    try {
      const result = await callback(this.client);
      await this.client.query('COMMIT');
      return result;
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  async seedTestData(): Promise<void> {
    // Run seed scripts
    await this.query(`
      INSERT INTO users (id, name, email, password_hash, role, created_at)
      VALUES 
        ('00000000-0000-0000-0000-000000000001', 'Seed User 1', 'seed1@harmonyflow.test', 'hashed_pass', 'user', NOW()),
        ('00000000-0000-0000-0000-000000000002', 'Seed User 2', 'seed2@harmonyflow.test', 'hashed_pass', 'user', NOW()),
        ('00000000-0000-0000-0000-000000000003', 'Seed Admin', 'seed.admin@harmonyflow.test', 'hashed_pass', 'admin', NOW())
      ON CONFLICT DO NOTHING
    `);
  }

  async clearTestData(): Promise<void> {
    await this.query('DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL \'1 day\'');
    await this.query('DELETE FROM snapshots WHERE created_at < NOW() - INTERVAL \'1 day\'');
    await this.query('DELETE FROM session_deltas WHERE created_at < NOW() - INTERVAL \'1 day\'');
    await this.query("DELETE FROM device_states WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test')");
    await this.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@harmonyflow.test')");
    await this.query("DELETE FROM users WHERE email LIKE '%@harmonyflow.test'");
  }

  async getUserByEmail(email: string): Promise<any> {
    const result = await this.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async getSessionsByUserId(userId: string): Promise<any[]> {
    const result = await this.query(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async getActiveSessions(): Promise<any[]> {
    const result = await this.query(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY last_activity_at DESC"
    );
    return result.rows;
  }

  async closeAllUserSessions(userId: string): Promise<void> {
    await this.query(
      "UPDATE sessions SET status = 'inactive', ended_at = NOW() WHERE user_id = $1 AND status = 'active'",
      [userId]
    );
  }
}
