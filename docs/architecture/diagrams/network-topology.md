# Network Topology Diagram

**Description:** Network architecture showing connectivity, security zones, and traffic flow.

## ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Public Internet                             │
│                      (Users, Attackers)                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (443) / WSS (443)
                              │ DDoS Protection
┌─────────────────────────────▼──────────────────────────────────────┐
│                        DMZ / Edge Layer                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Cloudflare WAF + CDN                        │  │
│  │                                                              │  │
│  │  Functions:                                                 │  │
│  │  • DDoS Mitigation                                          │  │
│  │  • Web Application Firewall                                 │  │
│  │  • Bot Detection                                            │  │
│  │  • Geo-IP Filtering                                         │  │
│  │  • Rate Limiting                                            │  │
│  │  • SSL/TLS Termination                                      │  │
│  │  • Static Asset Delivery                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Public IPs: 104.16.0.0/16 (Cloudflare range)                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              │ Peered Connection
                              │ (Cloudflare → AWS)
┌─────────────────────────────▼──────────────────────────────────────┐
│                       AWS VPC (us-west-2)                          │
│                                                                   │
│  VPC CIDR: 10.0.0.0/16                                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 Public Subnets (10.0.1.0/24)                │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │        Internet Gateway (igw-xxxxxxxx)          │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  │                          │                                  │  │
│  │  ┌────────────────────────▼────────────────────────────┐ │  │
│  │  │        Application Load Balancer (ALB)                │ │  │
│  │  │        Public DNS: api.harmonyflow.io                │ │  │
│  │  │        Public IP: 52.x.x.x                           │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                          │                                  │  │
│  │  ┌────────────────────────▼────────────────────────────┐ │  │
│  │  │      NAT Gateways (2 for HA)                         │ │  │
│  │  │      10.0.1.10, 10.0.1.11                           │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│                          │                                         │
│  ┌───────────────────────▼────────────────────────────────────┐     │
│  │              Private Subnets (10.0.2.0/24)                 │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          Kubernetes EKS Cluster                   │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────────────────────────────────────────┐  │   │     │
│  │  │  │  Worker Nodes (EC2)                          │  │   │     │
│  │  │  │  • Type: m5.xlarge                           │  │   │     │
│  │  │  │  • Count: 6 (3 AZs × 2)                     │  │   │     │
│  │  │  │  • SG: Allow only ALB ingress               │  │   │     │
│  │  │  └──────────────────────────────────────────────┘  │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────────────────────────────────────────┐  │   │     │
│  │  │  │  Pods (Session State Service)                │  │   │     │
│  │  │  │  • 3 replicas (1 per AZ)                     │  │   │     │
│  │  │  │  • Internal IPs: 10.0.2.x                   │  │   │     │
│  │  │  └──────────────────────────────────────────────┘  │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────────────────────────────────────────┐  │   │     │
│  │  │  │  Linkerd Service Mesh                        │  │   │     │
│  │  │  │  • mTLS between all services                │  │   │     │
│  │  │  │  • Sidecar proxy on each pod                │  │   │     │
│  │  │  └──────────────────────────────────────────────┘  │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  └──────────────────────────────────────────────────────────────┘  │     │
│                          │                                          │
│                          │                                         │
│  ┌───────────────────────▼────────────────────────────────────┐     │
│  │              Private Subnets (10.0.3.0/24)                 │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          PostgreSQL (RDS)                         │   │     │
│  │  │                                                      │   │     │
│  │  │  • Multi-AZ deployment                             │   │     │
│  │  │  • Primary: 10.0.3.10                             │   │     │
│  │  │  • Replica 1: 10.0.4.10 (AZ 2)                    │   │     │
│  │  │  • Replica 2: 10.0.5.10 (AZ 3)                    │   │     │
│  │  │  • Port: 5432                                      │   │     │
│  │  │  • SG: Allow EKS nodes only                        │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          Redis Cluster (ElastiCache)                │   │     │
│  │  │                                                      │   │     │
│  │  │  • 6 nodes (3 shards × 2 replicas)                  │   │     │
│  │  │  • Nodes: 10.0.3.20-25                            │   │     │
│  │  │  • Port: 6379                                      │   │     │
│  │  │  • Encryption in transit (TLS)                      │   │     │
│  │  │  • SG: Allow EKS nodes only                        │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          RabbitMQ (self-managed)                   │   │     │
│  │  │                                                      │   │     │
│  │  │  • 3 nodes (1 per AZ)                             │   │     │
│  │  │  • Nodes: 10.0.3.30-32                           │   │     │
│  │  │  • Port: 5672 (AMQP), 15672 (Management)          │   │     │
│  │  │  • SG: Allow EKS nodes only                        │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  └──────────────────────────────────────────────────────────────┘  │     │
│                          │                                          │
│                          │                                         │
│  ┌───────────────────────▼────────────────────────────────────┐     │
│  │              Private Subnets (10.0.4.0/24)                 │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          HashiCorp Vault                          │   │     │
│  │  │                                                      │   │     │
│  │  │  • 3 nodes (1 per AZ)                             │   │     │
│  │  │  • Nodes: 10.0.4.10-12                           │   │     │
│  │  │  • Port: 8200                                     │   │     │
│  │  │  • SG: Allow EKS nodes only                        │   │     │
│  │  │  • KMS encryption for storage                       │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  │                                                              │     │
│  │  ┌────────────────────────────────────────────────────┐   │     │
│  │  │          Monitoring Stack                           │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │     │     │
│  │  │  │Prometheus│  │ Grafana  │  │AlertManager  │   │     │     │
│  │  │  │10.0.4.50 │  │10.0.4.51 │  │  10.0.4.52   │   │     │     │
│  │  │  │Port:9090 │  │Port:3000 │  │   Port:9093  │   │     │     │
│  │  │  └──────────┘  └──────────┘  └──────────────┘   │     │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────┐                                       │   │     │
│  │  │  │  Loki    │                                       │   │     │
│  │  │  │10.0.4.53│                                       │   │     │
│  │  │  │Port:3100 │                                       │   │     │
│  │  │  └──────────┘                                       │   │     │
│  │  │  SG: Internal access only (via VPN)                  │   │     │
│  │  └──────────────────────────────────────────────────────┘  │   │     │
│  └──────────────────────────────────────────────────────────────┘  │     │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              │ AWS Direct Connect / Site-to-Site VPN
┌─────────────────────────────▼──────────────────────────────────────┐
│                       Corporate Network                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  VPN Gateway                                 │  │
│  │                  192.168.1.1                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          │                                          │
│  ┌───────────────────────┴────────────────────────────────────┐     │
│  │              Operations Team                                │     │
│  │  • DevOps engineers                                      │     │
│  │  • SRE team                                               │     │
│  │  • Security team                                           │     │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Security Zones                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Zone 1: Public Internet                                          │
│  - All users, devices, and potential attackers                    │
│  - No trust assumed                                                │
│                                                                     │
│  Zone 2: DMZ / Edge                                               │
│  - Cloudflare WAF, CDN                                            │
│  - Public ALB                                                     │
│  - Limited trust (managed by AWS/Cloudflare)                      │
│                                                                     │
│  Zone 3: Application Layer                                         │
│  - EKS worker nodes                                               │
│  - Kubernetes pods                                                │
│  - Service mesh (Linkerd)                                         │
│  - Medium trust (internal controls)                               │
│                                                                     │
│  Zone 4: Data Layer                                               │
│  - PostgreSQL, Redis, RabbitMQ                                   │
│  - High trust (strict access control)                             │
│                                                                     │
│  Zone 5: Management Layer                                          │
│  - Vault, Monitoring                                             │
│  - Very high trust (VPN access only)                             │
│  - Corporate network                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Network Security Controls

