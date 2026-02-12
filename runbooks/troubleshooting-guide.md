# HarmonyFlow Troubleshooting Guide

## Overview

This guide provides troubleshooting steps for common issues in the HarmonyFlow staging environment.

## Quick Diagnostic Commands

```bash
# Get cluster overview
kubectl cluster-info
kubectl get nodes -o wide
kubectl top nodes

# Check all pods
kubectl get pods --all-namespaces

# Check all services
kubectl get svc --all-namespaces

# Check ingress
kubectl get ingress --all-namespaces

# Recent events
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -50

# Pod resource usage
kubectl top pods --all-namespaces
```

## Service-Specific Troubleshooting

### Session State Service

#### Service Not Responding

```bash
# Check pod status
kubectl get pods -n harmonyflow-staging -l app=session-state-service

# Check logs
kubectl logs -n harmonyflow-staging -l app=session-state-service --tail=100 -f

# Check previous pod logs (if restarted)
kubectl logs -n harmonyflow-staging -l app=session-state-service --previous

# Exec into pod for debugging
kubectl exec -it -n harmonyflow-staging deployment/session-state-service -- /bin/sh

# Test health endpoint from inside pod
wget -qO- http://localhost:8080/health/ready
```

#### High Memory Usage

```bash
# Check memory usage
kubectl top pod -n harmonyflow-staging -l app=session-state-service

# Check for memory leaks in logs
kubectl logs -n harmonyflow-staging -l app=session-state-service | grep -i "memory\|oom"

# Check limits
kubectl describe pod -n harmonyflow-staging -l app=session-state-service | grep -A5 "Limits"

# Restart deployment to free memory
kubectl rollout restart deployment/session-state-service -n harmonyflow-staging
```

#### WebSocket Connection Issues

```bash
# Check WebSocket logs
kubectl logs -n harmonyflow-staging -l app=session-state-service | grep -i websocket

# Check connection count
kubectl exec -n harmonyflow-staging deployment/session-state-service -- wget -qO- http://localhost:9090/metrics | grep websocket_connections

# Test WebSocket from outside
wscat -c wss://ws.staging.harmonyflow.io/session/connect

# Check Linkerd mTLS
linkerd viz stat deployment/session-state-service -n harmonyflow-staging
```

### Redis

#### Redis Cluster Not Forming

```bash
# Check Redis pods
kubectl get pods -n redis-staging

# Check Redis logs
kubectl logs -n redis-staging redis-cluster-0

# Check cluster nodes
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli cluster nodes

# Check cluster info
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli cluster info

# Reinitialize cluster if needed
kubectl delete job redis-cluster-init -n redis-staging
kubectl apply -f infrastructure/kubernetes/redis/redis-cluster.yaml
```

#### High Memory Usage

```bash
# Check memory usage
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli info memory

# Check key count
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli dbsize

# Find large keys
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli --bigkeys

# Check eviction policy
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli config get maxmemory-policy
```

#### Connection Issues

```bash
# Test Redis connection
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli ping

# Check connection count
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli info clients

# Check for blocked clients
kubectl exec -it redis-cluster-0 -n redis-staging -- redis-cli client list

# Test from application pod
kubectl exec -it -n harmonyflow-staging deployment/session-state-service -- nc -zv redis-cluster.redis-staging.svc.cluster.local 6379
```

### PostgreSQL

#### PostgreSQL Not Starting

```bash
# Check PostgreSQL pods
kubectl get pods -n postgresql-staging

# Check PostgreSQL logs
kubectl logs -n postgresql-staging postgresql-primary-0

# Check PVC status
kubectl get pvc -n postgresql-staging

# Check disk space
kubectl exec -it postgresql-primary-0 -n postgresql-staging -- df -h
```

#### Replication Lag

```bash
# Check replication status
kubectl exec -it postgresql-replica-0 -n postgresql-staging -- psql -U harmonyflow -c "SELECT * FROM pg_stat_wal_receiver;"

# Check replication lag
kubectl exec -it postgresql-replica-0 -n postgresql-staging -- psql -U harmonyflow -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# Check connection count
kubectl exec -it postgresql-primary-0 -n postgresql-staging -- psql -U harmonyflow -c "SELECT count(*) FROM pg_stat_activity;"
```

### RabbitMQ

#### RabbitMQ Cluster Issues

```bash
# Check RabbitMQ pods
kubectl get pods -n rabbitmq-staging

# Check RabbitMQ status
kubectl exec -it rabbitmq-0 -n rabbitmq-staging -- rabbitmqctl cluster_status

# Check queue depth
kubectl exec -it rabbitmq-0 -n rabbitmq-staging -- rabbitmqctl list_queues

# Check connections
kubectl exec -it rabbitmq-0 -n rabbitmq-staging -- rabbitmqctl list_connections
```

## Linkerd Service Mesh Issues

### mTLS Not Working

