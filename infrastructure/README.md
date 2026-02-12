# HarmonyFlow Infrastructure

Cloud-native Kubernetes infrastructure for the HarmonyFlow SyncBridge wellness platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                       │
│  (Web PWA / iOS App / Android App / Desktop Electron)       │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS/WebSocket/WebRTC
┌───────────────────────────▼─────────────────────────────────┐
│               Edge Layer (Cloudflare Workers)               │
│  • Request Routing                                         │
│  • Bot Detection / DDoS Mitigation                         │
│  • Geo-based A/B Test Assignment                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Application Layer (Kubernetes)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Session   │ │Content   │ │Collabora-│ │Personal- │      │
│  │State Svc │ │Delivery  │ │tion Svc  │ │ization  │      │
│  │(Go)      │ │Svc (Rust)│ │(Node.js) │ │Svc(Python)     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │ gRPC / Service Mesh (Linkerd)
┌───────────────────────────▼─────────────────────────────────┐
│                Data & Coordination Layer                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │Redis     │ │PostgreSQL│ │RabbitMQ  │                   │
│  │(Session  │ │(Metadata)│ │(Job Queues)                  │
│  │Cache)    │ │          │ │          │                   │
│  └──────────┘ └──────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
infrastructure/
├── terraform/              # Infrastructure as Code
│   ├── eks-cluster.tf     # EKS cluster configuration
│   ├── variables.tf       # Terraform variables
│   └── workspaces         # Terraform workspace definitions
│
├── kubernetes/            # Kubernetes manifests
│   ├── linkerd/          # Service mesh configuration
│   ├── redis/            # Redis cluster (6 nodes: 3 masters + 3 replicas)
│   ├── postgresql/       # PostgreSQL primary-replica setup
│   ├── rabbitmq/         # RabbitMQ cluster (3 nodes)
│   ├── monitoring/       # Prometheus, Grafana, Loki
│   └── vault/            # Secrets management
│
└── cicd/                 # CI/CD pipeline templates
    ├── github-actions-pipeline.yml      # Main CI/CD pipeline
    └── infrastructure-deployment.yml    # Infrastructure deployment
```

## Components

### 1. Kubernetes Cluster (EKS)
- **Version**: 1.28
- **Nodes**: Minimum 3 (mix of on-demand and spot instances)
- **Autoscaling**: HPA for pods, Cluster Autoscaler for nodes
- **Add-ons**: CoreDNS, kube-proxy, VPC CNI, EBS CSI Driver

### 2. Service Mesh (Linkerd)
- **Version**: 2.14.x
- **Features**:
  - mTLS for all service-to-service communication
  - Traffic splitting for canary deployments
  - Automatic retries and timeouts
  - Distributed tracing (Jaeger)
  - Real-time metrics

### 3. Redis Cluster
- **Version**: 7.0+
- **Topology**: 6 nodes (3 masters, 3 replicas)
- **Use Cases**:
  - Session state storage (7-day TTL)
  - Distributed caching
- **Features**:
  - Automated backups to S3 every 6 hours
  - Prometheus metrics
  - Horizontal Pod Autoscaling

### 4. PostgreSQL
- **Version**: 15+
- **Topology**: 1 primary + 2 replicas
- **Replication**: Streaming replication with hot standby
- **Features**:
  - Daily backups at 2 AM
  - WAL archiving
  - Connection pooling (PgBouncer ready)

### 5. RabbitMQ
- **Version**: 3.12+
- **Topology**: 3-node cluster
- **Queues**:
  - `session-events`: Priority queue for session state events
  - `content-processing`: Background content processing
  - `collaboration-sync`: Real-time collaboration sync
- **Features**:
  - Management UI
  - Prometheus metrics
  - Message TTL and dead letter queues

### 6. Monitoring Stack
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **AlertManager**: Alert routing (Slack, PagerDuty)

### 7. Secrets Management (Vault)
- **Version**: 1.15+
- **Topology**: 3-node HA cluster with Raft backend
- **Features**:
  - Kubernetes auth method
  - Dynamic database credentials
  - Transit encryption
  - External Secrets Operator integration

## Quick Start

### Prerequisites
- AWS CLI configured
- kubectl installed
- Helm 3.x installed
- Terraform 1.5+ installed

### 1. Deploy Infrastructure

```bash
# Initialize Terraform
cd infrastructure/terraform
terraform init

# Select workspace
terraform workspace select dev

# Plan and apply
terraform plan -var="environment=dev"
terraform apply -var="environment=dev"
```

### 2. Configure kubectl

```bash
aws eks update-kubeconfig --region us-west-2 --name harmonyflow-dev
```

### 3. Deploy Kubernetes Resources

```bash
# Deploy in order
cd infrastructure/kubernetes

# Service Mesh
kubectl apply -f linkerd/