### 1. Firewall Rules

#### Internet → Cloudflare
```
Allow: HTTPS (443) from 0.0.0.0/0
Allow: WSS (443) from 0.0.0.0/0
Block: All other traffic
```

#### Cloudflare → AWS ALB
```
Allow: HTTPS (443) from Cloudflare IPs
Allow: Health checks
Block: Direct access (no bypass allowed)
```

#### ALB → EKS
```
Allow: HTTPS (8443) to EKS Security Group
Allow: Health checks to /health endpoints
Block: All other direct access
```

#### EKS → Data Layer
```
Allow: PostgreSQL (5432) from EKS SG to RDS SG
Allow: Redis (6379) from EKS SG to ElastiCache SG
Allow: RabbitMQ (5672) from EKS SG to RabbitMQ SG
Block: All other traffic
```

#### Corporate Network → AWS
```
Allow: SSH (22) via VPN only
Allow: kubectl API (6443) via VPN only
Allow: Grafana (3000) via VPN only
Allow: Prometheus (9090) via VPN only
Block: All other direct access
```

### 2. Security Groups

| SG Name | Inbound | Outbound | Purpose |
|---------|---------|----------|---------|
| `sg-alb` | Cloudflare:443 | EKS:8443 | Load balancer |
| `sg-eks` | ALB:443 | Data services | Worker nodes |
| `sg-rds` | EKS:5432 | - | Database |
| `sg-redis` | EKS:6379 | - | Cache |
| `sg-vault` | EKS:8200 | - | Secrets |
| `sg-monitoring` | VPN:3000,9090 | - | Observability |

### 3. Network Policies (Kubernetes)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: session-state-service-policy
spec:
  podSelector:
    matchLabels:
      app: session-state-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
  - from:
    - namespaceSelector:
        matchLabels:
          name: linkerd
    ports:
    - protocol: TCP
      port: 8443
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: postgresql
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - namespaceSelector:
        matchLabels:
          name: redis
    ports:
    - protocol: TCP
      port: 6379
  - to:
    - namespaceSelector:
        matchLabels:
          name: rabbitmq
    ports:
    - protocol: TCP
      port: 5672
```

## Traffic Flow Examples

### 1. User API Request
```
User → Cloudflare (WAF) → AWS ALB → EKS → Session State Service → PostgreSQL
                                                                 ↓
                                                            Redis
```

### 2. WebSocket Connection
```
User → Cloudflare → AWS ALB → EKS → Session State Service (WebSocket Handler)
                                                                 ↓
                                                            Redis (pub/sub)
```

### 3. Operations Access
```
Ops → Corporate VPN → AWS VPN Gateway → EKS API Server
                                   → Grafana/Prometheus
```

## Availability Zones (AZ)

| AZ | Purpose | Components |
|----|---------|------------|
| us-west-2a | Primary | EKS nodes 1-2, RDS Primary, Redis Shard 1, Vault 1 |
| us-west-2b | Secondary | EKS nodes 3-4, RDS Replica 1, Redis Shard 2, Vault 2 |
| us-west-2c | Secondary | EKS nodes 5-6, RDS Replica 2, Redis Shard 3, Vault 3 |

---

**File:** network-topology.diagram  
**Format:** ASCII  
**Last Updated:** 2026-02-12
