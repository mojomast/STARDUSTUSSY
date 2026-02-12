# Disaster Recovery Runbook

## Overview

This runbook provides procedures for handling various disaster scenarios in the HarmonyFlow production environment, including database failures, cluster failures, and regional outages.

## Emergency Contacts

- **On-Call Engineer**: PagerDuty rotation
- **Platform Team Lead**: platform-lead@harmonyflow.io
- **Infrastructure Team**: +1-555-INFRA
- **Executive Escalation**: +1-555-EXEC

## RTO/RPO Targets

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 15 minutes

---

## Scenario 1: Redis Cluster Failure

### Symptoms
- Session state service errors
- "Redis connection refused" errors
- High latency on session operations

### Immediate Response (0-15 minutes)

1. **Verify Cluster Status**
   ```bash
   # Check Redis pods
   kubectl get pods -n redis-production
   
   # Check cluster health
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD cluster info
   
   # Check nodes
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD cluster nodes
   ```

2. **Identify Failed Nodes**
   ```bash
   # Find failed nodes
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD cluster nodes | grep fail
   ```

### Recovery Procedure (15-60 minutes)

1. **Restart Failed Nodes**
   ```bash
   # Delete failed pod (it will be recreated)
   kubectl delete pod redis-production-cluster-2 -n redis-production
   
   # Wait for pod to be ready
   kubectl wait --for=condition=ready pod redis-production-cluster-2 -n redis-production --timeout=120s
   ```

2. **Rebalance Cluster**
   ```bash
   # Enter any working pod
   kubectl exec -it redis-production-cluster-0 -n redis-production -- sh
   
   # Fix cluster if needed
   redis-cli --cluster fix redis-production-cluster-0.redis-production-cluster.redis-production.svc.cluster.local:6379 -a $REDIS_PASSWORD
   
   # Rebalance slots
   redis-cli --cluster rebalance redis-production-cluster-0.redis-production-cluster.redis-production.svc.cluster.local:6379 -a $REDIS_PASSWORD
   ```

3. **Verify Recovery**
   ```bash
   # Check cluster is healthy
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD cluster info | grep cluster_state
   
   # Should return: cluster_state:ok
   ```

### Complete Cluster Recovery (if needed)

1. **Restore from Backup**
   ```bash
   # List available backups
   aws s3 ls s3://harmonyflow-backups-production/redis/ | tail -20
   
   # Download latest backup
   aws s3 cp s3://harmonyflow-backups-production/redis/20240211-120000.tar.gz /tmp/redis-backup.tar.gz
   
   # Extract backup
   tar -xzf /tmp/redis-backup.tar.gz -C /tmp/redis-restore
   
   # Restore to first node
   kubectl cp /tmp/redis-restore/dump.rdb redis-production/redis-production-cluster-0:/data/dump.rdb
   
   # Restart node
   kubectl delete pod redis-production-cluster-0 -n redis-production
   ```

2. **Rebuild Cluster**
   ```bash
   # Wait for all nodes to be ready
   kubectl wait --for=condition=ready pod -l app=redis -n redis-production --timeout=300s
   
   # Reinitialize cluster
   kubectl apply -f infrastructure/production/kubernetes/redis/redis-cluster-production.yaml
   ```

---

## Scenario 2: PostgreSQL Primary Failure

### Symptoms
- Database write errors
- "Connection refused" to PostgreSQL
- Replication lag alerts

### Immediate Response (0-10 minutes)

1. **Verify Status**
   ```bash
   # Check PostgreSQL pods
   kubectl get pods -n postgresql-production
   
   # Check primary status
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     pg_isready -U harmonyflow
   ```

