# Vault Secret Rotation Procedures
# HarmonyFlow SyncBridge - Week 5, Days 1-2
# Version: 1.0
# Last Updated: 2026-02-11

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [JWT Secret Rotation](#jwt-secret-rotation)
4. [Database Credential Rotation](#database-credential-rotation)
5. [Redis Credential Rotation](#redis-credential-rotation)
6. [RabbitMQ Credential Rotation](#rabbitmq-credential-rotation)
7. [API Key Rotation](#api-key-rotation)
8. [Automated Rotation](#automated-rotation)
9. [Emergency Procedures](#emergency-procedures)
10. [Verification Steps](#verification-steps)

---

## Overview

This runbook provides step-by-step procedures for rotating secrets stored in HashiCorp Vault for the HarmonyFlow SyncBridge platform. Proper secret rotation is critical for maintaining security and compliance.

### Secrets Currently Stored in Vault

| Secret Type | Vault Path | Rotation Frequency | Service Impact |
|-------------|-----------|-------------------|----------------|
| JWT Access Secret | `secret/data/harmonyflow/session-state-service` | Quarterly | Medium |
| JWT Refresh Secret | `secret/data/harmonyflow/session-state-service` | Quarterly | Low |
| PostgreSQL Password | `secret/data/harmonyflow/postgresql` | Monthly | Low |
| Redis Password | `secret/data/harmonyflow/redis` | Monthly | Low |
| RabbitMQ Password | `secret/data/harmonyflow/rabbitmq` | Monthly | Low |
| Admin API Token | `secret/data/harmonyflow/admin` | Quarterly | Medium |
| Encryption Key | `secret/data/harmonyflow/session-state-service` | Annually | High |

### Supported Rotation Methods

1. **Manual Rotation**: Step-by-step manual process
2. **Automated Rotation**: Cron-based jobs in Vault
3. **Zero-Downtime Rotation**: Rolling updates with gradual migration

---

## Prerequisites

### Required Access

- Vault admin token with appropriate permissions
- kubectl access to the production and staging clusters
- Access to the service deployment manifests
- Monitoring and alerting access

### Required Tools

```bash
# Vault CLI
vault version  # >= 1.15

# kubectl
kubectl version --client  # >= 1.25

# OpenSSL
openssl version
```

### Pre-Rotation Checklist

- [ ] Scheduled maintenance window confirmed
- [ ] Stakeholders notified of potential brief service interruptions
- [ ] Backup of current secrets taken
- [ ] Rollback plan documented
- [ ] Monitoring dashboards prepared
- [ ] Team members on standby

---

## JWT Secret Rotation

### Overview

JWT secrets are used to sign and verify authentication tokens. Rotation requires careful coordination to avoid disrupting active sessions.

### Rotation Procedure (Zero-Downtime)

#### Step 1: Prepare New Secrets

```bash
# Export Vault token
export VAULT_TOKEN="your-admin-token"
export VAULT_ADDR="https://vault.harmonyflow.io"

# Generate new JWT secrets
NEW_JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
NEW_JWT_REFRESH_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "New JWT Secret: $NEW_JWT_SECRET"
echo "New JWT Refresh Secret: $NEW_JWT_REFRESH_SECRET"
```

#### Step 2: Backup Current Secrets

```bash
# Read current secrets
vault kv get -field=jwt-secret secret/harmonyflow/session-state-service > /tmp/jwt-secret-backup.txt
vault kv get -field=jwt-refresh-secret secret/harmonyflow/session-state-service > /tmp/jwt-refresh-backup.txt

# Verify backup
cat /tmp/jwt-secret-backup.txt
cat /tmp/jwt-refresh-backup.txt
```

#### Step 3: Rotate Secrets Using Vault's Versioning

```bash
# Get current version
CURRENT_VERSION=$(vault kv metadata get -format=json secret/harmonyflow/session-state-service | jq '.data.current_version')

# Move current secret to "previous" field
OLD_JWT_SECRET=$(vault kv get -field=jwt-secret secret/harmonyflow/session-state-service)
OLD_REFRESH_SECRET=$(vault kv get -field=jwt-refresh-secret secret/harmonyflow/session-state-service)

# Update Vault with new secrets while keeping previous version
vault kv patch secret/harmonyflow/session-state-service \
  jwt-secret="$NEW_JWT_SECRET" \
  jwt-refresh-secret="$NEW_JWT_REFRESH_SECRET" \
  jwt-secret-previous="$OLD_JWT_SECRET" \
  jwt-refresh-previous="$OLD_REFRESH_SECRET"
```

#### Step 4: Validate New Secrets

```bash
# Verify new secrets in Vault
vault kv get secret/harmonyflow/session-state-service

# The secrets should be synced to Kubernetes within 1 hour
# Check the Kubernetes secret
kubectl get secret session-state-service-secrets -n harmonyflow-production -o yaml
```

#### Step 5: Trigger External Secrets Sync (Optional)

```bash
# Force immediate sync by restarting the external-secrets pod
kubectl rollout restart deployment external-secrets -n external-secrets

# Wait for sync
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=external-secrets -n external-secrets --timeout=60s
```

#### Step 6: Rolling Restart of Services

```bash
# Restart session-state-service to pick up new secrets
kubectl rollout restart deployment session-state-service -n harmonyflow-production

# Monitor the rollout
kubectl rollout status deployment session-state-service -n harmonyflow-production --timeout=300s
```

#### Step 7: Verification

```bash
# Test authentication with new tokens
curl -X POST https://api.harmonyflow.io/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# Check logs for any JWT validation errors
kubectl logs -n harmonyflow-production -l app=session-state-service --tail=100 | grep -i jwt

# Monitor active sessions
curl https://api.harmonyflow.io/v1/admin/sessions/active \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Rollback Procedure

If issues are detected:

```bash
# Restore previous secrets
OLD_JWT_SECRET=$(cat /tmp/jwt-secret-backup.txt)
OLD_REFRESH_SECRET=$(cat /tmp/jwt-refresh-backup.txt)

vault kv patch secret/harmonyflow/session-state-service \
  jwt-secret="$OLD_JWT_SECRET" \
  jwt-refresh-secret="$OLD_REFRESH_SECRET"

# Trigger sync and restart services
kubectl rollout restart deployment external-secrets -n external-secrets
kubectl rollout restart deployment session-state-service -n harmonyflow-production
```

---

## Database Credential Rotation

### Overview

Database credentials are rotated using Vault's database secrets engine for dynamic credentials or manual rotation for static credentials.

### Procedure for Static Credentials (PostgreSQL)

#### Step 1: Generate New Password

```bash
export VAULT_TOKEN="your-admin-token"
export VAULT_ADDR="https://vault.harmonyflow.io"

# Generate new strong password
NEW_POSTGRES_PASSWORD=$(openssl rand -base64 32)
echo "New PostgreSQL Password: $NEW_POSTGRES_PASSWORD"
```

#### Step 2: Backup Current Credentials

```bash
vault kv get -field=password secret/harmonyflow/postgresql > /tmp/postgres-password-backup.txt
```

#### Step 3: Update Vault

```bash
vault kv patch secret/harmonyflow/postgresql \
  password="$NEW_POSTGRES_PASSWORD"
```

#### Step 4: Update PostgreSQL Database

```bash
# Connect to PostgreSQL
kubectl exec -n postgresql postgresql-primary-0 -- psql -U postgres -c "
ALTER USER harmonyflow PASSWORD '$NEW_POSTGRES_PASSWORD';
"
```

#### Step 5: Sync to Kubernetes and Restart Services

```bash
# Force sync
kubectl rollout restart deployment external-secrets -n external-secrets

# Restart services that depend on PostgreSQL
kubectl rollout restart statefulset postgresql -n postgresql
kubectl rollout restart deployment session-state-service -n harmonyflow-production
```

#### Step 6: Verification

```bash
# Test database connection from application pods
kubectl exec -n harmonyflow-production session-state-service-0 -- env | grep POSTGRES

# Test connection
kubectl exec -n harmonyflow-production session-state-service-0 -- psql -h postgresql-primary.postgresql -U harmonyflow -d harmonyflow -c "SELECT 1;"
```

### Procedure for Dynamic Credentials

Dynamic credentials are automatically managed by Vault's database secrets engine:

```bash
# Configure automatic rotation (rotate every 24 hours)
vault write database/rotate-root/harmonyflow

# Rotate dynamic credentials for existing connections
vault lease renew -increment=1h database/creds/harmonyflow
```

---

## Redis Credential Rotation

### Procedure

```bash
export VAULT_TOKEN="your-admin-token"
export VAULT_ADDR="https://vault.harmonyflow.io"

# Generate new password
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)

# Backup current password
vault kv get -field=password secret/harmonyflow/redis > /tmp/redis-password-backup.txt

# Update Vault
vault kv patch secret/harmonyflow/redis \
  password="$NEW_REDIS_PASSWORD"

# Update Redis configuration
kubectl exec -n redis-production redis-cluster-0 -- redis-cli CONFIG SET requirepass "$NEW_REDIS_PASSWORD"
kubectl exec -n redis-production redis-cluster-0 -- redis-cli -a "$NEW_REDIS_PASSWORD" CONFIG REWRITE

# Update all Redis nodes
for i in {0..5}; do
  kubectl exec -n redis-production redis-cluster-$i -- redis-cli CONFIG SET requirepass "$NEW_REDIS_PASSWORD"
  kubectl exec -n redis-production redis-cluster-$i -- redis-cli -a "$NEW_REDIS_PASSWORD" CONFIG REWRITE
done

# Sync and restart services
kubectl rollout restart deployment external-secrets -n external-secrets
kubectl rollout restart deployment session-state-service -n harmonyflow-production

# Verification
kubectl exec -n harmonyflow-production session-state-service-0 -- redis-cli -h redis-cluster.redis -a "$NEW_REDIS_PASSWORD" PING
```

---

## RabbitMQ Credential Rotation

### Procedure

```bash
export VAULT_TOKEN="your-admin-token"
export VAULT_ADDR="https://vault.harmonyflow.io"

# Generate new password
NEW_RABBITMQ_PASSWORD=$(openssl rand -base64 32)

# Backup current password
vault kv get -field=password secret/harmonyflow/rabbitmq > /tmp/rabbitmq-password-backup.txt

# Update Vault
vault kv patch secret/harmonyflow/rabbitmq \
  password="$NEW_RABBITMQ_PASSWORD"

# Update RabbitMQ user
kubectl exec -n rabbitmq-production rabbitmq-server-0 -- rabbitmqctl change_password harmonyflow "$NEW_RABBITMQ_PASSWORD"

# Sync and restart services
kubectl rollout restart deployment external-secrets -n external-secrets
kubectl rollout restart deployment session-state-service -n harmonyflow-production

# Verification
kubectl exec -n harmonyflow-production session-state-service-0 -- curl -u harmonyflow:"$NEW_RABBITMQ_PASSWORD" http://rabbitmq-server.rabbitmq-production:15672/api/overview
```

---

## API Key Rotation

### Procedure

```bash
export VAULT_TOKEN="your-admin-token"
export VAULT_ADDR="https://vault.harmonyflow.io"

# Generate new API key
NEW_API_KEY=$(openssl rand -hex 32)

# Backup current API key
vault kv get -field=api-key secret/harmonyflow/session-state-service > /tmp/api-key-backup.txt

# Update Vault
vault kv patch secret/harmonyflow/session-state-service \
  api-key="$NEW_API_KEY"

# Sync and restart services
kubectl rollout restart deployment external-secrets -n external-secrets
kubectl rollout restart deployment session-state-service -n harmonyflow-production

# Verification
curl -H "X-API-Key: $NEW_API_KEY" https://api.harmonyflow.io/v1/health
```

---

## Automated Rotation

### Vault Native Rotation

```bash
# Enable automatic rotation for database credentials
vault write database/config/postgresql-production \
  rotation_period=768h  # 32 days

# Rotate root credentials immediately
vault write database/rotate-root/harmonyflow

# Enable automatic transit key rotation
vault write -f transit/keys/session-state/rotate

# Check rotation status
vault read transit/keys/session-state
```

### Kubernetes CronJob for Automated Rotation

Create a CronJob to automatically rotate secrets:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: secret-rotation
  namespace: vault
spec:
  schedule: "0 2 1 * *"  # Monthly at 2 AM on the 1st
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: vault-init
          containers:
          - name: rotate-secrets
            image: hashicorp/vault:1.15.4
            command: ["/bin/bash"]
            args:
            - -c
            - |
              export VAULT_TOKEN=$(cat /etc/vault-token/token)
              export VAULT_ADDR="https://vault.vault:8200"
              
              # Rotate database credentials
              vault write database/rotate-root/harmonyflow
              
              # Rotate Redis password
              NEW_PASS=$(openssl rand -base64 32)
              vault kv patch secret/harmonyflow/redis password="$NEW_PASS"
              
              # Trigger Kubernetes secret sync
              kubectl annotate secrets -n harmonyflow-production session-state-service-secrets \
                force-sync=$(date +%s) --overwrite
              
              # Restart services gracefully
              kubectl rollout restart deployment session-state-service -n harmonyflow-production
            volumeMounts:
            - name: vault-token
              mountPath: /etc/vault-token
          volumes:
          - name: vault-token
            secret:
              secretName: vault-admin-token
          restartPolicy: OnFailure
```

---

## Emergency Procedures

### Immediate Secret Compromise

If a secret is suspected to be compromised:

```bash
# 1. Immediately rotate all secrets
./rotate-all-secrets.sh emergency

# 2. Revoke all active sessions
curl -X POST https://api.harmonyflow.io/v1/admin/sessions/revoke-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Force restart of all services
kubectl rollout restart deployment --all -n harmonyflow-production
kubectl rollout restart statefulset --all -n postgresql
kubectl rollout restart statefulset --all -n redis-production
kubectl rollout restart statefulset --all -n rabbitmq-production

# 4. Enable enhanced monitoring
kubectl annotate pods -n harmonyflow-production all \
  security-alert=true
```

### Vault Unavailability Recovery

If Vault becomes unavailable:

```bash
# 1. Check Vault status
kubectl exec -n vault vault-0 -- vault status

# 2. Unseal Vault if sealed (requires 3 unseal keys)
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_1>
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_2>
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_3>

# 3. Verify external-secrets connectivity
kubectl logs -n external-secrets deployment/external-secrets --tail=50

# 4. Force sync if needed
kubectl delete pod -l app.kubernetes.io/name=external-secrets -n external-secrets
```

---

## Verification Steps

### Post-Rotation Checklist

After any secret rotation, perform these verification steps:

#### 1. Vault Verification

```bash
# Verify secret version increased
vault kv get -format=json secret/harmonyflow/session-state-service | jq '.data.metadata.version'

# Verify secret content
vault kv get secret/harmonyflow/session-state-service
```

#### 2. Kubernetes Secret Verification

```bash
# Verify Kubernetes secret exists
kubectl get secret session-state-service-secrets -n harmonyflow-production

# Verify secret content
kubectl get secret session-state-service-secrets -n harmonyflow-production -o json | jq '.data'

# Verify external secret status
kubectl get externalsecret session-state-service-jwt -n harmonyflow-production -o yaml
```

#### 3. Application Verification

```bash
# Check application logs
kubectl logs -n harmonyflow-production -l app=session-state-service --tail=100 | grep -i error

# Test health endpoint
curl https://api.harmonyflow.io/v1/health

# Test authentication
curl -X POST https://api.harmonyflow.io/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

#### 4. Database Connectivity

```bash
# Test PostgreSQL connection
kubectl exec -n harmonyflow-production session-state-service-0 -- \
  psql -h postgresql-primary.postgresql -U harmonyflow -d harmonyflow -c "SELECT 1;"

# Test Redis connection
kubectl exec -n harmonyflow-production session-state-service-0 -- \
  redis-cli -h redis-cluster.redis -a $REDIS_PASSWORD PING

# Test RabbitMQ connection
kubectl exec -n harmonyflow-production session-state-service-0 -- \
  curl -u harmonyflow:$RABBITMQ_PASSWORD http://rabbitmq-server.rabbitmq-production:15672/api/overview
```

#### 5. Monitoring Verification

```bash
# Check for secret rotation alerts
kubectl logs -n vault deployment/vault -l app=vault --tail=100 | grep -i rotation

# Verify metrics
curl http://prometheus.monitoring:9090/api/v1/query?query=vault_token_ttl_hours
```

### Success Criteria

A secret rotation is considered successful when:

- [ ] Vault secret updated with new version
- [ ] Kubernetes secret synced within refresh interval
- [ ] All services restarted successfully
- [ ] No error logs in application pods
- [ ] Health endpoints return 200 OK
- [ ] Authentication/authorization working
- [ ] Database connections successful
- [ ] No user-facing errors reported
- [ ] Monitoring shows normal operation

### Failure Indicators

If any of these are observed, consider rollback:

- Application pods in CrashLoopBackOff
- High error rates in logs
- Authentication failures
- Database connection errors
- Monitoring alerts triggering
- User complaints about login issues

---

## Appendix

### A. Secret Rotation Script Template

```bash
#!/bin/bash
# rotate-secret.sh - Template for secret rotation

set -e

SECRET_PATH="$1"
SECRET_KEY="$2"
NEW_VALUE="$3"

if [ -z "$SECRET_PATH" ] || [ -z "$SECRET_KEY" ] || [ -z "$NEW_VALUE" ]; then
  echo "Usage: $0 <secret-path> <secret-key> <new-value>"
  exit 1
fi

echo "Rotating $SECRET_PATH/$SECRET_KEY"

# Backup
BACKUP_FILE="/tmp/secret-backup-$(date +%Y%m%d%H%M%S).txt"
vault kv get -field="$SECRET_KEY" "$SECRET_PATH" > "$BACKUP_FILE"
echo "Backup saved to $BACKUP_FILE"

# Rotate
vault kv patch "$SECRET_PATH" "$SECRET_KEY"="$NEW_VALUE"

# Trigger sync
kubectl rollout restart deployment external-secrets -n external-secrets

echo "Rotation completed. Backup: $BACKUP_FILE"
```

### B. Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call Engineer | oncall@harmonyflow.io | 5 minutes |
| DevOps Lead | devops-lead@harmonyflow.io | 15 minutes |
| Security Team | security@harmonyflow.io | 30 minutes |
| CTO | cto@harmonyflow.io | Emergency only |

### C. Related Documentation

- Vault Documentation: https://developer.hashicorp.com/vault
- External Secrets Operator: https://external-secrets.io
- Kubernetes Security Best Practices: https://kubernetes.io/docs/concepts/security/
- Incident Response Procedures: /home/mojo/projects/watercooler/security/INCIDENT_RESPONSE_PROCEDURES.md

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-02-11 | 1.0 | Initial version | DevOps-Agent |
