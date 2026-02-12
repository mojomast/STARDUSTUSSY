# Vault Integration for HarmonyFlow SyncBridge

## Overview

This directory contains all the configuration and scripts needed to deploy and configure HashiCorp Vault for secrets management in the HarmonyFlow SyncBridge project.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         External Applications                     │
│                 (Session State Service, etc.)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Reads secrets from
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Kubernetes Secrets                             │
│              (Managed by External Secrets Operator)              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Syncs from
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    External Secrets Operator                      │
│                      (Kubernetes Deployment)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Reads from
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Vault (HA, Raft Backend)                     │
│              (3 replicas, TLS, Audit Logging)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
infrastructure/
├── kubernetes/
│   └── vault/
│       ├── vault-deployment.yaml          # Vault StatefulSet with HA
│       ├── vault-init-job.yaml            # Initialization job
│       └── external-secrets.yaml          # External Secrets Operator config
└── vault/
    ├── deploy-vault.sh                    # Deployment script
    ├── migrate-secrets-to-vault.sh        # Secret migration script
    └── SECRET_ROTATION.md                 # Secret rotation procedures
```

## Quick Start

### 1. Deploy Vault

```bash
cd /home/mojo/projects/watercooler/infrastructure/vault
./deploy-vault.sh staging
```

### 2. Migrate Secrets

```bash
cd /home/mojo/projects/watercooler/infrastructure/vault
export VAULT_TOKEN="<your-root-token>"
./migrate-secrets-to-vault.sh staging
```

### 3. Verify Deployment

```bash
# Check Vault status
kubectl exec -n vault vault-0 -- vault status

# Check External Secrets Operator logs
kubectl logs -n external-secrets deployment/external-secrets

# Check synced secrets
kubectl get secret session-state-service-secrets -n harmonyflow-staging
```

## Configuration Files

### vault-deployment.yaml

Contains the Vault StatefulSet deployment with:
- High availability (3 replicas)
- Raft storage backend
- TLS encryption
- Audit logging
- Network policies
- ServiceMonitor for Prometheus

### vault-init-job.yaml

Initialization job that:
- Initializes Vault (if not already initialized)
- Unseals Vault
- Configures Kubernetes authentication
- Enables secrets engines (KV v2, Database, Transit)
- Creates Vault policies
- Generates and stores initial secrets

### external-secrets.yaml

External Secrets Operator configuration:
- Operator deployment
- ClusterSecretStore definitions (production and staging)
- ExternalSecret resources for all services

## Secrets Stored in Vault

### Session State Service
| Secret | Vault Path | Description |
|--------|-----------|-------------|
| JWT Secret | `secret/data/harmonyflow/session-state-service` | JWT access token signing key |
| JWT Refresh Secret | `secret/data/harmonyflow/session-state-service` | JWT refresh token signing key |
| API Key | `secret/data/harmonyflow/session-state-service` | Service API key |
| Encryption Key | `secret/data/harmonyflow/session-state-service` | Data encryption key |

### PostgreSQL
| Secret | Vault Path | Description |
|--------|-----------|-------------|
| Password | `secret/data/harmonyflow/postgresql` | PostgreSQL user password |
| Replication Password | `secret/data/harmonyflow/postgresql` | Replication user password |
| Admin Password | `secret/data/harmonyflow/postgresql` | Admin user password |

### Redis
| Secret | Vault Path | Description |
|--------|-----------|-------------|
| Password | `secret/data/harmonyflow/redis` | Redis password |
| Standby Password | `secret/data/harmonyflow/redis` | Redis standby password |

### RabbitMQ
| Secret | Vault Path | Description |
|--------|-----------|-------------|
| Username | `secret/data/harmonyflow/rabbitmq` | RabbitMQ username |
| Password | `secret/data/harmonyflow/rabbitmq` | RabbitMQ password |
| Cookie | `secret/data/harmonyflow/rabbitmq` | RabbitMQ cookie |
| Erlang Cookie | `secret/data/harmonyflow/rabbitmq` | RabbitMQ Erlang cookie |

### Admin
| Secret | Vault Path | Description |
|--------|-----------|-------------|
| API Token | `secret/data/harmonyflow/admin` | Admin API token |

## Vault Policies

### session-state-service
- Read access to session-state-service secrets
- Read access to Redis secrets
- Transit encrypt/decrypt permissions

### external-secrets
- Read access to all HarmonyFlow secrets

### admin
- Full access to all Vault paths

## Deployment Environments

### Staging
- Vault URL: `https://vault-staging.harmonyflow.io`
- ClusterSecretStore: `vault-backend-staging`
- Namespace: `harmonyflow-staging`

