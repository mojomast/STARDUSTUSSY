#!/bin/bash
# HarmonyFlow SyncBridge - Database Seeding Script
# Phase 1: Foundation (Week 1)
# Usage: ./seed_database.sh [environment]

set -e

ENVIRONMENT=${1:-development}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================"
echo "HarmonyFlow Database Seeding"
echo "Environment: $ENVIRONMENT"
echo "======================================"

# Database configuration
if [ "$ENVIRONMENT" == "production" ]; then
    echo "ERROR: Seeding not allowed in production!"
    exit 1
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-harmonyflow}
DB_USER=${DB_USER:-harmonyflow_app}
DB_PASSWORD=${DB_PASSWORD:-changeme_in_production}

export PGPASSWORD="$DB_PASSWORD"

# Function to execute SQL
execute_sql() {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$1"
}

echo "Seeding users..."
execute_sql "$SCRIPT_DIR/seed_users.sql"

echo "Seeding sessions..."
execute_sql "$SCRIPT_DIR/seed_sessions.sql"

echo "Seeding snapshots..."
execute_sql "$SCRIPT_DIR/seed_snapshots.sql"

echo "Seeding audit logs..."
execute_sql "$SCRIPT_DIR/seed_audit_logs.sql"

echo ""
echo "======================================"
echo "Database seeding completed!"
echo "======================================"
