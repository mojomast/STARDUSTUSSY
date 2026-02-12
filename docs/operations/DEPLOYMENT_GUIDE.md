# HarmonyFlow SyncBridge - Deployment Guide

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Owner:** DevOps Team  
**Classification:** INTERNAL USE ONLY

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Process](#deployment-process)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Rollback Procedures](#rollback-procedures)
6. [Environment-Specific Configurations](#environment-specific-configurations)

---

## Overview

This guide provides step-by-step procedures for deploying the HarmonyFlow SyncBridge platform to production environments.

### Deployment Strategy

- **Blue-Green Deployment:** Zero downtime deployments
- **Canary Releases:** Gradual traffic shift
- **Rolling Updates:** Kubernetes native updates
- **Automated Rollback:** Immediate rollback on failure

### Deployment Environments

| Environment | Purpose | URL |
|------------|---------|-----|
| Development | Local development | localhost:8080 |
| Staging | Pre-production testing | https://api.staging.harmonyflow.io |
| Production | Live production | https://api.harmonyflow.io |

---

## Pre-Deployment Checklist

### Code Quality

- [ ] All code reviews approved
- [ ] Unit tests passing (95%+ coverage)
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Security scan clean (no critical issues)
- [ ] Dependency scan clean

### Documentation

- [ ] API documentation updated
- [ ] Changelog updated
- [ ] Release notes prepared
- [ ] Runbooks reviewed and updated

### Infrastructure

- [ ] Infrastructure as code reviewed
- [ ] Terraform plan reviewed
- [ ] Kubernetes manifests validated
- [ ] Secrets prepared and tested
- [ ] Certificates valid (30+ days)

### Monitoring

- [ ] Monitoring dashboards updated
- [ ] Alert rules reviewed
- [ ] Health check endpoints configured
- [ ] Logging configured

### Database

- [ ] Migrations prepared
- [ ] Backups verified
- [ ] Rollback scripts ready
- [ ] Performance tested

### Security

- [ ] Secrets rotated (if due)
- [ ] Security review completed
- [ ] Compliance verified
- [ ] Penetration test passed (if required)

### Stakeholder Approval

- [ ] Engineering Lead approval
- [ ] DevOps Lead approval
- [ ] Security Lead approval (if security changes)
- [ ] Product approval (if user-facing changes)
- [ ] Change request approved

---

## Deployment Process

### Staging Deployment

#### Step 1: Merge to Develop Branch

```bash
# Create feature branch
git checkout -b feature/new-feature develop

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/new-feature

# Merge PR after review
```

#### Step 2: Trigger CI/CD Pipeline

The staging deployment triggers automatically on merge to `develop`:

```bash
# Monitor deployment
gh run list --branch develop

# View workflow logs
gh run view <run-id> --log
```

#### Step 3: Verify Staging Deployment

```bash
# Configure kubectl context
aws eks update-kubeconfig --region us-west-2 --name harmonyflow-staging
kubectl config use-context staging

# Check deployment status
kubectl get pods -n harmonyflow-staging
kubectl get services -n harmonyflow-staging

# Verify health
curl https://api.staging.harmonyflow.io/health

# Run smoke tests
npm test -- tests/smoke/staging.js
```

#### Step 4: Run Integration Tests

```bash
# Run full test suite
npm test -- tests/integration/staging/

# Run E2E tests
npm run test:e2e -- --env=staging

# Load testing
k6 run tests/load/stage_test.js
```

#### Step 5: Stakeholder Sign-off

- [ ] QA approval
- [ ] Product approval
- [ ] DevOps approval

---

### Production Deployment

#### Step 1: Prepare Production Branch

```bash
# Merge develop to main
git checkout main
git merge develop

# Tag release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main --tags
```

#### Step 2: Pre-Deployment Verification

```bash
# Verify staging is stable
kubectl top pods -n harmonyflow-staging
curl https://api.staging.harmonyflow.io/health

# Check production current state
aws eks update-kubeconfig --region us-west-2 --name harmonyflow-production
kubectl config use-context production
kubectl get pods -n harmonyflow
```

#### Step 3: Deploy Infrastructure Changes

```bash
# Apply Terraform changes
cd infrastructure/production/terraform
terraform plan -out=tfplan
terraform apply tfplan

# Verify infrastructure
terraform output
```

#### Step 4: Deploy Application

```bash
# Option 1: Automated CI/CD (recommended)
# Push to main triggers automatic deployment
# Monitor via GitHub Actions

# Option 2: Manual deployment
kubectl set image deployment/session-state-service \
  session-state-service=ghcr.io/harmonyflow/session-state-service:v1.0.0 \
  -n harmonyflow

# Monitor rollout
kubectl rollout status deployment/session-state-service -n harmonyflow
```

#### Step 5: Blue-Green Deployment

```bash
# Create new deployment (green)
kubectl apply -f k8s/deployment-green.yaml

# Wait for green to be ready
kubectl wait --for=condition=available deployment/session-state-service-green \
  -n harmonyflow --timeout=300s

# Switch traffic gradually (canary)
# Update Ingress to route 10% to green
kubectl apply -f k8s/ingress-canary-10.yaml

# Monitor metrics for 5 minutes

# Increase to 50%
kubectl apply -f k8s/ingress-canary-50.yaml

# Monitor metrics for 5 minutes

# Switch to 100% green
kubectl apply -f k8s/ingress-canary-100.yaml

# Delete old deployment (blue)
kubectl delete deployment session-state-service -n harmonyflow
```

#### Step 6: Post-Deployment Checks

```bash
# Health checks
curl https://api.harmonyflow.io/health
curl https://api.harmonyflow.io/health/ready
curl https://api.harmonyflow.io/health/live

# Check pods
kubectl get pods -n harmonyflow
kubectl top pods -n harmonyflow

# Check logs
kubectl logs -f deployment/session-state-service -n harmonyflow --tail=100

# Monitor metrics
curl 'http://prometheus/api/v1/query?query=up{job="session-state-service"}'
```

#### Step 7: Run Production Smoke Tests

```bash
# Run smoke tests
npm test -- tests/smoke/production.js

# Run critical path tests
npm test -- tests/e2e/critical/

# Verify key functionality
# - Authentication
# - Session creation
# - WebSocket connection
# - State sync
# - Multi-device handoff
```

---

## Post-Deployment Verification

### Health Checks

#### Application Health

```bash
# API health
curl -f https://api.harmonyflow.io/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-02-12T12:00:00Z",
#   "version": "1.0.0",
#   "services": {
#     "database": "connected",
#     "cache": "connected",
#     "messageQueue": "connected"
#   },
#   "uptime": 86400
# }
```

#### Database Health

```bash
# PostgreSQL
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "SELECT 1;"

# Redis
kubectl exec -it redis-cluster-0 -n redis -- redis-cli ping
```

#### Service Health

```bash
# Check all services are healthy
kubectl get pods -n harmonyflow -o wide

# Check service mesh
linkerd check
linkerd viz stat deployment/session-state-service -n harmonyflow
```

### Performance Verification

#### API Response Time

```bash
# Measure API latency
time curl https://api.harmonyflow.io/health

# Check metrics
curl 'http://prometheus/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'
```

#### WebSocket Latency

```bash
# Test WebSocket connection
wscat -c wss://api.harmonyflow.io/v1/ws/sessions/test?token=<jwt>&deviceId=test

# Measure round-trip time
# (Monitor response time in WebSocket messages)
```

#### Database Performance

```bash
# Check query performance
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

### Monitoring Verification

#### Metrics

```bash
# Check metrics are being collected
curl 'http://prometheus/api/v1/query?query=up'

# Check specific metrics
curl 'http://prometheus/api/v1/query?query=sessions_active_total'
curl 'http://prometheus/api/v1/query?query=websocket_connections_total'
```

#### Logs

```bash
# Check for errors
kubectl logs deployment/session-state-service -n harmonyflow | grep -i error

# Check for warnings
kubectl logs deployment/session-state-service -n harmonyflow | grep -i warning
```

#### Alerts

```bash
# Verify no critical alerts
curl 'http://alertmanager/api/v1/alerts' | jq '.[] | select(.labels.severity == "critical")'
```

---

## Rollback Procedures

### Automated Rollback

```bash
# Kubernetes native rollback
kubectl rollout undo deployment/session-state-service -n harmonyflow

# Monitor rollback
kubectl rollout status deployment/session-state-service -n harmonyflow

# Verify previous version
kubectl describe deployment session-state-service -n harmonyflow | grep Image
```

### Manual Rollback

```bash
# Step 1: Scale down
kubectl scale deployment session-state-service -n harmonyflow --replicas=0

# Step 2: Deploy previous version
kubectl set image deployment/session-state-service \
  session-state-service=ghcr.io/harmonyflow/session-state-service:v0.9.9 \
  -n harmonyflow

# Step 3: Scale up
kubectl scale deployment session-state-service -n harmonyflow --replicas=3

# Step 4: Verify
kubectl rollout status deployment/session-state-service -n harmonyflow
```

### Database Rollback

```bash
# Step 1: Identify rollback migration
ls migrations/ | grep rollback

# Step 2: Apply rollback migration
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -d harmonyflow -f /tmp/migrations/rollback_001.sql

# Step 3: Verify data integrity
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "SELECT COUNT(*) FROM sessions;"
```

### Emergency Rollback

For critical issues requiring immediate rollback:

```bash
# Quick emergency rollback
#!/bin/bash
# emergency_rollback.sh

# 1. Scale to zero
kubectl scale deployment session-state-service -n harmonyflow --replicas=0

# 2. Switch to previous stable version
kubectl apply -f k8s/deployment-stable.yaml

# 3. Restart with stable version
kubectl scale deployment session-state-service -n harmonyflow --replicas=3

# 4. Notify team
# Send alert to #devops-alerts Slack channel
```

---

## Environment-Specific Configurations

### Development

```yaml
# .env.development
DATABASE_URL=postgresql://localhost:5432/harmonyflow_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-key-do-not-use-in-prod
LOG_LEVEL=debug
ALLOWED_ORIGINS=http://localhost:3000
RATE_LIMIT_ENABLED=false
```

### Staging

```yaml
# Kubernetes ConfigMap: session-state-service-config-staging
apiVersion: v1
kind: ConfigMap
metadata:
  name: session-state-service-config
  namespace: harmonyflow-staging
data:
  DATABASE_URL: "postgresql://harmonyflow:$(POSTGRES_PASSWORD)@postgresql-primary.postgresql.svc.cluster.local:5432/harmonyflow"
  REDIS_URL: "redis://:$(REDIS_PASSWORD)@redis-cluster.redis.svc.cluster.local:6379"
  LOG_LEVEL: "info"
  ALLOWED_ORIGINS: "https://staging.harmonyflow.io"
  RATE_LIMIT_ENABLED: "true"
  ENVIRONMENT: "staging"
```

### Production

```yaml
# Kubernetes ConfigMap: session-state-service-config-prod
apiVersion: v1
kind: ConfigMap
metadata:
  name: session-state-service-config
  namespace: harmonyflow
data:
  DATABASE_URL: "postgresql://harmonyflow:$(POSTGRES_PASSWORD)@postgresql-primary.postgresql.svc.cluster.local:5432/harmonyflow"
  REDIS_URL: "redis://:$(REDIS_PASSWORD)@redis-cluster.redis.svc.cluster.local:6379"
  LOG_LEVEL: "warn"
  ALLOWED_ORIGINS: "https://app.harmonyflow.io,https://www.harmonyflow.io"
  RATE_LIMIT_ENABLED: "true"
  ENVIRONMENT: "production"
```

### Secrets Management

Secrets are managed via HashiCorp Vault and synced to Kubernetes:

```yaml
# Kubernetes Secret: session-state-service-secrets
apiVersion: v1
kind: Secret
metadata:
  name: session-state-service-secrets
  namespace: harmonyflow
type: Opaque
stringData:
  JWT_SECRET: <from-vault>
  POSTGRES_PASSWORD: <from-vault>
  REDIS_PASSWORD: <from-vault>
  ENCRYPTION_KEY: <from-vault>
```

---

## Deployment Schedule

### Standard Deployment Window

- **Days:** Tuesday - Thursday
- **Time:** 10:00 AM - 2:00 PM PST (non-peak)
- **Lead Time:** 3 business days notice

### Emergency Deployment

- **Severity:** P1/P2 incidents only
- **Approval:** Engineering Lead or CTO
- **Lead Time:** Immediate

### Blackout Periods

- **Days:** Friday - Monday (holidays)
- **Times:** 2:00 PM - 10:00 AM PST
- **Events:** Major holidays, Black Friday, Cyber Monday

---

## Troubleshooting Deployment Issues

### Deployment Stuck

```bash
# Check deployment status
kubectl describe deployment session-state-service -n harmonyflow

# Check pod status
kubectl describe pod <pod-name> -n harmonyflow

# Common issues:
# - Image pull errors: Check image exists
# - Resource limits: Increase limits
# - Config errors: Verify ConfigMap/Secret
```

### Health Check Failing

```bash
# Check health endpoint logs
kubectl logs -f deployment/session-state-service -n harmonyflow | grep health

# Check dependencies
kubectl exec -it postgresql-primary-0 -n postgresql -- pg_isready
kubectl exec -it redis-cluster-0 -n redis -- redis-cli ping

# Check network policies
kubectl get networkpolicy -n harmonyflow
```

### Errors After Deployment

```bash
# Check recent logs
kubectl logs -f deployment/session-state-service -n harmonyflow --since=10m

# Check events
kubectl get events -n harmonyflow --sort-by='.lastTimestamp'

# Check metrics
curl 'http://prometheus/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'
```

---

## Deployment Best Practices

### Before Deployment

1. **Test in staging** always
2. **Review all changes** thoroughly
3. **Have rollback plan** ready
4. **Notify stakeholders** in advance
5. **Monitor during deployment** actively

### During Deployment

1. **Monitor logs** in real-time
2. **Check health** at each step
3. **Be prepared to rollback** at any time
4. **Communicate status** to team
5. **Document any issues**

### After Deployment

1. **Run smoke tests** immediately
2. **Monitor metrics** for 30 minutes
3. **Check error rates**
4. **Update documentation** if needed
5. **Conduct post-mortem** if issues occurred

---

## Related Documentation

- [Deployment Runbook](../runbooks/deployment-runbook.md)
- [Rollback Runbook](../runbooks/rollback-runbook.md)
- [Monitoring Runbook](../runbooks/monitoring-runbook.md)
- [Operations Handbook](../handoff/OPERATIONS_HANDBOOK.md)

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-05-12
