#!/bin/bash
# HarmonyFlow SyncBridge - Backup Script
# Phase 1: Foundation (Week 1)
# Usage: ./backup.sh [full|incremental|wal]

set -e

BACKUP_TYPE=${1:-full}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/harmonyflow}"
DB_NAME="${DB_NAME:-harmonyflow}"
DB_USER="${DB_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "======================================"
echo "HarmonyFlow Database Backup"
echo "Type: $BACKUP_TYPE"
echo "Timestamp: $TIMESTAMP"
echo "======================================"

case "$BACKUP_TYPE" in
    full)
        echo "Creating full database backup..."
        BACKUP_FILE="$BACKUP_DIR/harmonyflow_full_${TIMESTAMP}.sql.gz"
        pg_dump -U "$DB_USER" -h localhost "$DB_NAME" | gzip > "$BACKUP_FILE"
        
        # Calculate checksum
        CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
        echo "Backup checksum: $CHECKSUM"
        echo "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
        
        # Log to database
        psql -U "$DB_USER" -d "$DB_NAME" -c "
            INSERT INTO backup_metadata (backup_type, backup_file, backup_size_bytes, checksum, status, retention_days)
            VALUES ('full', '$BACKUP_FILE', $(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE"), '$CHECKSUM', 'completed', $RETENTION_DAYS);
        " 2>/dev/null || echo "Note: backup_metadata table may not exist yet"
        ;;
        
    incremental)
        echo "Creating incremental backup via WAL archiving..."
        # Trigger WAL switch to archive current WAL file
        psql -U "$DB_USER" -c "SELECT pg_switch_wal();" 2>/dev/null || echo "Note: pg_switch_wal not available (may be standby)"
        ;;
        
    wal)
        echo "WAL archiving is handled automatically by PostgreSQL"
        echo "Check archive_command in postgresql.conf"
        ;;
        
    *)
        echo "Unknown backup type: $BACKUP_TYPE"
        echo "Usage: $0 [full|incremental|wal]"
        exit 1
        ;;
esac

# Cleanup old backups
echo ""
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "harmonyflow_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo ""
echo "======================================"
echo "Backup completed successfully!"
echo "======================================"