2. **Promote Replica (if automatic failover didn't occur)**
   ```bash
   # Check current primary
   kubectl exec -it postgresql-production-1 -n postgresql-production -- \
     repmgr node check
   
   # Force failover if needed
   kubectl exec -it postgresql-production-1 -n postgresql-production -- \
     repmgr standby promote
   ```

### Recovery Procedure (10-60 minutes)

1. **Verify New Primary**
   ```bash
   # Check replication status
   kubectl exec -it postgresql-production-1 -n postgresql-production -- \
     psql -U harmonyflow -c "SELECT * FROM pg_stat_replication;"
   
   # Verify writes working
   kubectl exec -it postgresql-production-1 -n postgresql-production -- \
     psql -U harmonyflow -c "SELECT now();"
   ```

2. **Update Service Endpoints**
   ```bash
   # Service should automatically point to new primary
   kubectl get endpoints postgresql-production-primary -n postgresql-production
   ```

3. **Rebuild Failed Node**
   ```bash
   # Delete old primary pod
   kubectl delete pod postgresql-production-0 -n postgresql-production
   
   # Wait for recreation
   kubectl wait --for=condition=ready pod postgresql-production-0 -n postgresql-production --timeout=180s
   
   # Rejoin as replica
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     repmgr node rejoin
   ```

### Point-in-Time Recovery (if needed)

1. **Restore from Base Backup**
   ```bash
   # List available backups
   aws s3 ls s3://harmonyflow-backups-production/postgresql/ | tail -10
   
   # Download backup
   aws s3 cp s3://harmonyflow-backups-production/postgresql/basebackup-20240211-120000.tar.gz /tmp/pg-backup.tar.gz
   
   # Stop PostgreSQL
   kubectl scale statefulset postgresql-production --replicas=0 -n postgresql-production
   
   # Restore data
   kubectl exec -it postgresql-production-0 -n postgresql-production -- rm -rf /bitnami/postgresql/data/*
   kubectl cp /tmp/pg-restore/basebackup-20240211-120000 postgresql-production/postgresql-production-0:/bitnami/postgresql/data
   
   # Start PostgreSQL
   kubectl scale statefulset postgresql-production --replicas=3 -n postgresql-production
   ```

2. **Apply WAL Recovery**
   ```bash
   # Configure recovery
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     sh -c 'echo "restore_command = '\''aws s3 cp s3://harmonyflow-backups-production/postgresql/wal/%f %p'\''" >> /bitnami/postgresql/data/recovery.conf'
   
   # Start recovery to specific point
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     sh -c 'echo "recovery_target_time = '\''2024-02-11 12:00:00'\''" >> /bitnami/postgresql/data/recovery.conf'
   ```

---

## Scenario 3: Complete Regional Failure

### Symptoms
- Entire EKS cluster unreachable
- All services down
- AWS region unavailable

### Immediate Response (0-30 minutes)

1. **Confirm Regional Outage**
   ```bash
   # Check AWS status page
   curl https://status.aws.amazon.com/api/statuspage/status
   
   # Verify cluster unreachable
   kubectl cluster-info
   ```

2. **Activate DR Region**
   ```bash
   # Switch to DR region
   export AWS_REGION=us-east-1
   aws eks update-kubeconfig --name harmonyflow-production-dr --region us-east-1
   
   # Verify DR cluster is healthy
   kubectl get nodes
   ```

### DR Failover Procedure (30-120 minutes)

1. **Promote DR Databases**
   ```bash
   # Redis: Make DR cluster primary
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD CLUSTER FAILOVER TAKEOVER
   
   # PostgreSQL: Promote DR replica
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     repmgr standby promote
   ```

2. **Update DNS**
   ```bash
   # Update Route53 records to point to DR
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z123456789 \
     --change-batch file://dns-failover.json
   ```

3. **Scale Up DR Services**
   ```bash
   # Scale up all services in DR
   kubectl scale deployment --all --replicas=3 -n harmonyflow-production
   kubectl scale statefulset redis-production-cluster --replicas=9 -n redis-production
   kubectl scale statefulset postgresql-production --replicas=3 -n postgresql-production
   ```

### Cross-Region Recovery (if needed)

1. **Restore from Cross-Region Backups**
   ```bash
   # Restore Redis from DR region backup
   aws s3 sync s3://harmonyflow-backups-production-dr/redis/ s3://harmonyflow-backups-production/redis/
   
   # Restore PostgreSQL from DR region backup
   aws s3 sync s3://harmonyflow-backups-production-dr/postgresql/ s3://harmonyflow-backups-production/postgresql/
   ```

2. **Replicate Data Back**
   ```bash
   # Set up replication from DR to primary (once primary is back)
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     repmgr standby register --upstream-node-id=2
   ```

---

## Scenario 4: Data Corruption

### Symptoms
- Incorrect data in responses
- Database constraint violations
- Application errors indicating bad data

### Recovery Procedure

1. **Stop Writes**
   ```bash
   # Scale down application to prevent further corruption
   kubectl scale deployment session-state-service --replicas=0 -n harmonyflow-production
   ```

2. **Identify Corruption Point**
   ```bash
   # Check database logs
   kubectl logs postgresql-production-0 -n postgresql-production | grep ERROR
   
   # Identify last known good backup
   aws s3 ls s3://harmonyflow-backups-production/postgresql/ | grep -E 'basebackup|harmonyflow'
   ```

3. **Restore to Point-in-Time**
   ```bash
   # Use backup from 1 hour before corruption detected
   BACKUP_TIME="2024-02-11-110000"
   
   # Follow PostgreSQL PITR procedure above
   # Set recovery_target_time to 15 minutes before corruption
   ```

4. **Verify Data Integrity**
   ```bash
   # Run data consistency checks
   kubectl exec -it postgresql-production-0 -n postgresql-production -- \
     psql -U harmonyflow -c "SELECT pg_database.datname, pg_database_size(pg_database.datname) FROM pg_database WHERE datname='harmonyflow';"
   ```

5. **Resume Operations**
   ```bash
   # Scale up application
   kubectl scale deployment session-state-service --replicas=3 -n harmonyflow-production
   ```

---

## Post-Recovery Verification

### Always verify after any recovery:

1. **Health Checks**
   ```bash
   # Application health
   curl https://api.harmonyflow.io/health
   
   # Database connectivity
   kubectl exec -it postgresql-production-0 -n postgresql-production -- pg_isready
   
   # Redis connectivity
   kubectl exec -it redis-production-cluster-0 -n redis-production -- \
     redis-cli -a $REDIS_PASSWORD ping
   ```

2. **Run Smoke Tests**
   ```bash
   # API endpoints
   curl https://api.harmonyflow.io/api/v1/sessions/health
   
   # WebSocket connectivity
   wscat -c wss://ws.harmonyflow.io/health
   ```

3. **Check Error Rates**
   - Monitor Grafana for 15 minutes
   - Verify error rate < 0.1%
   - Verify P95 latency < 200ms

---

## Prevention and Monitoring

### Regular DR Testing

- **Monthly**: Test backup restoration
- **Quarterly**: Test full DR failover
- **Annually**: Test regional recovery

### Monitoring Alerts

Ensure these alerts are configured:
- Database replication lag > 60 seconds
- Redis cluster health != ok
- Backup job failures
- Cross-region replication lag

### Documentation Updates

After any DR event:
1. Document the incident timeline
2. Update runbook with lessons learned
3. Review and update RTO/RPO if needed
