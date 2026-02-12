#!/bin/bash
# HarmonyFlow SyncBridge - Database Connection Test
# Phase 1: Foundation (Week 1)

set -e

echo "======================================"
echo "HarmonyFlow Database Connection Test"
echo "======================================"

# PostgreSQL Test
echo ""
echo "Testing PostgreSQL connection..."
if PGPASSWORD="${DB_PASSWORD:-changeme_in_production}" psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-harmonyflow}" -c "SELECT version();" > /dev/null 2>&1; then
    echo "✓ PostgreSQL connection successful"
else
    echo "✗ PostgreSQL connection failed"
    exit 1
fi

# Redis Test
echo ""
echo "Testing Redis connection..."
if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" -a "${REDIS_PASSWORD:-changeme_in_production}" ping > /dev/null 2>&1; then
    echo "✓ Redis connection successful"
else
    echo "✗ Redis connection failed"
    exit 1
fi

# RabbitMQ Test
echo ""
echo "Testing RabbitMQ connection..."
if curl -s -u "harmonyflow:${RABBITMQ_PASSWORD:-changeme_in_production}" http://"${RABBITMQ_HOST:-localhost}":15672/api/overview > /dev/null 2>&1; then
    echo "✓ RabbitMQ connection successful"
else
    echo "✗ RabbitMQ connection failed"
    exit 1
fi

echo ""
echo "======================================"
echo "All connections verified successfully!"
echo "======================================"