```bash
# Check Linkerd pods
kubectl get pods -n linkerd

# Check proxy status
kubectl get pods -n harmonyflow-staging -o jsonpath='{.items[*].metadata.annotations.linkerd\.io/proxy-status}'

# Check mTLS between services
linkerd viz edges deployment -n harmonyflow-staging

# Check tap
linkerd viz tap deployment/session-state-service -n harmonyflow-staging

# Check certificates
kubectl get secret -n linkerd linkerd-identity-issuer -o yaml
```

### Traffic Split Issues

```bash
# Check traffic split
kubectl get trafficsplit -n harmonyflow-staging

# Check service profiles
kubectl get serviceprofile -n harmonyflow-staging

# View traffic distribution
linkerd viz stat deployment -n harmonyflow-staging
```

## Ingress/Issues

### Certificate Issues

```bash
# Check certificate status
kubectl get certificate -n harmonyflow-staging

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Describe certificate
kubectl describe certificate harmonyflow-staging-tls -n harmonyflow-staging

# Force renewal
kubectl delete secret harmonyflow-staging-tls-secret -n harmonyflow-staging
```

### 502/503 Errors

```bash
# Check ingress controller logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller

# Check backend health
kubectl exec -it -n ingress-nginx deployment/ingress-nginx-controller -- wget -qO- http://session-state-service.harmonyflow-staging.svc.cluster.local:8080/health/ready

# Check endpoints
kubectl get endpoints -n harmonyflow-staging

# Check service selector
kubectl describe svc session-state-service -n harmonyflow-staging
```

## Monitoring Issues

### Prometheus Not Scraping

```bash
# Check Prometheus pods
kubectl get pods -n monitoring

# Check targets
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Then open http://localhost:9090/targets

# Check service monitors
kubectl get servicemonitor -n monitoring

# Check prometheus rules
kubectl get prometheusrule -n monitoring
```

### Grafana Dashboard Not Loading

```bash
# Check Grafana pods
kubectl get pods -n monitoring -l app=grafana

# Check Grafana logs
kubectl logs -n monitoring -l app=grafana

# Check data source connectivity
kubectl port-forward -n monitoring svc/grafana 3000:3000
# Then open http://localhost:3000
```

## Network Issues

### DNS Resolution Failures

```bash
# Test DNS from pod
kubectl run -it --rm debug --image=busybox:1.28 --restart=Never -- nslookup kubernetes.default

# Check CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns

# Check network policies
kubectl get networkpolicy --all-namespaces
```

### Network Policy Blocking

```bash
# Check network policies
kubectl get networkpolicy -n harmonyflow-staging

# Describe network policy
kubectl describe networkpolicy session-state-service-network-policy -n harmonyflow-staging

# Temporarily allow all traffic for testing
# kubectl delete networkpolicy -n harmonyflow-staging --all
```

## Common Error Patterns

### ImagePullBackOff

```bash
# Check image name
kubectl describe pod -n harmonyflow-staging <pod-name> | grep Image

# Verify image exists in registry
docker pull ghcr.io/harmonyflow/session-state-service:staging-latest

# Check image pull secrets
kubectl get secret -n harmonyflow-staging
kubectl describe pod -n harmonyflow-staging <pod-name> | grep -A5 "Events"
```

### CrashLoopBackOff

```bash
# Check logs
kubectl logs -n harmonyflow-staging <pod-name> --previous

# Check exit code
kubectl describe pod -n harmonyflow-staging <pod-name> | grep "Exit Code"

# Common causes:
# - Missing environment variables
# - Database connection failure
# - Port already in use
# - Permission issues
```

### Pending Pods

```bash
# Check node resources
kubectl describe node

# Check events
kubectl get events -n harmonyflow-staging --field-selector type=Warning

# Common causes:
# - Insufficient CPU/memory
# - No available nodes
# - PVC not bound
# - Node selector mismatch
```

## Log Aggregation with Loki

```bash
# Query logs via Loki
# Install logcli if needed
curl -O -L "https://github.com/grafana/loki/releases/download/v2.9.0/logcli-linux-amd64.zip"

# Query specific pod
logcli query '{namespace="harmonyflow-staging",pod=~"session-state-service.*"}'

# Query with time range
logcli query '{namespace="harmonyflow-staging"}' --from="2024-01-01T00:00:00Z" --to="2024-01-02T00:00:00Z"
```

## Getting Help

If issues persist:

1. Collect diagnostic information:
```bash
# Get all resources
kubectl get all -n harmonyflow-staging -o yaml > harmonyflow-resources.yaml

# Get events
kubectl get events -n harmonyflow-staging --sort-by='.lastTimestamp' > harmonyflow-events.log

# Get logs
kubectl logs -n harmonyflow-staging -l app=session-state-service --all-containers > harmonyflow-logs.log

# Get node info
kubectl describe nodes > harmonyflow-nodes.txt
```

2. Create GitHub issue with:
   - Error messages
   - Diagnostic outputs
   - Steps to reproduce
   - Recent changes

3. Contact:
   - Slack: #infrastructure
   - Email: devops@harmonyflow.io
   - PagerDuty: For critical issues

## Prevention

- Always test changes in staging before production
- Use feature flags for risky changes
- Monitor dashboards during deployments
- Keep runbooks updated
- Practice rollback procedures regularly
