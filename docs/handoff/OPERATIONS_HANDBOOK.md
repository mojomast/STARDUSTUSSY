# HarmonyFlow SyncBridge - Operations Handbook

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Owner:** Operations Team  
**Classification:** INTERNAL USE ONLY

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Component Dependencies](#component-dependencies)
4. [Service Endpoints](#service-endpoints)
5. [Secrets Management](#secrets-management)
6. [Troubleshooting](#troubleshooting)
7. [Escalation Contacts](#escalation-contacts)
8. [Onboarding Guide](#onboarding-guide)

---

## Overview

This handbook provides operations teams with comprehensive knowledge for managing the HarmonyFlow SyncBridge platform.

### Platform Purpose

HarmonyFlow SyncBridge provides real-time state synchronization and cross-device continuity for wellness sessions. Users can start a session on one device and seamlessly continue on another without losing progress.

### Key Capabilities

- Real-time WebSocket state synchronization
- Multi-device handoff (up to 5 devices)
- Session snapshot storage (7-day TTL)
- Offline state caching
- Optimistic conflict resolution

### Target Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Handoff latency | < 100ms | 45ms |
| Session continuity rate | > 95% | 98% |
| API uptime | > 99.9% | 99.95% |
| WebSocket uptime | > 99.9% | 99.97% |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Web PWA   │  │iOS App   │  │Android  │  │Desktop  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS/WSS
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    Edge Layer (CDN)                         │
│             Cloudflare Workers / Load Balancer              │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Application Layer (K8s)                     │
│  ┌────────────────────────────────────────────────────┐   │
│  │           Session State Service (Go)                  │   │
│  │  • REST API • WebSocket • State Management          │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ PostgreSQL   │  │ Redis Cluster │  │  RabbitMQ    │    │
│  │ (Metadata)   │  │ (Sessions)   │  │ (Events)     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Service Mesh (Linkerd)                      │
│           • mTLS • Observability • Traffic Management       │
└─────────────────────────────────────────────────────────────┘
```

### Service Mesh Architecture

All inter-service communication goes through Linkerd service mesh:

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│    Client    │         │   Service    │         │  Database    │
│              │────────>│              │────────>│              │
│  (w/ Proxy)  │  mTLS   │ (w/ Proxy)   │  mTLS   │ (w/ Proxy)  │
└──────────────┘         └──────────────┘         └──────────────┘
```

---

## Component Dependencies

### Dependency Graph

```
Session State Service
├── PostgreSQL (metadata, user accounts)
├── Redis (session state, caching)
├── RabbitMQ (event queue)
├── HashiCorp Vault (secrets)
└── Linkerd (service mesh)

Client Applications
├── Session State Service API
├── Session State Service WebSocket
└── CDN (assets)
```

### Critical Path Analysis

| Service | Depends On | Critical? | Failure Impact |
|---------|------------|-----------|----------------|
| Session State Service | PostgreSQL, Redis | Yes | Session sync unavailable |
| PostgreSQL | - | Yes | Metadata unavailable |
| Redis | - | Yes | State sync unavailable |
| RabbitMQ | - | No | Events delayed |
| Linkerd | - | No | Reduced observability |

### Version Compatibility

| Component | Version | Compatible With |
|-----------|---------|-----------------|
| Go | 1.21+ | Session State Service |
| PostgreSQL | 15.x | All services |
| Redis | 7.x | Session State Service |
| RabbitMQ | 3.12.x | All services |
| Linkerd | 2.14.x | All services |

---

## Service Endpoints

### Production Endpoints

| Service | Endpoint | Purpose | Health Check |
|---------|----------|---------|--------------|
| Session State Service API | https://api.harmonyflow.io/v1 | REST API | `/health` |
| Session State Service WS | wss://api.harmonyflow.io/v1/ws | WebSocket | - |
| Grafana | https://grafana.harmonyflow.io | Monitoring | - |
| Status Page | https://status.harmonyflow.io | Public status | - |

### Staging Endpoints

| Service | Endpoint | Purpose | Health Check |
|---------|----------|---------|--------------|
| Session State Service API | https://api.staging.harmonyflow.io/v1 | REST API | `/health` |
| Session State Service WS | wss://api.staging.harmonyflow.io/v1/ws | WebSocket | - |
| Grafana | https://grafana.staging.harmonyflow.io | Monitoring | - |

### Internal Endpoints

| Service | Endpoint | Purpose | Access |
|---------|----------|---------|--------|
| Prometheus | http://prometheus.internal:9090 | Metrics | Internal |
| AlertManager | http://alertmanager.internal:9093 | Alert routing | Internal |
| Vault | https://vault.internal:8200 | Secrets | Internal |

---

## Secrets Management

### Vault Integration

HarmonyFlow uses HashiCorp Vault for secrets management.

#### Vault Architecture

```
┌──────────────┐
│   Vault UI   │
│   :8200      │
└──────┬───────┘
       │
┌──────▼─────────────────────────────────┐
│         Vault Server                     │
│  ┌──────────────────────────────────┐  │
│  │  Secret Engines                  │  │
│  │  • kv-v2 (general secrets)       │  │
│  │  • database (DB credentials)     │  │
│  │  • pki (certificates)           │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
       │
       │ External Secrets Operator
       ▼
┌─────────────────────────────────┐
│  Kubernetes Secrets              │
│  • session-state-service-secrets │
│  • postgresql-secrets            │
│  • redis-secrets                 │
└─────────────────────────────────┘
```

#### Accessing Secrets

**Via CLI:**
```bash
# Login to Vault
vault login -method=aws

# Read secret
vault kv get -mount=secret harmonyflow/jwt

# Write secret
vault kv put -mount=secret harmonyflow/jwt signing_key=$(openssl rand -base64 32)
```

**Via Kubernetes:**
```bash
# ExternalSecret is synced to K8s Secret
kubectl get secret session-state-service-secrets -n harmonyflow -o yaml
```

### Secret Rotation

#### Automated Rotation

- JWT signing keys: Every 90 days
- Database passwords: Every 180 days
- Redis passwords: Every 180 days
- TLS certificates: Every 90 days

#### Manual Rotation Procedure

1. **Generate new secret**
   ```bash
   vault kv put -mount=secret harmonyflow/jwt signing_key=$(openssl rand -base64 32)
   ```

2. **Trigger secret sync**
   ```bash
   kubectl rollout restart deployment session-state-service -n harmonyflow
   ```

3. **Verify new secret in use**
   ```bash
   kubectl exec -it <pod-name> -n harmonyflow -- env | grep JWT_SECRET
   ```

4. **Monitor for errors**
   ```bash
   kubectl logs -f deployment/session-state-service -n harmonyflow
   ```

### Emergency Secret Access

**In case of emergency, operations team can:**

1. Access Vault via admin console
2. Use emergency shaman keys (stored securely offsite)
3. Contact DevOps Lead for manual intervention

---

## Troubleshooting

### Common Issues

#### Issue: High WebSocket Connection Failures

**Symptoms:**
- Increased connection errors
- Users unable to connect
- High error rate in logs

**Investigation:**
```bash
# Check connection errors
kubectl logs deployment/session-state-service -n harmonyflow | grep "websocket.*error"

# Check Redis connectivity
kubectl exec -it redis-cluster-0 -n redis -- redis-cli ping

# Check rate limiting
curl 'http://prometheus/api/v1/query?query=rate(websocket_connection_errors_total[5m])'
```

**Resolution:**
- Verify Redis is healthy
- Check JWT token validity
- Review rate limiting configuration
- Scale service if under load

#### Issue: State Synchronization Delays

**Symptoms:**
- Users see stale state
- High state sync latency
- Version conflicts

**Investigation:**
```bash
# Check state sync latency
curl 'http://prometheus/api/v1/query?query=histogram_quantile(0.95, rate(state_sync_duration_seconds_bucket[5m]))'

# Check Redis performance
kubectl exec -it redis-cluster-0 -n redis -- redis-cli INFO stats

# Check network latency between services
linkerd viz edges deployment/session-state-service -n harmonyflow
```

**Resolution:**
- Check Redis CPU/memory usage
- Scale Redis cluster if needed
- Optimize state size
- Review network configuration

#### Issue: Database Connection Pool Exhausted

**Symptoms:**
- Connection timeouts
- High connection count
- Database errors in logs

**Investigation:**
```bash
# Check active connections
kubectl exec -it postgresql-primary-0 -n postgresql -- \
  psql -U harmonyflow -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection pool settings
kubectl get configmap session-state-service-config -n harmonyflow -o yaml
```

**Resolution:**
- Increase connection pool size
- Check for connection leaks
- Scale database if needed
- Review application connection handling

#### Issue: Certificate Expiry

**Symptoms:**
- TLS handshake failures
- Certificate warnings
- Service unavailable

**Investigation:**
```bash
# Check certificate expiry
kubectl exec -it <pod-name> -n harmonyflow -- \
  openssl s_client -connect localhost:8443 -showcerts | openssl x509 -noout -dates
```

**Resolution:**
- Renew certificate via Vault PKI
- Restart affected services
- Verify certificate is valid
- Update monitoring alerts

### Escalation Procedures

#### Level 1: Standard Issues

1. Attempt resolution using this handbook
2. Document steps taken
3. Monitor for recurrence

#### Level 2: Escalate to DevOps

- Unable to resolve with standard procedures
- Service impact > 10 minutes
- Critical metrics degraded

**Contact:** devops@harmonyflow.io, Slack #devops-alerts

#### Level 3: Critical Incident

- Complete service outage
- Data loss or corruption
- Security breach

**Contact:** On-call via PagerDuty, escalate to CTO

---

## Escalation Contacts

### Primary Contacts

| Role | Name | Contact | Hours |
|------|------|---------|-------|
| On-Call Engineer | - | +1-XXX-XXX-XXXX (PagerDuty) | 24/7 |
| DevOps Lead | - | devops@harmonyflow.io | 24/7 |
| Platform Lead | - | platform@harmonyflow.io | Business Hours |
| DBA | - | dba@harmonyflow.io | Business Hours |

### Emergency Contacts

| Situation | Contact | Method |
|-----------|---------|--------|
| Security Incident | security@harmonyflow.io | Email + PagerDuty |
| Data Breach | legal@harmonyflow.io | Email + Phone |
| Production Outage | oncall@harmonyflow.io | PagerDuty |
| CEO Emergency | CEO Direct | Phone |

### Vendor Contacts

| Vendor | Support Contact | Contract ID |
|--------|----------------|-------------|
| AWS | AWS Support | CON-XXXX |
| HashiCorp | Vault Support | LIC-XXXX |
| Datadog/Prometheus | Monitoring Support | LIC-XXXX |

---

## Onboarding Guide

### Day 1: Environment Setup

#### Access Setup

1. **AWS Console Access**
   - Request AWS account via IT
   - Configure MFA
   - Review AWS IAM policies

2. **Kubernetes Access**
   - Install kubectl
   - Configure kubeconfig
   - Test cluster access:
     ```bash
     kubectl get nodes
     kubectl get pods -n harmonyflow
     ```

3. **Vault Access**
   - Install Vault CLI
   - Configure authentication
   - Test access:
     ```bash
     vault login
     vault kv list -mount=secret harmonyflow
     ```

4. **Monitoring Access**
   - Grafana account setup
   - Review dashboards
   - Configure alert preferences

### Day 2: System Familiarization

#### Review Key Documentation

- [API Reference](../api/API_REFERENCE.md)
- [Deployment Runbook](./deployment-runbook.md)
- [Security Runbook](../../security/SECURITY_RUNBOOK.md)
- [Incident Response](../../security/INCIDENT_RESPONSE_PROCEDURES.md)

#### System Walkthrough

1. **Production Environment**
   ```bash
   # Check cluster health
   kubectl get nodes
   
   # Review services
   kubectl get all -n harmonyflow
   
   # Check metrics
   open https://grafana.harmonyflow.io
   ```

2. **Staging Environment**
   ```bash
   # Switch context
   kubectl config use-context staging
   
   # Review staging resources
   kubectl get all -n harmonyflow-staging
   ```

### Day 3: Hands-On Practice

#### Practice Tasks

1. **Deploy a test change to staging**
2. **Review logs for errors**
3. **Scale a service up/down**
4. **Trigger and monitor an alert**
5. **Practice rollback procedure**

### Week 1: Shadow On-Call

- Shadow on-call engineer
- Participate in incident response (if any)
- Review past incident reports
- Practice troubleshooting scenarios

### Week 2: Independent On-Call

- Take on-call rotation
- Handle routine issues independently
- Document all actions
- Participate in post-mortems

### Training Resources

| Resource | Link |
|----------|------|
| Kubernetes Basics | https://kubernetes.io/docs/tutorials/ |
| Go Fundamentals | https://go.dev/tour/ |
| Linkerd Docs | https://linkerd.io/getting-started/ |
| Vault Docs | https://developer.hashicorp.com/vault |
| AWS EKS Docs | https://docs.aws.amazon.com/eks/ |

### Knowledge Base

Internal wiki: https://wiki.harmonyflow.io/operations

Key pages:
- Architecture Deep Dive
- Run Playbook
- Incident History
- Known Issues

---

## Change Management

### Change Approval Process

1. **Standard Changes** (Pre-approved)
   - Routine patches
   - Configuration updates
   - Scaling operations

2. **Normal Changes** (Require approval)
   - Feature deployments
   - Infrastructure changes
   - Security updates

3. **Emergency Changes** (Post-approval)
   - Critical fixes
   - Security incidents
   - Service restoration

### Change Request Template

```markdown
## Change Request

**Requestor:** [Name]
**Date:** [Date]
**Environment:** [Production/Staging]
**Change Type:** [Standard/Normal/Emergency]

### Description
[Brief description of change]

### Rationale
[Why this change is needed]

### Impact Analysis
- Affected Services: [List]
- Risk Level: [Low/Medium/High]
- Rollback Plan: [Describe]

### Testing
- [ ] Tested in staging
- [ ] Reviewers approved
- [ ] Dependencies confirmed

### Timeline
- Scheduled Start: [Date/Time]
- Estimated Duration: [Minutes/Hours]
- Maintenance Window: [Yes/No]

### Approval
- DevOps Lead: [ ] Approved
- Engineering Lead: [ ] Approved
- Security Lead: [ ] Approved (if security-related)
```

---

## Runbooks Index

| Runbook | Purpose | Location |
|---------|---------|----------|
| Deployment Runbook | Service deployment | ./deployment-runbook.md |
| Rollback Runbook | Emergency rollback | ./rollback-runbook.md |
| Monitoring Runbook | Monitoring and alerting | ./monitoring-runbook.md |
| Backup & Recovery | Backup and disaster recovery | ./backup-recovery-runbook.md |
| Security Runbook | Security operations | ../../security/SECURITY_RUNBOOK.md |
| Incident Response | Incident procedures | ../../security/INCIDENT_RESPONSE_PROCEDURES.md |
| Troubleshooting Guide | Common issues | ./troubleshooting-guide.md |

---

## Appendix

### Quick Reference Commands

```bash
# Service Status
kubectl get pods -n harmonyflow
kubectl get services -n harmonyflow

# Logs
kubectl logs -f deployment/session-state-service -n harmonyflow

# Scaling
kubectl scale deployment session-state-service -n harmonyflow --replicas=5

# Restart
kubectl rollout restart deployment/session-state-service -n harmonyflow

# Port Forward
kubectl port-forward service/session-state-service 8080:8080 -n harmonyflow

# Exec into pod
kubectl exec -it <pod-name> -n harmonyflow -- /bin/bash

# Describe resource
kubectl describe pod <pod-name> -n harmonyflow

# Metrics
curl https://api.harmonyflow.io/health
curl 'http://prometheus/api/v1/query?query=up'

# Vault
vault kv get -mount=secret harmonyflow/jwt
vault status
```

### Glossary

| Term | Definition |
|------|------------|
| RPO | Recovery Point Objective - Max acceptable data loss |
| RTO | Recovery Time Objective - Max acceptable downtime |
| mTLS | Mutual TLS - Two-way TLS authentication |
| PITR | Point-In-Time Recovery - Restore to specific time |
| SLA | Service Level Agreement - Guaranteed performance |
| SLO | Service Level Objective - Target performance |
| SLI | Service Level Indicator - Metric for SLO |

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12  
**Next Review:** 2026-05-12
