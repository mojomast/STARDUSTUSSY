#!/bin/bash
# HarmonyFlow SyncBridge - Migration Runner
# Phase 1: Foundation (Week 1)
# Usage: ./migrate.sh [up|down|status|create NAME]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$SCRIPT_DIR/../migrations}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-harmonyflow}"
DB_USER="${DB_USER:-harmonyflow_migrator}"
DB_PASSWORD="${DB_PASSWORD:-changeme_in_production}"

export PGPASSWORD="$DB_PASSWORD"

# Create migrations tracking table
init_migrations_table() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            version VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT NOW(),
            checksum VARCHAR(64)
        );
    "
}

# Get list of applied migrations
get_applied_migrations() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT version FROM schema_migrations ORDER BY version;
    " 2>/dev/null | tr -d ' ' || echo ""
}

# Calculate file checksum
calculate_checksum() {
    sha256sum "$1" | awk '{print $1}'
}

# Run migration up
migrate_up() {
    init_migrations_table
    
    local applied
    applied=$(get_applied_migrations)
    
    for migration in "$MIGRATIONS_DIR"/*.sql; do
        [ -e "$migration" ] || continue
        
        local version
        version=$(basename "$migration" .sql | cut -d'_' -f1)
        
        # Skip if already applied
        if echo "$applied" | grep -q "^$version$"; then
            echo "Skipping: $version (already applied)"
            continue
        fi
        
        echo "Applying: $version"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
        
        local checksum
        checksum=$(calculate_checksum "$migration")
        
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            INSERT INTO schema_migrations (version, checksum)
            VALUES ('$version', '$checksum');
        "
        
        echo "Applied: $version"
    done
}

# Run migration down (last applied)
migrate_down() {
    init_migrations_table
    
    local last_migration
    last_migration=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1;
    " 2>/dev/null | tr -d ' ')
    
    if [ -z "$last_migration" ]; then
        echo "No migrations to rollback"
        exit 0
    fi
    
    echo "Rolling back: $last_migration"
    
    # Look for down migration file
    local down_file
    down_file=$(find "$MIGRATIONS_DIR" -name "${last_migration}*_down.sql" | head -1)
    
    if [ -n "$down_file" ] && [ -f "$down_file" ]; then
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$down_file"
    else
        echo "Warning: No down migration file found for $last_migration"
        echo "Please manually review rollback steps in ${last_migration}.sql"
        exit 1
    fi
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        DELETE FROM schema_migrations WHERE version = '$last_migration';
    "
    
    echo "Rolled back: $last_migration"
}

# Show migration status
migration_status() {
    init_migrations_table
    
    echo "======================================"
    echo "Migration Status"
    echo "======================================"
    
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT version, applied_at, checksum 
        FROM schema_migrations 
        ORDER BY applied_at DESC;
    "
}

# Create new migration
create_migration() {
    local name="$1"
    if [ -z "$name" ]; then
        echo "Error: Migration name required"
        echo "Usage: $0 create migration_name"
        exit 1
    fi
    
    local timestamp
    timestamp=$(date +%Y%m%d%H%M%S)
    local filename="${timestamp}_${name}.sql"
    local filepath="$MIGRATIONS_DIR/$filename"
    
    cat > "$filepath" << EOF
-- Migration: ${timestamp}_${name}
-- Description: 
-- Created: $(date)

-- UP MIGRATION

-- TODO: Add your migration here

-- DOWN MIGRATION
/*
-- TODO: Add rollback script here
*/
EOF

    echo "Created: $filepath"
}

# Main command handler
case "${1:-up}" in
    up)
        migrate_up
        ;;
    down)
        migrate_down
        ;;
    status)
        migration_status
        ;;
    create)
        create_migration "$2"
        ;;
    *)
        echo "Usage: $0 [up|down|status|create NAME]"
        exit 1
        ;;
esac
