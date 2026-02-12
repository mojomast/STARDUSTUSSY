-- Migration: 003_backup_automation
-- Description: Set up automated backup procedures
-- Created: Week 1, Phase 1

-- UP MIGRATION

-- Create backup metadata table
CREATE TABLE IF NOT EXISTS backup_metadata (
    id SERIAL PRIMARY KEY,
    backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('full', 'incremental', 'wal')),
    backup_file VARCHAR(500) NOT NULL,
    backup_size_bytes BIGINT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    checksum VARCHAR(64),
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    retention_days INTEGER DEFAULT 30
);

CREATE INDEX idx_backup_metadata_type ON backup_metadata(backup_type);
CREATE INDEX idx_backup_metadata_status ON backup_metadata(status);
CREATE INDEX idx_backup_metadata_created ON backup_metadata(started_at);

-- Function to log backup completion
CREATE OR REPLACE FUNCTION log_backup_completion(
    p_backup_id INTEGER,
    p_checksum VARCHAR(64),
    p_status VARCHAR(20),
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE backup_metadata 
    SET 
        completed_at = NOW(),
        checksum = p_checksum,
        status = p_status,
        error_message = p_error_message
    WHERE id = p_backup_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get old backups for cleanup
CREATE OR REPLACE FUNCTION get_expired_backups()
RETURNS TABLE(backup_id INTEGER, backup_file VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT id, backup_file 
    FROM backup_metadata
    WHERE status = 'completed'
    AND started_at < NOW() - (retention_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Create WAL archiving status table
CREATE TABLE IF NOT EXISTS wal_archiving_status (
    id SERIAL PRIMARY KEY,
    wal_file VARCHAR(255) NOT NULL UNIQUE,
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    archive_location VARCHAR(500),
    file_size_bytes BIGINT
);

CREATE INDEX idx_wal_archiving_file ON wal_archiving_status(wal_file);

-- DOWN MIGRATION
/*
DROP FUNCTION IF EXISTS get_expired_backups();
DROP FUNCTION IF EXISTS log_backup_completion(INTEGER, VARCHAR, VARCHAR, TEXT);
DROP TABLE IF EXISTS wal_archiving_status;
DROP TABLE IF EXISTS backup_metadata;
*/
