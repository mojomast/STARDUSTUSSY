# HarmonyFlow SyncBridge - Monitoring Runbook

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Owner:** DevOps Team  
**Classification:** INTERNAL USE ONLY

---

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Stack](#monitoring-stack)
3. [Key Metrics](#key-metrics)
4. [Alerts](#alerts)
5. [Dashboards](#dashboards)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This runbook covers monitoring and alerting for the HarmonyFlow SyncBridge platform.

### Objectives

- Detect issues before they impact users
- Understand system health at a glance
- Enable rapid incident response
- Provide data for capacity planning

---

## Monitoring Stack

### Components

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Services   │──────>│  Prometheus  │──────>│   Grafana    │
│              │      │              │      │              │
└──────────────┘      └──────┬───────┘      └──────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │ AlertManager │
                      └──────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │ PagerDuty/   │
                      │ Slack Email  │
                      └──────────────┘
```

### Tools

| Tool | Purpose | Access |
|------|---------|--------|
| Prometheus | Metrics collection | http://prometheus.harmonyflow.io |
| Grafana | Visualization | http://grafana.harmonyflow.io |
| AlertManager | Alert routing | Internal |
| Linkerd Viz | Service mesh metrics | `linkerd viz` |
| Loki | Log aggregation | http://loki.harmonyflow.io |

---

## Key Metrics

### Application Metrics

#### Session State Service

| Metric | Type | Warning | Critical | Description |
|--------|------|---------|----------|-------------|
| `sessions_active_total` | Gauge | 5,000 | 8,000 | Active sessions |
| `websocket_connections_total` | Gauge | 8,000 | 10,000 | WebSocket connections |
| `state_sync_duration_seconds` | Histogram | p95 > 100ms | p95 > 500ms | State sync latency |
| `state_delta_duration_seconds` | Histogram | p95 > 50ms | p95 > 200ms | Delta apply latency |
| `http_requests_total` | Counter | - | - | HTTP request count |
| `http_request_duration_seconds` | Histogram | p95 > 200ms | p95 > 1s | HTTP request latency |

#### Database Metrics

| Metric | Type | Warning | Critical | Description |
|--------|------|---------|----------|-------------|
| `redis_connected_clients` | Gauge | 1,000 | 1,500 | Redis connections |
| `redis_memory_used_bytes` | Gauge | 8GB | 12GB | Redis memory usage |
| `redis_keyspace_hits_total` | Counter | - | - | Cache hits |
| `redis_keyspace_misses_total` | Counter | - | - | Cache misses |
| `postgresql_connections_active` | Gauge | 80 | 100 | DB connections |
| `postgresql_query_duration_seconds` | Histogram | p95 > 100ms | p95 > 500ms | Query latency |

#### Infrastructure Metrics

| Metric | Type | Warning | Critical | Description |
|--------|------|---------|----------|-------------|
| `node_cpu_usage_percent` | Gauge | 70% | 90% | CPU usage |
| `node_memory_usage_percent` | Gauge | 80% | 90% | Memory usage |
| `node_disk_usage_percent` | Gauge | 80% | 90% | Disk usage |
| `kube_pod_status_ready` | Gauge | < 2 | 0 | Ready pods |
| `kube_pod_container_status_restarts_total` | Counter | 1 | 5 | Pod restarts |

### Business Metrics

| Metric | Type | Target | Description |
|--------|------|--------|-------------|
| `cross_device_handoffs_total` | Counter | - | Daily handoff count |
| `handoff_latency_seconds` | Histogram | < 100ms | Handoff completion time |
| `user_session_retention_rate` | Gauge | > 95% | Session continuity rate |
| `offline_sync_success_rate` | Gauge | > 98% | Offline sync success |

---

## Alerts

### Critical Alerts (P1)

#### Service Down

```yaml
alert: ServiceDown
expr: up{job="session-state-service"} == 0
for: 1m
labels:
  severity: critical
  team: platform
annotations:
  summary: "Session State Service is down"
  description: "{{ $labels.instance }} has been down for more than 1 minute."
```

#### High Error Rate

```yaml
alert: HighErrorRate
expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
for: 2m
labels:
  severity: critical
  team: platform
annotations:
  summary: "High error rate detected"
  description: "Error rate is {{ $value }} errors/sec for the last 5 minutes."
```

#### Database Connection Failure

```yaml
alert: DatabaseConnectionFailure
expr: postgresql_up == 0
for: 1m
labels:
  severity: critical
  team: platform
annotations:
  summary: "Database connection lost"
  description: "Cannot connect to PostgreSQL for more than 1 minute."
```

### Warning Alerts (P2)

#### High Memory Usage

```yaml
alert: HighMemoryUsage
expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.8
for: 5m
labels:
  severity: warning
  team: platform
annotations:
  summary: "High memory usage"
  description: "{{ $labels.pod }} is using {{ $value | humanizePercentage }} of memory."
```

#### Slow Query Performance

```yaml
alert: SlowQueries
expr: histogram_quantile(0.95, rate(postgresql_query_duration_seconds_bucket[5m])) > 0.5
for: 5m
labels:
  severity: warning
  team: platform
annotations:
  summary: "Slow database queries detected"
  description: "95th percentile query time is {{ $value }}s."
```

#### Redis Memory High

```yaml
alert: RedisMemoryHigh
expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
for: 5m
labels:
  severity: warning
  team: platform
annotations:
  summary: "Redis memory usage high"
  description: "Redis is using {{ $value | humanizePercentage }} of memory."
```

### Info Alerts (P3)

#### Certificate Expiry

```yaml
alert: CertificateExpiringSoon
expr: (cert_not_after - time()) < 7 * 24 * 3600
labels:
  severity: info
  team: platform
annotations:
  summary: "Certificate expiring soon"
  description: "Certificate {{ $labels.subject }} expires in less than 7 days."
```

---

## Dashboards

### Main Dashboard

Access: http://grafana.harmonyflow.io/d/main

**Panels:**
1. Active sessions (current, 24h trend)
2. WebSocket connections
3. HTTP request rate (by status code)
4. Request latency (p50, p95, p99)
5. Error rate
6. System health (services, DB, Redis)
7. Resource usage (CPU, memory, disk)
8. Cross-device handoff metrics

### Session State Service Dashboard

Access: http://grafana.harmonyflow.io/d/session-state

**Panels:**
1. Service uptime
2. Request rate (by endpoint)
3. Response time distribution
4. State sync latency
5. WebSocket message rate
6. Active connections
7. Goroutine count
8. GC statistics

### Database Dashboard

Access: http://grafana.harmonyflow.io/d/database

**Panels:**
1. PostgreSQL connections
2. Query latency
3. Transaction rate
4. Table sizes
5. Index usage
6. Redis memory usage
7. Redis hit ratio
8. Key count

### Infrastructure Dashboard

Access: http://grafana.harmonyflow.io/d/infrastructure

**Panels:**
1. Cluster node health
2. Pod status by namespace
3. Resource allocation
4. Network traffic
5. Disk I/O
6. Linkerd mesh metrics

---

## Troubleshooting

### Issue: High Error Rate

**Symptoms:**
- Alert: HighErrorRate firing
- Increased 5xx responses
- User complaints

**Investigation:**

```bash
# Check error rate
curl 'http://prometheus/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'

# Check recent errors
kubectl logs -f deployment/session-state-service -n harmonyflow | grep error

# Check service health
kubectl get pods -n harmonyflow
kubectl describe pod <pod-name>
```

**Resolution:**
- Check application logs for error patterns
- Verify dependencies (DB, Redis) are healthy
- Check for recent deployments
- Scale up if under load

### Issue: Slow Response Times

**Symptoms:**
- Alert: SlowQueries or SlowAPIResponse firing
- High p95/p99 latency

**Investigation:**

```bash
# Check latency metrics
curl 'http://prometheus/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'

# Check database slow queries
kubectl exec -it postgresql-primary-0 -n postgresql -- psql -U harmonyflow -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check Redis performance
kubectl exec -it redis-cluster-0 -n redis -- redis-cli INFO stats
```

**Resolution:**
- Optimize slow queries
- Add database indexes if needed
- Scale Redis cluster
- Check network latency between services

### Issue: High Memory Usage

**Symptoms:**
- Alert: HighMemoryUsage firing
- Pods being OOM killed

**Investigation:**

```bash
# Check memory usage
kubectl top pods -n harmonyflow

# Check pod memory limits
kubectl describe pod <pod-name> | grep -A 10 "Limits:"

# Check goroutine count (Go)
curl http://localhost:8080/debug/pprof/goroutine?debug=2
```

**Resolution:**
- Increase memory limits
- Check for memory leaks
- Review application code for memory hotspots
- Consider horizontal scaling

### Issue: Database Connection Pool Exhausted

**Symptoms:**
- Alert: DatabaseConnectionPoolExhausted firing
- Connection timeouts

**Investigation:**

```bash
# Check active connections
kubectl exec -it postgresql-primary-0 -n postgresql -- psql -U harmonyflow -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection pool settings
kubectl get configmap session-state-service-config -n harmonyflow -o yaml
```

**Resolution:**
- Increase connection pool size
- Check for connection leaks
- Review connection timeout settings
- Scale database if needed

---

## Log Analysis

### Query Logs with Loki

```bash
# Search for errors
logcli query --addr=http://loki.harmonyflow.io '{app="session-state-service"} |= "error"'

# Search for specific request
logcli query --addr=http://loki.harmonyflow.io '{app="session-state-service"} |~ "session-123"'

# Get logs for specific time range
logcli query --addr=http://loki.harmonyflow.io --from="2026-02-12T00:00:00Z" --to="2026-02-12T01:00:00Z" '{app="session-state-service"}'
```

### Common Log Patterns

**Authentication Failures:**
```bash
grep "Invalid token\|Unauthorized" /var/log/syncbridge/*.log | tail -100
```

**State Sync Issues:**
```bash
grep "state_sync\|VERSION_CONFLICT" /var/log/syncbridge/*.log | tail -100
```

**WebSocket Errors:**
```bash
grep "websocket.*error\|connection.*closed" /var/log/syncbridge/*.log | tail -100
```

---

## Alert Silence

### Temporarily Silence Alert

```bash
# Silence for 1 hour
amtool silence add --alertmanager=http://alertmanager:9093 \
  --duration=1h \
  --comment="Investigating" \
  alertname=HighErrorRate

# List silences
amtool silence query --alertmanager=http://alertmanager:9093

# Expire silence
amtool silence expire <silence-id> --alertmanager=http://alertmanager:9093
```

---

## Reporting

### Daily Report

Generate daily health report:

```bash
#!/bin/bash
# daily_report.sh

echo "=== HarmonyFlow Daily Report ==="
echo "Date: $(date)"
echo ""

# Service uptime
echo "Service Uptime:"
curl -s 'http://prometheus/api/v1/query?query=up{job="session-state-service"}' | jq .
echo ""

# Error rate
echo "Error Rate (24h):"
curl -s 'http://prometheus/api/v1/query?query=rate(http_requests_total{status=~"5.."}[24h])' | jq .
echo ""

# Request latency
echo "Request Latency (p95, 24h):"
curl -s 'http://prometheus/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[24h]))' | jq .
echo ""

# Active sessions
echo "Active Sessions:"
curl -s 'http://prometheus/api/v1/query?query=sessions_active_total' | jq .
```

---

## Maintenance Windows

### Scheduled Maintenance

Before maintenance:

```bash
# Silence alerts
amtool silence add --duration=4h --comment="Scheduled maintenance" .

# Mark maintenance in status page
# Update https://status.harmonyflow.io
```

After maintenance:

```bash
# Verify all services healthy
kubectl get pods -n harmonyflow

# Run health checks
curl https://api.harmonyflow.io/health

# Verify metrics flowing
curl 'http://prometheus/api/v1/query?query=up'

# Expire silences
amtool silence expire $(amtool silence query --alertmanager=http://alertmanager:9093 -q)
```

---

## Contact Information

| Role | Contact | Method |
|------|---------|--------|
| On-Call Engineer | oncall@harmonyflow.io | PagerDuty |
| DevOps Lead | devops@harmonyflow.io | Slack/Email |
| Platform Engineer | platform@harmonyflow.io | Slack/Email |

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-05-12