# Data Layer
kubectl apply -f redis/
kubectl apply -f postgresql/
kubectl apply -f rabbitmq/

# Monitoring
kubectl apply -f monitoring/

# Secrets Management
kubectl apply -f vault/
```

### 4. Verify Deployment

```bash
# Check all pods
kubectl get pods --all-namespaces

# Check services
kubectl get svc --all-namespaces

# Check ingress
kubectl get ingress --all-namespaces
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# AWS
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Database
REDIS_PASSWORD=your_redis_password
POSTGRES_PASSWORD=your_postgres_password
RABBITMQ_PASSWORD=your_rabbitmq_password

# Vault
VAULT_ADDR=https://vault.harmonyflow.io
VAULT_TOKEN=your_vault_token
```

### Secrets Management

All secrets are managed by HashiCorp Vault. The External Secrets Operator automatically syncs secrets from Vault to Kubernetes Secrets.

To add a new secret:

```bash
# Access Vault
kubectl exec -it vault-0 -n vault -- vault login

# Write secret
vault kv put secret/redis password=your_secure_password

# Verify
kubectl get secret redis-secret -n redis -o yaml
```

## Monitoring

### Access Dashboards

- **Grafana**: http://grafana.harmonyflow.io (admin/CHANGE_ME)
- **Prometheus**: http://prometheus.harmonyflow.io
- **AlertManager**: http://alertmanager.harmonyflow.io
- **RabbitMQ Management**: http://rabbitmq.harmonyflow.io:15672

### Key Metrics

- Session State Service: API latency, error rate, concurrent connections
- Redis: Memory usage, hit rate, evicted keys
- PostgreSQL: Connection count, replication lag, slow queries
- RabbitMQ: Queue depth, consumer utilization, message rates

## Backup and Recovery

### Automated Backups

| Service | Schedule | Retention | Location |
|---------|----------|-----------|----------|
| Redis | Every 6 hours | 7 days | S3 (Standard-IA) |
| PostgreSQL | Daily at 2 AM | 30 days | S3 (Standard-IA) |
| Vault | Continuous | - | Raft snapshots |

### Manual Backup

```bash
# Redis
kubectl exec -it redis-cluster-0 -n redis -- redis-cli BGSAVE

# PostgreSQL
kubectl exec -it postgresql-primary-0 -n postgresql -- pg_dumpall -U harmonyflow > backup.sql

# Vault
kubectl exec -it vault-0 -n vault -- vault operator raft snapshot save /tmp/backup.snap
kubectl cp vault/vault-0:/tmp/backup.snap ./vault-backup.snap
```

## Security

### Network Policies

All namespaces have network policies restricting ingress/egress:

- **Redis**: Only accepts connections from harmonyflow and monitoring namespaces
- **PostgreSQL**: Database port only accessible from application pods
- **RabbitMQ**: AMQP and management ports restricted

### TLS

- All inter-service communication encrypted via Linkerd mTLS
- Ingress endpoints use Let's Encrypt certificates (cert-manager)
- Vault uses auto-generated TLS certificates

### Secrets Rotation

```bash
# Rotate database credentials
vault write -force database/rotate-role/postgresql

# Rotate Redis password (requires pod restart)
vault kv put secret/redis password=new_password
kubectl rollout restart statefulset/redis-cluster -n redis
```

## Troubleshooting

### Common Issues

**Pod stuck in Pending:**
```bash
# Check events
kubectl describe pod <pod-name> -n <namespace>

# Check node resources
kubectl top nodes
```

**Redis cluster not forming:**
```bash
# Check cluster status
kubectl exec -it redis-cluster-0 -n redis -- redis-cli cluster nodes

# Reinitialize if needed
kubectl delete job redis-cluster-init -n redis
kubectl apply -f kubernetes/redis/redis-cluster.yaml
```

**PostgreSQL replication lag:**
```bash
# Check replication status
kubectl exec -it postgresql-replica-0 -n postgresql -- psql -U harmonyflow -c "SELECT * FROM pg_stat_wal_receiver;"
```

## Maintenance

### Scaling

```bash
# Scale Redis
kubectl scale statefulset redis-cluster --replicas=9 -n redis

# Scale PostgreSQL replicas
kubectl scale statefulset postgresql-replica --replicas=3 -n postgresql

# Scale RabbitMQ
kubectl scale statefulset rabbitmq --replicas=5 -n rabbitmq
```

### Upgrades

**Kubernetes Version:**
```bash
# Update Terraform
terraform apply -var="cluster_version=1.29"
```

**Helm Charts:**
```bash
# Update all releases
helm repo update
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack -n monitoring
```

## Support

For issues and questions:
- Create an issue in GitHub
- Contact: devops@harmonyflow.io
- Slack: #infrastructure

## License

Internal Use Only - HarmonyFlow Platform
