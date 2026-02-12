# HarmonyFlow Rollback Runbook

## Overview

This runbook provides procedures for rolling back deployments in the HarmonyFlow staging environment.

## When to Rollback

Rollback immediately if:
- Error rate exceeds 1%
- P95 latency exceeds 500ms for 5 minutes
- Health checks failing for >2 minutes
- Memory usage exceeds 90%
- Customer-impacting bugs detected

## Rollback Strategies

### 1. Kubernetes Rollback (Fastest - 30 seconds)

Rollback to the previous Kubernetes deployment revision:

```bash
# View deployment history
kubectl rollout history deployment/session-state-service -n harmonyflow-staging

# Rollback to previous revision
kubectl rollout undo deployment/session-state-service -n harmonyflow-staging

# Rollback to specific revision
kubectl rollout undo deployment/session-state-service -n harmonyflow-staging --to-revision=3

# Monitor rollback
kubectl rollout status deployment/session-state-service -n harmonyflow-staging --timeout=120s
```

### 2. Image Rollback (If Kubernetes rollback fails)

Manually specify a previous image:

```bash
# Get previous image tag
kubectl get deployment session-state-service -n harmonyflow-staging -o jsonpath='{.spec.template.spec.containers[0].image}'

# Set to previous known good image
kubectl set image deployment/session-state-service \
  session-state-service=ghcr.io/harmonyflow/session-state-service:staging-<previous-sha> \
  -n harmonyflow-staging

# Wait for rollout
kubectl rollout status deployment/session-state-service -n harmonyflow-staging
```

### 3. Git Revert (For configuration issues)

If the issue is with configuration:

```bash
# Revert the commit
git revert <bad-commit-sha>

# Push to trigger new deployment
git push origin develop

# Or manually apply previous config
kubectl apply -f infrastructure/staging/apps/session-state-service.yaml
```

### 4. Full Environment Rollback (Nuclear option)

If multiple components are affected:

```bash
# Apply last known good state
kubectl apply -f infrastructure/staging/apps/session-state-service.yaml --force

# Restart all pods
kubectl rollout restart deployment/session-state-service -n harmonyflow-staging
```

## Automated Rollback

The CI/CD pipeline includes automatic rollback on deployment failure:

```yaml
# Defined in .github/workflows/staging-deployment.yml
rollback:
  runs-on: ubuntu-latest
  needs: deploy-staging
  if: failure()
  steps:
    - name: Rollback deployment
      run: |
        kubectl rollout undo deployment/session-state-service -n harmonyflow-staging
```

To disable auto-rollback:

```bash
# Remove the rollback job from the workflow temporarily
```

## Database Rollback

### Redis

```bash
# Flush cache if corrupted data suspected
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli FLUSHDB

# Restore from backup if needed
kubectl apply -f infrastructure/kubernetes/redis/redis-restore-job.yaml
```

### PostgreSQL

⚠️ **WARNING**: Database rollbacks can cause data loss. Coordinate with the team.

```bash
# Restore from backup
kubectl apply -f infrastructure/kubernetes/postgresql/postgresql-restore.yaml

# Or rollback migrations manually
kubectl exec -it postgresql-primary-0 -n postgresql-staging -- psql -U harmonyflow -c "ROLLBACK MIGRATION"
```

## Verification After Rollback

### 1. Check Pod Status

```bash
kubectl get pods -n harmonyflow-staging

# All pods should be Running and Ready
```

### 2. Verify Image

```bash
kubectl describe deployment session-state-service -n harmonyflow-staging | grep Image
```

### 3. Health Checks

```bash
# Immediate check
curl -f https://api.staging.harmonyflow.io/health/ready

# Wait 30s and check again
sleep 30
curl -f https://api.staging.harmonyflow.io/health/live
```

### 4. Monitor Metrics

```bash
# Error rate should drop
# Latency should normalize
# Memory usage should stabilize
```

### 5. Test Functionality

```bash
# Test WebSocket connection
wscat -c wss://ws.staging.harmonyflow.io/session/connect

# Test API endpoints
curl -X POST https://api.staging.harmonyflow.io/session/snapshot \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test", "state": {}}'
```

## Post-Rollback Actions

### 1. Document the Incident

```bash
# Create incident report
cat > incident-$(date +%Y%m%d-%H%M%S).md << EOF
# Incident Report

**Date**: $(date)
**Environment**: Staging
**Service**: Session State Service
**Trigger**: [What triggered the rollback?]
**Impact**: [What was affected?]
**Resolution**: [How was it resolved?]

## Timeline
- [Time] - Issue detected
- [Time] - Rollback initiated
- [Time] - Rollback complete
- [Time] - Service verified healthy

## Root Cause
[To be determined]

## Action Items
- [ ] Root cause analysis
- [ ] Fix implementation
- [ ] Test in staging
- [ ] Deploy to production
EOF
```

### 2. Notify Stakeholders

```bash
# Post to Slack
# Tag: #incidents

# Message:
⚠️ ROLLBACK EXECUTED
Environment: Staging
Service: Session State Service
Reason: [Brief reason]
Status: Service restored
Impact: [Duration of impact]
Next Steps: Root cause analysis in progress
```

### 3. Create Follow-up Tasks

- [ ] Root cause analysis
- [ ] Fix implementation
- [ ] Add regression tests
- [ ] Update runbooks if needed
- [ ] Schedule post-mortem

## Prevention

### Before Deployment

- [ ] Feature flags enabled
- [ ] Canary deployment configured
- [ ] Monitoring dashboards ready
- [ ] Rollback plan documented
- [ ] On-call notified

### During Deployment

- [ ] Monitor error rates continuously
- [ ] Watch P95/P99 latency
- [ ] Check memory/cpu usage
- [ ] Verify health checks

## Emergency Contacts

- **DevOps On-Call**: PagerDuty rotation
- **Team Lead**: @lead-harmonyflow on Slack
- **Engineering Manager**: @em-harmonyflow on Slack

## Related Documentation

- [Deployment Runbook](./deployment-runbook.md)
- [Troubleshooting Guide](./troubleshooting-guide.md)
- [Monitoring Runbook](./monitoring-runbook.md)
- [Incident Response Plan](./incident-response.md)

## Appendix: Quick Commands

```bash
# Quick status check
kubectl get pods -n harmonyflow-staging -w

# View logs
kubectl logs -f deployment/session-state-service -n harmonyflow-staging

# View events
kubectl get events -n harmonyflow-staging --sort-by='.lastTimestamp' | tail -20

# Top pods
kubectl top pods -n harmonyflow-staging

# Exec into pod
kubectl exec -it deployment/session-state-service -n harmonyflow-staging -- /bin/sh
```
