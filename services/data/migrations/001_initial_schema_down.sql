-- Migration: 001_initial_schema
-- Description: Initial database schema for HarmonyFlow SyncBridge
-- Created: Week 1, Phase 1

-- UP MIGRATION
-- This file contains the forward migration (schema creation)
-- See 001_initial_schema.sql for full schema definition

-- Note: Use the schema file directly or run via migration tool
-- psql -U postgres -d harmonyflow -f 001_initial_schema.sql

-- DOWN MIGRATION
-- To rollback this migration, execute:

/*
-- Drop triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_snapshots_updated_at ON snapshots;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop RLS policies
DROP POLICY IF EXISTS users_self_access ON users;
DROP POLICY IF EXISTS sessions_user_access ON sessions;
DROP POLICY IF EXISTS snapshots_user_access ON snapshots;

-- Drop tables (order matters for foreign keys)
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

-- Drop extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "citext";
*/