### Production
- Vault URL: `https://vault.harmonyflow.io`
- ClusterSecretStore: `vault-backend-production`
- Namespace: `harmonyflow-production`

## Accessing Vault UI

### Port Forward

```bash
kubectl port-forward -n vault svc/vault 8200:8200
```

Then access at `https://localhost:8200`

### Via Ingress

Production: `https://vault.harmonyflow.io`
Staging: `https://vault-staging.harmonyflow.io`

## Operations

### Unseal Vault (if sealed)

```bash
# Get unseal keys from secure storage
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_1>
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_2>
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY_3>
```

### Rotate Secrets

See [SECRET_ROTATION.md](SECRET_ROTATION.md) for detailed procedures.

### Force Secret Sync

```bash
# Restart external-secrets pod
kubectl rollout restart deployment external-secrets -n external-secrets

# Or use annotation
kubectl annotate secret session-state-service-secrets -n harmonyflow-production \
  force-sync=$(date +%s) --overwrite
```

### Backup Vault Data

Vault data is stored in the persistent volume claim. To backup:

```bash
# Get the PVC
kubectl get pvc -n vault

# Backup using velero (if configured)
velero backup create vault-backup --include-resources pvc,pv,statefulset --namespaces vault
```

## Monitoring

### Metrics

Vault exposes Prometheus metrics:

```bash
kubectl port-forward -n vault svc/vault 8200:8200
curl http://localhost:8200/v1/sys/metrics
```

### Logs

```bash
# Audit logs
kubectl exec -n vault vault-0 -- cat /vault/audit/audit.log

# Pod logs
kubectl logs -n vault -l app.kubernetes.io/name=vault
```

### Alerts

Configure alerts for:
- Vault sealed status
- Secret rotation failures
- External secrets sync failures
- High token usage

## Security Best Practices

1. **Root Token Security**
   - Store root token securely (password manager, HSM)
   - Use root token only for initial setup
   - Create limited-scope tokens for日常 operations

2. **Unseal Keys**
   - Store unseal keys separately
   - Require quorum to unseal (3 of 5 keys)
   - Use auto-unseal with AWS KMS in production

3. **Token Leases**
   - Use short-lived tokens with proper TTLs
   - Renew tokens before expiration
   - Implement token revocation

4. **Secret Rotation**
   - Rotate secrets regularly (see rotation schedule)
   - Use automated rotation where possible
   - Document rotation procedures

5. **Audit Logging**
   - Enable audit logging for all environments
   - Monitor audit logs regularly
   - Send logs to SIEM for analysis

## Troubleshooting

### Vault Not Responding

```bash
# Check Vault status
kubectl exec -n vault vault-0 -- vault status

# Check if sealed
kubectl exec -n vault vault-0 -- vault status -format=json | jq '.sealed'

# Check pod logs
kubectl logs -n vault -l app.kubernetes.io/name=vault
```

### External Secrets Not Syncing

```bash
# Check External Secrets Operator logs
kubectl logs -n external-secrets deployment/external-secrets

# Check ExternalSecret status
kubectl get externalsecret -A

# Check secret status
kubectl get secret -A | grep session-state
```

### Services Cannot Access Secrets

```bash
# Check ServiceAccount has proper permissions
kubectl get sa -n harmonyflow-production

# Check Vault role exists
vault list auth/kubernetes/role

# Test Vault authentication
kubectl exec -n harmonyflow-production <pod-name> -- \
  vault write auth/kubernetes/login role=session-state-service jwt=<service-account-token>
```

## Maintenance

### Upgrade Vault

```bash
# Update image in vault-deployment.yaml
# Apply the changes
kubectl apply -f kubernetes/vault/vault-deployment.yaml

# Rolling upgrade will happen automatically
kubectl rollout status statefulset/vault -n vault
```

### Scale Vault

Edit the replicas in `vault-deployment.yaml`:

```yaml
spec:
  replicas: 5  # Increase from 3 to 5
```

Then apply:
```bash
kubectl apply -f kubernetes/vault/vault-deployment.yaml
```

## References

- [Vault Documentation](https://developer.hashicorp.com/vault)
- [External Secrets Operator](https://external-secrets.io)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Secret Rotation Runbook](SECRET_ROTATION.md)

## Support

For issues or questions:
- On-Call Engineer: oncall@harmonyflow.io
- DevOps Lead: devops-lead@harmonyflow.io
- #vault-integration Slack channel
