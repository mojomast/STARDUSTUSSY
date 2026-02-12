# HarmonyFlow SyncBridge - Production Infrastructure
# Week 4 Deliverables

## Overview
Minimal viable production setup for HarmonyFlow SyncBridge platform.

## Directory Structure

```
infrastructure/production/
├── terraform/
│   ├── eks-cluster.tf      # EKS production cluster (6+ nodes, multi-AZ)
│   └── variables.tf        # Terraform variables
├── kubernetes/
│   ├── apps/
│   │   ├── session-state-service-production.yaml  # Core service deployment
│   │   └── autoscaling-policies.yaml              # (Week 5)
│   ├── redis/
│   │   └── redis-cluster-production.yaml          # 6-node Redis cluster
│   ├── postgresql/
│   │   └── postgresql-cluster-production.yaml     # Primary + replicas
│   ├── monitoring/
│   │   ├── prometheus-production.yaml             # Alert rules & config
│   │   ├── prometheus-deployment.yaml             # Prometheus deployment
│   │   ├── alertmanager-production.yaml           # Alertmanager setup
│   │   └── grafana-production.yaml                # Grafana dashboards
│   ├── security/
│   │   └── security-hardening.yaml                # (Week 5)
│   ├── rabbitmq/
│   │   └── rabbitmq-cluster-production.yaml       # Message queue
│   └── backup/
│       └── backup-automation.yaml                 # (Week 5)
├── grafana-dashboards/
│   ├── infrastructure-dashboard.json
│   └── slo-dashboard.json
├── cicd/
│   └── production-deployment.yml
└── runbooks/
    ├── deployment-runbook.md
    └── disaster-recovery-runbook.md
```

## Quick Start - Deploy Production Cluster

### Prerequisites
- kubectl configured for production cluster
- Terraform >= 1.5.0
- AWS CLI configured

### Deployment Steps

#### 1. Deploy EKS Cluster (Terraform)
```bash
cd infrastructure/production/terraform
terraform init
terraform plan
terraform apply
```

#### 2. Deploy Core Services
```bash
# Create namespaces and deploy all services
kubectl apply -f infrastructure/production/kubernetes/
```

Or deploy individually:

```bash
# Deploy Redis cluster
kubectl apply -f infrastructure/production/kubernetes/redis/redis-cluster-production.yaml

# Deploy PostgreSQL cluster
kubectl apply -f infrastructure/production/kubernetes/postgresql/postgresql-cluster-production.yaml

# Deploy Session State Service
kubectl apply -f infrastructure/production/kubernetes/apps/session-state-service-production.yaml

# Deploy monitoring stack
kubectl apply -f infrastructure/production/kubernetes/monitoring/prometheus-production.yaml
kubectl apply -f infrastructure/production/kubernetes/monitoring/prometheus-deployment.yaml
kubectl apply -f infrastructure/production/kubernetes/monitoring/alertmanager-production.yaml
kubectl apply -f infrastructure/production/kubernetes/monitoring/grafana-production.yaml
```

### Verify Deployment

```bash
# Check all pods
kubectl get pods --all-namespaces

# Check services
kubectl get svc --all-namespaces

# Check nodes
kubectl get nodes

# Check Redis cluster
kubectl exec -it redis-production-cluster-0 -n redis-production -- redis-cli -a $(kubectl get secret redis-production-secret -n redis-production -o jsonpath='{.data.password}' | base64 -d) cluster info

# Check PostgreSQL
kubectl exec -it postgresql-production-0 -n postgresql-production -- pg_isready -U harmonyflow

# Check Session State Service
kubectl get pods -n harmonyflow-production
kubectl logs -n harmonyflow-production -l app=session-state-service --tail=50
```

## Production Configuration Summary

### EKS Cluster
- **Instance Types**: m6i.xlarge/m6i.2xlarge (general), r6i.xlarge/r6i.2xlarge (database)
- **Node Groups**: 
  - General: 6-20 nodes (ON_DEMAND)
  - Memory Optimized: 3-10 nodes (database workloads)
  - Spot: 0-10 nodes (non-critical)
- **Multi-AZ**: 3 availability zones (us-west-2a, us-west-2b, us-west-2c)
- **Storage**: gp3/io2 with encryption

### Redis Cluster
- **Nodes**: 9 (3 masters + 6 replicas)
- **Memory**: 8GB per node
- **Storage**: 100GB gp3 per node
- **Persistence**: AOF + RDB
- **High Availability**: PodAntiAffinity across AZs

### PostgreSQL Cluster
- **Nodes**: 3 (1 primary + 2 replicas)
- **Resources**: 1-2 CPU, 4-8GB RAM per node
- **Storage**: 500GB gp3 per node
- **Replication**: Synchronous replication with repmgr

### Session State Service
- **Replicas**: 5-20 (HPA)
- **Resources**: 1-2 CPU, 2-4GB RAM per pod
- **WebSocket**: 50,000 concurrent connections
- **Rate Limiting**: 1000 req/s

### Monitoring
- **Prometheus**: 2 replicas, 30d retention
- **Grafana**: 2 replicas with dashboards
- **Alertmanager**: 2 replicas with PagerDuty integration
- **Alerts**: Service down, high latency, SLO violations

## Security Notes

⚠️ **CRITICAL**: Update all secrets before production deployment:
- `redis-production-secret`
- `postgresql-production-secret`
- `session-state-service-secrets`
- `grafana-credentials`
- `alertmanager-production-secret`

Use External Secrets Operator or Vault integration.

## Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Grafana | https://grafana.harmonyflow.io | Admin auth required |
| Prometheus | https://prometheus.harmonyflow.io | Basic auth required |
| API | https://api.harmonyflow.io | Via ingress |

## Week 5 Follow-up Items

- [ ] Complex autoscaling policies
- [ ] Full disaster recovery automation
- [ ] Advanced security hardening (OPA, Pod Security Standards)
- [ ] Cost optimization analysis
- [ ] Performance benchmarking
- [ ] Chaos engineering tests

## Support

For issues, refer to:
- Deployment Runbook: `infrastructure/production/runbooks/deployment-runbook.md`
- Disaster Recovery: `infrastructure/production/runbooks/disaster-recovery-runbook.md`
