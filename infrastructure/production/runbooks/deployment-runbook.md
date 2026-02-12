# Production Deployment Runbook

## Overview

This runbook covers procedures for deploying to the HarmonyFlow production environment using blue/green, canary, or rolling deployment strategies.

## Prerequisites

- Access to GitHub repository
- AWS credentials configured
- kubectl configured for production cluster
- Slack notifications configured

## Deployment Strategies

### 1. Blue/Green Deployment (Recommended for Major Releases)

**Use when:**
- Deploying major version updates
- Infrastructure changes
- Database schema migrations
- Zero-downtime requirement critical

**Steps:**

1. **Trigger Deployment**
   ```bash
   # Via GitHub Actions UI
   # Navigate to Actions → Production Deployment → Run workflow
   # Select 'blue-green' strategy
   ```

2. **Monitor Deployment**
   ```bash
   # Watch deployment progress
   kubectl get deployments -n harmonyflow-production -w
   
   # Check new pods
   kubectl get pods -n harmonyflow-production -l version=green
   
   # View logs
   kubectl logs -f deployment/session-state-service-green -n harmonyflow-production
   ```

3. **Verify Deployment**
   ```bash
   # Health check
   curl https://api.harmonyflow.io/health
   
   # Check all pods ready
   kubectl get pods -n harmonyflow-production
   ```

4. **Rollback if Needed**
   ```bash
   # Switch back to previous color
   kubectl patch service session-state-service -n harmonyflow-production -p \
     '{"spec":{"selector":{"version":"blue"}}}'
   ```

### 2. Canary Deployment (Recommended for Testing in Production)

**Use when:**
- Testing new features with limited traffic
- Gradual rollout required
- Risk mitigation for uncertain changes

**Steps:**

1. **Trigger Canary Deployment**
   ```bash
   # Via GitHub Actions UI
   # Select 'canary' strategy
   # Choose percentage: 5%, 10%, 25%, 50%, or 75%
   ```

2. **Monitor Canary Metrics**
   ```bash
   # Watch canary error rate
   kubectl exec -it deployment/prometheus -n monitoring -- \
     wget -qO- 'http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{version="canary",status=~"5.."}[5m]))'
   
   # Check canary latency
   kubectl exec -it deployment/prometheus -n monitoring -- \
     wget -qO- 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket{version="canary"}[5m]))by(le))'
   ```

3. **Promote or Rollback**
   - If metrics look good, canary will auto-promote after 10 minutes
   - If error rate > 5%, canary will auto-rollback

### 3. Rolling Deployment (Default for Minor Updates)

**Use when:**
- Minor bug fixes
- Configuration updates
- Quick patches

**Steps:**

1. **Trigger Rolling Deployment**
   ```bash
   # Via GitHub Actions UI
   # Select 'rolling' strategy
   ```

2. **Monitor Rollout**
   ```bash
   kubectl rollout status deployment/session-state-service -n harmonyflow-production
   ```

## Emergency Procedures

### Immediate Rollback

If critical issues are detected:

```bash
# Rollback to previous revision
kubectl rollout undo deployment/session-state-service -n harmonyflow-production

# Verify rollback
kubectl rollout status deployment/session-state-service -n harmonyflow-production

# Check pods
kubectl get pods -n harmonyflow-production
```

### Scale Down Problematic Deployment

```bash
# Scale down canary
kubectl scale deployment session-state-service-canary --replicas=0 -n harmonyflow-production

# Scale down green (if blue/green)
kubectl scale deployment session-state-service-green --replicas=0 -n harmonyflow-production
```

## Verification Checklist

- [ ] All pods in Running state
- [ ] No CrashLoopBackOff or Error states
- [ ] Health endpoint returns 200 OK
- [ ] Error rate < 0.1% (1 in 1000 requests)
- [ ] P95 latency < 200ms
- [ ] WebSocket connections stable
- [ ] Database connections healthy
- [ ] Redis connections healthy
- [ ] RabbitMQ queues processing normally

## Monitoring During Deployment

Watch these dashboards:
1. **SLO Dashboard**: https://grafana.harmonyflow.io/d/slo
2. **Infrastructure Dashboard**: https://grafana.harmonyflow.io/d/infrastructure
3. **Application Dashboard**: https://grafana.harmonyflow.io/d/application

## Post-Deployment Tasks

1. **Verify Metrics** (5 minutes after deployment)
   - Check error rate in Grafana
   - Verify latency percentiles
   - Confirm resource utilization

2. **Notify Team**
   - Deployment completion is automatically notified in Slack
   - Verify notification received in #deployments channel

3. **Monitor for 1 Hour**
   - Keep Grafana dashboards open
   - Watch for any alerts
   - Be prepared to rollback if issues arise

## Troubleshooting

### Deployment Stuck

```bash
# Check deployment status
kubectl describe deployment session-state-service -n harmonyflow-production

# Check pod events
kubectl describe pods -n harmonyflow-production -l app=session-state-service

# Check for resource constraints
kubectl top nodes
kubectl top pods -n harmonyflow-production
```

### Image Pull Errors

```bash
# Verify image exists
docker pull ghcr.io/harmonyflow/session-state-service:<tag>

# Check image pull secrets
kubectl get secrets -n harmonyflow-production
```

### Service Not Accessible

```bash
# Check service endpoints
kubectl get endpoints session-state-service -n harmonyflow-production

# Check ingress
kubectl get ingress -n harmonyflow-production

# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller
```

## Contact Information

- **On-Call Engineer**: Check PagerDuty rotation
- **Platform Team**: platform@harmonyflow.io
- **Emergency Escalation**: +1-555-HARMONY

## References

- [Blue/Green Deployment Pattern](https://martinfowler.com/bliki/BlueGreenDeployment.html)
- [Canary Release Pattern](https://martinfowler.com/bliki/CanaryRelease.html)
- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
