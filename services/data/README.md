# HarmonyFlow SyncBridge - Data Service
# Phase 1: Foundation (Week 1)

## Overview

This directory contains all database infrastructure configurations for the HarmonyFlow SyncBridge wellness platform.

## Architecture

### PostgreSQL (Primary Database)
- **Version**: 15
- **Purpose**: Persistent data storage
- **Tables**:
  - `users` - User accounts and profiles
  - `sessions` - Session tracking and management
  - `snapshots` - Wellness data snapshots
  - `audit_logs` - Compliance and security audit trail

### Redis (Cache & Session Store)
- **Version**: 7
- **Purpose**: Session state, caching, rate limiting
- **TTL**: 7 days default for sessions
- **Databases**: 16 (separated by data type)

### RabbitMQ (Message Broker)
- **Version**: 3.12
- **Purpose**: Cross-service event communication
- **Exchange**: `events` (topic exchange)
- **Queues**: User events, session events, wellness alerts, audit logs

## Quick Start

### 1. Start Services

```bash
cd /home/mojo/projects/watercooler/services/data
docker-compose up -d
```

### 2. Run Migrations

```bash
./scripts/migrate.sh up
```

### 3. Seed Development Data

```bash
./seed/seed_database.sh development
```

## Directory Structure

```
data/
├── migrations/          # Database migration files
│   ├── 001_initial_schema.sql
│   ├── 001_initial_schema_down.sql
│   ├── 002_connection_pooling_config.sql
│   └── 003_backup_automation.sql
├── seed/               # Development seed data
│   ├── seed_database.sh
│   ├── seed_users.sql
│   ├── seed_sessions.sql
│   ├── seed_snapshots.sql
│   └── seed_audit_logs.sql
├── config/             # Service configurations
│   ├── redis.conf
│   ├── rabbitmq.conf
│   └── rabbitmq-definitions.json
├── scripts/            # Utility scripts
│   ├── migrate.sh
│   └── backup.sh
├── docker-compose.yml  # Local development stack
└── README.md
```

## Database Connections

| Service | Host | Port | Default User | Password |
|---------|------|------|--------------|----------|
| PostgreSQL | localhost | 5432 | postgres | From env |
| Redis | localhost | 6379 | - | From env |
| RabbitMQ | localhost | 5672 | harmonyflow | From env |
| RabbitMQ UI | localhost | 15672 | harmonyflow | From env |
| PgAdmin | localhost | 5050 | admin@harmonyflow.local | From env |
| Redis Insight | localhost | 5540 | - | - |

## Migration Commands

```bash
# Apply all pending migrations
./scripts/migrate.sh up

# Rollback last migration
./scripts/migrate.sh down

# Check migration status
./scripts/migrate.sh status

# Create new migration
./scripts/migrate.sh create migration_name
```

## Backup Commands

```bash
# Full database backup
./scripts/backup.sh full

# Incremental backup (WAL archiving)
./scripts/backup.sh incremental
```

## Environment Variables

Create a `.env` file in this directory:

```env
# Database
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=harmonyflow

# Redis
REDIS_PASSWORD=your_secure_password

# RabbitMQ
RABBITMQ_PASSWORD=your_secure_password

# PgAdmin
PGADMIN_PASSWORD=your_secure_password
```

## Security Notes

- **Production**: Change all default passwords
- **Production**: Enable SSL/TLS for all connections
- **Production**: Configure firewall rules
- **Production**: Enable database encryption at rest
- **Production**: Set up proper backup retention policies

## Integration Points

- **Session State Service**: Uses Redis for session storage
- **All Backend Services**: Connect to PostgreSQL via connection pool
- **Event-driven Services**: Subscribe to RabbitMQ queues

## Support

For issues or questions, contact the Data Engineering team.
