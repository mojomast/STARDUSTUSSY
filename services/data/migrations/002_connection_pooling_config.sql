-- Migration: 002_connection_pooling_config
-- Description: Configure connection pooling and performance settings
-- Created: Week 1, Phase 1

-- UP MIGRATION

-- Create application role with connection limits
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'harmonyflow_app') THEN
        CREATE ROLE harmonyflow_app WITH 
            LOGIN 
            PASSWORD 'changeme_in_production'
            CONNECTION LIMIT 100;
    END IF;
END
$$;

-- Create read-only role for analytics
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'harmonyflow_readonly') THEN
        CREATE ROLE harmonyflow_readonly WITH 
            LOGIN 
            PASSWORD 'changeme_in_production'
            CONNECTION LIMIT 20;
    END IF;
END
$$;

-- Create migration role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'harmonyflow_migrator') THEN
        CREATE ROLE harmonyflow_migrator WITH 
            LOGIN 
            PASSWORD 'changeme_in_production'
            CREATEDB;
    END IF;
END
$$;

-- Grant privileges
GRANT USAGE ON SCHEMA public TO harmonyflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO harmonyflow_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO harmonyflow_app;

GRANT USAGE ON SCHEMA public TO harmonyflow_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO harmonyflow_readonly;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO harmonyflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE ON SEQUENCES TO harmonyflow_app;

-- Configure database parameters (session level)
-- For production, set these in postgresql.conf
ALTER DATABASE harmonyflow SET work_mem = '256MB';
ALTER DATABASE harmonyflow SET maintenance_work_mem = '512MB';
ALTER DATABASE harmonyflow SET effective_cache_size = '2GB';
ALTER DATABASE harmonyflow SET random_page_cost = 1.1;

-- DOWN MIGRATION
/*
-- Revoke privileges
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM harmonyflow_app;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM harmonyflow_readonly;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM harmonyflow_app;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM harmonyflow_app;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM harmonyflow_readonly;

-- Drop roles
DROP ROLE IF EXISTS harmonyflow_app;
DROP ROLE IF EXISTS harmonyflow_readonly;
DROP ROLE IF EXISTS harmonyflow_migrator;
*/
