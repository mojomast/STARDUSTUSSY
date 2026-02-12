# Deployment Architecture (Kubernetes)

**Description:** Kubernetes deployment architecture showing pod distribution, services, and ingress.

## ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster (EKS)                          │
│                   Cluster: harmonyflow-production                    │
│                   Region: us-west-2                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Namespace: harmonyflow                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Ingress Controller                          │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │  NGINX Ingress Controller (DaemonSet)               │    │  │
│  │  │  • 1 pod per node (3 pods total)                   │    │  │
│  │  │  • Service Type: LoadBalancer                        │    │  │
│  │  │  • External IP: 52.x.x.x                             │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  │                         │                                   │  │
│  │                         │ Routes to                         │  │
│  │                         ▼                                   │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │  Ingress Resources                                  │    │  │
│  │  │  • /api → session-state-service                      │    │  │
│  │  │  • /ws → session-state-service (WebSocket)           │    │  │
│  │  │  • /health → session-state-service                   │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │          Session State Service (Deployment)                   │  │
│  │                                                              │  │
│  │  Replicas: 3 (1 per Availability Zone)                      │  │
│  │  Strategy: RollingUpdate                                     │  │
│  │  MaxUnavailable: 1                                           │  │
│  │  MaxSurge: 1                                                 │  │
│  │                                                              │  │
│  │  Pod Template:                                               │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │  Container: session-state-service                 │    │  │
│  │  │  • Image: ghcr.io/harmonyflow/session-state:1.0.0│    │  │
│  │  │  • Port: 8080 (HTTP)                              │    │  │
│  │  │  • Port: 8443 (WebSocket)                          │    │  │
│  │  │  • Resources:                                      │    │  │
│  │  │    - CPU: 500m (request), 2 (limit)                │    │  │
│  │  │    - Memory: 512Mi (request), 2Gi (limit)           │    │  │
│  │  │  • Probes:                                        │    │  │
│  │  │    - Liveness: /health/live                         │    │  │
│  │  │    - Readiness: /health/ready                       │    │  │
│  │  │    - Startup: /health/ready                         │    │  │
│  │  │  • Env: SECRET_*, DB_URL, REDIS_URL, LOG_LEVEL       │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  │                                                             │  │
│  │  Sidecar: Linkerd Proxy (injected automatically)          │  │
│  │                                                             │  │
│  │  Pod Distribution:                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │ Pod 1        │  │ Pod 2        │  │ Pod 3        │    │  │
│  │  │ AZ: us-west-2a│  │ AZ: us-west-2b│  │ AZ: us-west-2c│    │  │
│  │  │ IP: 10.0.2.10 │  │ IP: 10.0.2.11 │  │ IP: 10.0.2.12 │    │  │
│  │  │ Status: Ready │  │ Status: Ready │  │ Status: Ready │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Services:                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Service: session-state-service (ClusterIP)                 │  │
│  │  • Selector: app=session-state-service                      │  │
│  │  • Ports: 8080 → 8080, 8443 → 8443                       │  │
│  │  • Session Affinity: None                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Service: session-state-service-headless (ClusterIP)        │  │
│  │  • Type: ClusterIP (headless)                               │  │
│  │  • Used for direct pod communication                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              │ DNS Resolution
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External Services (AWS)                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL (RDS)                                           │  │
│  │  Endpoint: harmonyflow-db.xxxx.us-west-2.rds.amazonaws.com  │  │
│  │  Port: 5432                                                  │  │
│  │  Mode: Multi-AZ                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Redis (ElastiCache)                                        │  │
│  │  Endpoint: harmonyflow-redis.xxxx.use1.cache.amazonaws.com  │  │
│  │  Port: 6379                                                  │  │
│  │  Mode: Cluster Mode (6 nodes)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  RabbitMQ (self-managed EC2)                                │  │
│  │  Endpoints:                                                 │  │
│  │    - rabbitmq-1.internal (10.0.3.30)                       │  │
│  │    - rabbitmq-2.internal (10.0.3.31)                       │  │
│  │    - rabbitmq-3.internal (10.0.3.32)                       │  │
│  │  Port: 5672 (AMQP), 15672 (Management)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              │ Service Discovery
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Monitoring Namespace                           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Prometheus (StatefulSet)                                    │  │
│  │  Replicas: 2                                                 │  │
│  │  Storage: 100Gi PVC (EBS GP3)                                │  │
│  │  Retention: 30 days                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Grafana (Deployment)                                        │  │
│  │  Replicas: 2                                                 │  │
│  │  Storage: 5Gi PVC (EBS GP3)                                 │  │
│  │  Databases: Prometheus datasource                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AlertManager (Deployment)                                    │  │
│  │  Replicas: 3                                                 │  │
│  │  Storage: 2Gi PVC (EBS GP3)                                  │  │
│  │  Routes: Slack, PagerDuty, Email                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Namespaces                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Namespace: linkerd                                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Linkerd Control Plane                                       │  │
│  │  Components:                                                 │  │
│  │  • linkerd-controller                                        │  │
│  │  • linkerd-sp-validator                                       │  │
│  │  • linkerd-identity                                         │  │
│  │  • linkerd-proxy-injector                                    │  │
│  │  • linkerd-web                                               │  │
│  │  • tap                                                      │  │
│  │  • viz                                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Namespace: postgresql                                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Operator (managed via AWS RDS, not K8s)         │  │
│  │  External service referenced from harmonyflow namespace      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Namespace: redis                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Redis Operator (managed via AWS ElastiCache, not K8s)     │  │
│  │  External service referenced from harmonyflow namespace      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Namespace: rabbitmq                                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  RabbitMQ StatefulSet (self-managed)                       │  │
│  │  Replicas: 3                                                 │  │
│  │  Storage: 20Gi PVC per replica (EBS GP3)                     │  │
│  │  Service: rabbitmq (ClusterIP)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Namespace: vault                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  HashiCorp Vault StatefulSet                                │  │
│  │  Replicas: 3 (1 per AZ)                                     │  │
│  │  Storage: 10Gi PVC per replica (EBS GP3)                     │  │
│  │  Service: vault (ClusterIP)                                  │  │
│  │  External Secrets Operator                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

