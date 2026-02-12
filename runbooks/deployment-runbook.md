# HarmonyFlow Staging Deployment Runbook

## Overview

This runbook covers the deployment procedures for the HarmonyFlow SyncBridge staging environment.

## Staging Environment Details

- **Environment**: staging
- **Cluster**: harmonyflow-staging (EKS)
- **Region**: us-west-2
- **Namespace**: harmonyflow-staging
- **URLs**:
  - API: https://api.staging.harmonyflow.io
  - WebSocket: wss://ws.staging.harmonyflow.io
  - Grafana: https://grafana.staging.harmonyflow.io

## Pre-Deployment Checklist

- [ ] All PRs merged to `develop` or `main` branch
- [ ] CI/CD pipeline tests passing
- [ ] Docker image built and pushed to GHCR
- [ ] Infrastructure configs reviewed
- [ ] Database migrations prepared (if applicable)
- [ ] Secrets updated in Vault (if applicable)
- [ ] Rollback plan documented

## Deployment Procedure

### Automated Deployment (Preferred)

The staging environment deploys automatically on merge to `develop` or `main`:

```bash
# Monitor deployment status
git checkout develop
git pull origin develop

# Push to trigger deployment
git push origin develop

# Watch CI/CD pipeline
github workflows view staging-deployment
```

### Manual Deployment (Emergency)

If automated deployment fails:

```bash
# 1. Configure AWS credentials
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
export AWS_REGION=us-west-2

# 2. Update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name harmonyflow-staging

# 3. Deploy infrastructure
kubectl apply -f infrastructure/kubernetes/linkerd/
kubectl apply -f infrastructure/kubernetes/redis/
kubectl apply -f infrastructure/kubernetes/postgresql/
kubectl apply -f infrastructure/kubernetes/rabbitmq/

# 4. Deploy application
kubectl apply -f infrastructure/staging/apps/session-state-service.yaml
kubectl apply -f infrastructure/staging/ingress/staging-ingress.yaml

# 5. Update image tag
kubectl set image deployment/session-state-service \
  session-state-service=ghcr.io/harmonyflow/session-state-service:staging-<sha> \
  -n harmonyflow-staging

# 6. Verify deployment
kubectl rollout status deployment/session-state-service -n harmonyflow-staging
```

## Post-Deployment Verification

### 1. Check Pod Status

```bash
kubectl get pods -n harmonyflow-staging

# Expected output:
# NAME                                      READY   STATUS    RESTARTS   AGE
# session-state-service-7d9f4b8c5-x2k9m    2/2     Running   0          2m
# session-state-service-7d9f4b8c5-y3l0n    2/2     Running   0          2m
# session-state-service-7d9f4b8c5-z4m1p    2/2     Running   0          2m
```

### 2. Verify Services

```bash
kubectl get svc -n harmonyflow-staging
```

### 3. Check Ingress

```bash
kubectl get ingress -n harmonyflow-staging
```

### 4. Health Checks

```bash
# API health
curl -f https://api.staging.harmonyflow.io/health/ready
curl -f https://api.staging.harmonyflow.io/health/live

# WebSocket test
wscat -c wss://ws.staging.harmonyflow.io/session/connect
```

### 5. Monitoring Dashboards

- **Grafana**: https://grafana.staging.harmonyflow.io
  - Username: admin
  - Password: (from Vault)

- **Linkerd Dashboard**:
  ```bash
  linkerd viz dashboard &
  ```

### 6. Check Metrics

```bash
# Prometheus query
curl 'https://prometheus.staging.harmonyflow.io/api/v1/query?query=up'

# Custom metrics
curl 'https://prometheus.staging.harmonyflow.io/api/v1/query?query=sessions_active'
```

## Component Status

| Component | Namespace | Status Check |
|-----------|-----------|--------------|
| Session State Service | harmonyflow-staging | `kubectl get pods -n harmonyflow-staging` |
| Redis | redis-staging | `kubectl get pods -n redis-staging` |
| PostgreSQL | postgresql-staging | `kubectl get pods -n postgresql-staging` |
| RabbitMQ | rabbitmq-staging | `kubectl get pods -n rabbitmq-staging` |
| Linkerd | linkerd | `kubectl get pods -n linkerd` |
| Monitoring | monitoring | `kubectl get pods -n monitoring` |

## Common Issues

### Pod Stuck in Pending

```bash
# Check events
kubectl describe pod <pod-name> -n harmonyflow-staging

# Check node resources
kubectl top nodes

# Check PVC status
kubectl get pvc -n harmonyflow-staging
```

### Image Pull Errors

```bash
# Verify image exists
docker pull ghcr.io/harmonyflow/session-state-service:staging-latest

# Check image pull secrets
kubectl get secret ghcr-credentials -n harmonyflow-staging -o yaml
```

### Service Mesh Issues

```bash
# Check Linkerd proxy status
kubectl get pods -n harmonyflow-staging -o jsonpath='{.items[*].metadata.annotations.linkerd\.io/proxy-status}'

# Check mTLS
linkerd viz stat deployment/session-state-service -n harmonyflow-staging
```

### Database Connection Failures

```bash
# Test Redis connection
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli ping

# Check PostgreSQL
kubectl exec -it postgresql-primary-0 -n postgresql-staging -- psql -U harmonyflow -c "SELECT 1"
```

## Rollback Procedure

See: [Rollback Runbook](./rollback-runbook.md)

Quick rollback:

```bash
# Rollback to previous revision
kubectl rollout undo deployment/session-state-service -n harmonyflow-staging

# Monitor rollback
kubectl rollout status deployment/session-state-service -n harmonyflow-staging

# Verify previous image
kubectl describe deployment session-state-service -n harmonyflow-staging | grep Image
```

## Contact Information

- **On-call**: #incidents Slack channel
- **Email**: devops@harmonyflow.io
- **PagerDuty**: HarmonyFlow Staging On-Call

## Related Documentation

- [Infrastructure README](../infrastructure/README.md)
- [Rollback Runbook](./rollback-runbook.md)
- [Troubleshooting Guide](./troubleshooting-guide.md)
- [Monitoring Runbook](./monitoring-runbook.md)
