# HarmonyFlow SyncBridge - Backup and Recovery Runbook

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Owner:** DevOps Team  
**Classification:** INTERNAL USE ONLY

---

## Table of Contents

1. [Overview](#overview)
2. [Backup Strategy](#backup-strategy)
3. [Backup Procedures](#backup-procedures)
4. [Recovery Procedures](#recovery-procedures)
5. [Disaster Recovery](#disaster-recovery)
6. [Testing](#testing)

---

## Overview

This runbook covers backup and recovery procedures for the HarmonyFlow SyncBridge platform.

### Scope

- PostgreSQL database backups
- Redis data persistence
- Configuration backups
- Disaster recovery

### RPO/RTO

| System | RPO | RTO |
|--------|-----|-----|
| PostgreSQL | 15 minutes | 1 hour |
| Redis | 5 minutes | 30 minutes |
| Configuration | 1 hour | 2 hours |

---

## Backup Strategy

### PostgreSQL Backups

#### Backup Types

1. **Physical Backups** - Continuous WAL archiving
2. **Logical Backups** - Daily pg_dump
3. **Snapshots** - Weekly EBS snapshots

#### Backup Schedule

| Type | Frequency | Retention |
|------|-----------|-----------|
| WAL Archive | Continuous | 30 days |
| Logical Backup | Daily 02:00 UTC | 14 days |
| EBS Snapshot | Weekly Sunday 03:00 UTC | 8 weeks |

### Redis Backups

#### Backup Types

1. **RDB Snapshots** - Automated by Redis
2. **AOF Logging** - Append-only file (optional)

#### Backup Schedule

| Type | Frequency | Retention |
|------|-----------|-----------|
| RDB Snapshot | Every 15 min if 1+ key changed | 7 days |
| AOF File | Continuous | 7 days |

---

## Backup Procedures

### PostgreSQL Backup

#### Automated WAL Archiving

Configure in `postgresql.conf`:

```conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://harmonyflow-backups/postgresql/wal/%f'
max_wal_senders = 5
```

#### Daily Logical Backup

```bash
#!/bin/bash
# backup_postgresql.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgresql"
BUCKET="s3://harmonyflow-backups/postgresql/logical"

# Create backup
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  pg_dump -U harmonyflow -F c -f /tmp/backup_${DATE}.dump harmonyflow

# Copy to backup server
kubectl cp postgresql-primary-0:/tmp/backup_${DATE}.dump ${BACKUP_DIR}/backup_${DATE}.dump

# Upload to S3
aws s3 cp ${BACKUP_DIR}/backup_${DATE}.dump ${BUCKET}/backup_${DATE}.dump

# Clean up old backups (keep 14 days)
find ${BACKUP_DIR} -name "backup_*.dump" -mtime +14 -delete
aws s3 ls ${BUCKET} | awk '{print $4}' | while read file; do
  age=$(($(date +%s) - $(date -d $(echo $file | grep -oP '\d{8}') +%s)))
  if [ $age -gt 1209600 ]; then  # 14 days in seconds
    aws s3 rm ${BUCKET}/${file}
  fi
done
```

#### Weekly EBS Snapshot

```bash
#!/bin/bash
# snapshot_ebs.sh

VOLUME_ID=$(aws ec2 describe-volumes \
  --filters Name=tag:Name,Values=postgresql-primary-volume \
  --query 'Volumes[0].VolumeId' \
  --output text)

aws ec2 create-snapshot \
  --volume-id ${VOLUME_ID} \
  --description "PostgreSQL weekly snapshot $(date +%Y-%m-%d)" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=postgresql-$(date +%Y%m%d)}]"
```

### Redis Backup

#### Configure RDB Snapshots

In `redis.conf`:

```conf
save 900 1
save 300 10
save 60 10000

# Backup directory
dir /var/lib/redis

# Filename
dbfilename dump.rdb

# Backup to S3
# Run via cron or Kubernetes job
```

#### Redis Backup Script

```bash
#!/bin/bash
# backup_redis.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/redis"

# Trigger background save
kubectl exec -it redis-cluster-0 -n redis -- redis-cli BGSAVE

# Wait for save to complete
sleep 10

# Copy RDB file
kubectl cp redis-cluster-0:/var/lib/redis/dump.rdb ${BACKUP_DIR}/dump_${DATE}.rdb

# Upload to S3
aws s3 cp ${BACKUP_DIR}/dump_${DATE}.rdb s3://harmonyflow-backups/redis/dump_${DATE}.rdb

# Clean up old backups (keep 7 days)
find ${BACKUP_DIR} -name "dump_*.rdb" -mtime +7 -delete
```

### Configuration Backups

```bash
#!/bin/bash
# backup_config.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/config"

# Export Kubernetes resources
kubectl get configmap -n harmonyflow -o yaml > ${BACKUP_DIR}/configmaps_${DATE}.yaml
kubectl get secret -n harmonyflow -o yaml > ${BACKUP_DIR}/secrets_${DATE}.yaml.enc
kubectl get deployment -n harmonyflow -o yaml > ${BACKUP_DIR}/deployments_${DATE}.yaml

# Encrypt secrets
gpg --encrypt --recipient ops@harmonyflow.io ${BACKUP_DIR}/secrets_${DATE}.yaml
rm ${BACKUP_DIR}/secrets_${DATE}.yaml

# Upload to S3
aws s3 cp ${BACKUP_DIR}/ s3://harmonyflow-backups/config/ --recursive --exclude "*" --include "*_${DATE}.yaml*"
```

---

## Recovery Procedures

### PostgreSQL Recovery

#### Point-in-Time Recovery (PITR)

```bash
# 1. Stop the application
kubectl scale deployment session-state-service -n harmonyflow --replicas=0

# 2. Restore from base backup
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  pg_restore -U harmonyflow -d harmonyflow /backups/postgresql/backup_20260212_020000.dump

# 3. Restore WAL files
# Fetch WAL files from S3 to /var/lib/postgresql/pg_wal/
aws s3 sync s3://harmonyflow-backups/postgresql/wal/ /var/lib/postgresql/pg_wal/

# 4. Configure recovery
# Add to recovery.conf:
# restore_command = 'cp /var/lib/postgresql/pg_wal/%f %p'
# recovery_target_time = '2026-02-12 10:00:00'

# 5. Start PostgreSQL
kubectl exec -it postgresql-primary-0 -n postgresql -- pg_ctl start -D /var/lib/postgresql

# 6. Verify
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "SELECT COUNT(*) FROM sessions;"

# 7. Start application
kubectl scale deployment session-state-service -n harmonyflow --replicas=3
```

#### Full Restore from Logical Backup

```bash
# 1. Download backup
aws s3 cp s3://harmonyflow-backups/postgresql/logical/backup_20260212_020000.dump /tmp/

# 2. Drop existing database
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "DROP DATABASE IF EXISTS harmonyflow;"

# 3. Create fresh database
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "CREATE DATABASE harmonyflow;"

# 4. Restore
kubectl cp /tmp/backup_20260212_020000.dump postgresql-primary-0:/tmp/backup.dump
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  pg_restore -U harmonyflow -d harmonyflow /tmp/backup.dump
```

### Redis Recovery

#### Restore from RDB Backup

```bash
# 1. Stop Redis
kubectl scale statefulset redis-cluster -n redis --replicas=0

# 2. Download backup
aws s3 cp s3://harmonyflow-backups/redis/dump_20260212_120000.rdb /tmp/

# 3. Copy to Redis pod PVC
kubectl cp /tmp/dump_20260212_120000.rdb redis-cluster-0:/var/lib/redis/dump.rdb

# 4. Start Redis
kubectl scale statefulset redis-cluster -n redis --replicas=6

# 5. Verify
kubectl exec -it redis-cluster-0 -n redis -- redis-cli DBSIZE
```

---

## Disaster Recovery

### Scenario: Region Failure

**Trigger:** Complete AWS region outage

**Procedure:**

1. **Activate DR Region**
   ```bash
   # Switch DNS to DR region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file://dr-dns-change.json
   ```

2. **Restore from Cross-Region Replication**
   ```bash
   # PostgreSQL is replicated to DR region via WAL shipping
   # Redis is replicated via Cross-Region Replication
   # Just promote replicas to primary
   ```

3. **Verify Services**
   ```bash
   kubectl get pods -n harmonyflow --context=dr-region
   curl https://api-dr.harmonyflow.io/health
   ```

### Scenario: Data Corruption

**Trigger:** Data integrity issues detected

**Procedure:**

1. **Identify Corrupt Data**
   ```bash
   # Compare backup data with current
   ```

2. **Restore Point-in-Time**
   ```bash
   # Use PITR to restore to before corruption
   ```

3. **Verify Data Integrity**
   ```bash
   # Run data validation scripts
   ```

---

## Testing

### Weekly Backup Verification

```bash
#!/bin/bash
# verify_backups.sh

# Verify PostgreSQL backup can be restored
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  pg_restore -U harmonyflow -l /backups/postgresql/backup_latest.dump > /dev/null

# Verify Redis RDB file is valid
kubectl cp redis-cluster-0:/var/lib/redis/dump.rdb /tmp/dump.rdb
redis-check-rdb /tmp/dump.rdb

# Check backup age
POSTGRES_AGE=$(find /backups/postgresql -name "backup_*.dump" -mtime +1 | wc -l)
REDIS_AGE=$(find /backups/redis -name "dump_*.rdb" -mtime +1 | wc -l)

if [ $POSTGRES_AGE -gt 0 ] || [ $REDIS_AGE -gt 0 ]; then
  echo "WARNING: Backups are stale!"
  exit 1
fi
```

### Monthly Disaster Recovery Drill

1. **Schedule DR drill**
2. **Promote DR environment**
3. **Run smoke tests**
4. **Verify data consistency**
5. **Document findings**
6. **Failback to primary**

---

## Emergency Contacts

| Role | Contact | Method |
|------|---------|--------|
| DevOps Lead | devops@harmonyflow.io | PagerDuty |
| DBA | dba@harmonyflow.io | Slack/Email |
| Platform Lead | platform@harmonyflow.io | Slack/Email |

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-05-12