## Resource Allocation

### Node Requirements

| Instance Type | vCPU | Memory | Pods per Node | Total Nodes |
|--------------|------|---------|---------------|-------------|
| m5.xlarge | 4 | 16 GiB | 30 | 6 (3 AZs × 2) |
| **Total** | **24** | **96 GiB** | **180** | **6** |

### Storage Classes

| Name | Provisioner | Type | Parameters |
|------|-------------|------|------------|
| gp3 | kubernetes.io/aws-ebs | gp3 | IOPS: 3000, Throughput: 125 |

### PVCs

| PVC | Size | Purpose | Reclaim Policy |
|-----|------|---------|----------------|
| prometheus-data | 100Gi | Metrics storage | Retain |
| grafana-data | 5Gi | Dashboard storage | Retain |
| alertmanager-data | 2Gi | Alert storage | Retain |
| vault-data | 10Gi | Secrets storage | Retain |
| rabbitmq-data | 20Gi × 3 | Queue storage | Retain |

## Network Policies

### Namespace Isolation

```yaml
# Default deny all traffic between namespaces
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Allow Linkerd Mesh

```yaml
# Allow Linkerd proxy communication
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-linkerd
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: linkerd
    ports:
    - protocol: TCP
      port: 4143
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: linkerd
    ports:
    - protocol: TCP
      port: 4140
```

## Service Discovery

### Internal DNS

```
session-state-service.harmonyflow.svc.cluster.local
session-state-service-headless.harmonyflow.svc.cluster.local
```

### External DNS

```
api.harmonyflow.io → Ingress Controller → Session State Service
ws.api.harmonyflow.io → Ingress Controller → Session State Service (WebSocket)
```

## Autoscaling

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: session-state-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: session-state-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Cluster Autoscaler

- Min nodes: 3 (1 per AZ)
- Max nodes: 20 (7 per AZ)
- Scale up: Unschedulable pods detected
- Scale down: Node utilization < 40% for 10 minutes

---

**File:** k8s-deployment.diagram  
**Format:** ASCII  
**Last Updated:** 2026-02-12
