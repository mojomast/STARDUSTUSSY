# System Architecture Diagram

**Description:** High-level system architecture showing all components and their relationships.

## ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web PWA    │  │  iOS Mobile  │  │ Android App  │          │
│  │  (React)     │  │ (React Native)│  │(React Native)│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐                                                   │
│  │  Desktop     │                                                   │
│  │  (Electron)  │                                                   │
│  └──────────────┘                                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS/WebSocket
                             │ TLS 1.3
┌────────────────────────────▼────────────────────────────────────────┐
│                      Edge Layer (CDN)                              │
│                   Cloudflare / AWS CloudFront                       │
│  • DDoS Protection  • WAF  • Geo-DNS  • Static Assets              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                  Load Balancer / API Gateway                       │
│                     AWS ALB / NGINX                               │
│  • SSL Termination  • Routing  • Rate Limiting                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                Application Layer (Kubernetes)                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │          Session State Service (Go)                          │  │
│  │  • REST API (Port 8080)                                     │  │
│  │  • WebSocket Handler (Port 8443)                            │  │
│  │  • State Management                                         │  │
│  │  • Multi-Device Handoff                                     │  │
│  │                                                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │  │
│  │  │   Auth   │  │ Handlers │  │ Protocol │               │  │
│  │  │ (JWT)    │  │          │  │ (WS)     │               │  │
│  │  └──────────┘  └──────────┘  └──────────┘               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Note: Content Delivery, Collaboration, and                     │
│        Personalization services coming in future phases            │
└────────────────────────────┬────────────────────────────────────────┘
                             │ mTLS (Linkerd)
┌────────────────────────────▼────────────────────────────────────────┐
│                    Service Mesh (Linkerd)                          │
│  • mTLS  • Observability  • Traffic Management  • Policy          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      Data Layer                                   │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   PostgreSQL    │  │  Redis Cluster   │  │   RabbitMQ    │  │
│  │                 │  │                  │  │              │  │
│  │  • Metadata     │  │  • Session State │  │  • Events    │  │
│  │  • User Accounts│  │  • Caching       │  │  • Jobs      │  │
│  │  • Sessions     │  │  • Real-time Data│  │              │  │
│  │                 │  │  • Pub/Sub       │  │              │  │
│  │  Port: 5432     │  │                  │  │  Port: 5672  │  │
│  └──────────────────┘  │  Port: 6379      │  └──────────────┘  │
│                         └──────────────────┘                     │
└───────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   Secrets Management                                │
│                    HashiCorp Vault                                 │
│  • JWT Secrets  • DB Credentials  • API Keys  • Certificates      │
└───────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   Monitoring & Logging                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │Prometheus│  │ Grafana  │  │  Loki    │  │AlertManager  │  │
│  │ (Metrics)│  │(Dashboards)│ │(Logs)   │  │ (Alerts)     │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

## Key Components

### Client Layer
- **Web PWA:** React-based Progressive Web App
- **Mobile Apps:** React Native for iOS and Android
- **Desktop:** Electron wrapper for cross-platform desktop

### Edge Layer
- **CDN:** Content Delivery Network for static assets and DDoS protection
- **WAF:** Web Application Firewall for security filtering

### Application Layer
- **Session State Service (Go):** Core backend service
  - Handles REST API endpoints
  - Manages WebSocket connections
  - Coordinates state synchronization
  - Implements multi-device handoff

### Service Mesh
- **Linkerd:** Service mesh for secure service-to-service communication
  - mTLS encryption
  - Observability (metrics, tracing)
  - Traffic management

### Data Layer
- **PostgreSQL:** Relational database for metadata and user accounts
- **Redis Cluster:** In-memory data store for session state and caching
- **RabbitMQ:** Message broker for event-driven architecture

### Secrets Management
- **HashiCorp Vault:** Centralized secrets management
  - JWT signing keys
  - Database credentials
  - API keys
  - TLS certificates

### Monitoring
- **Prometheus:** Metrics collection and storage
- **Grafana:** Visualization dashboards
- **Loki:** Log aggregation
- **AlertManager:** Alert routing and management

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Client | React, React Native | User interface |
| Edge | Cloudflare, AWS CloudFront | CDN, security |
| Load Balancer | AWS ALB, NGINX | Traffic distribution |
| Backend | Go 1.21+ | API, WebSocket |
| Service Mesh | Linkerd 2.14+ | mTLS, observability |
| Database | PostgreSQL 15 | Metadata storage |
| Cache | Redis 7 | Session state |
| Message Queue | RabbitMQ 3.12 | Event handling |
| Secrets | HashiCorp Vault | Secrets management |
| Monitoring | Prometheus, Grafana | Observability |
| Container | Kubernetes | Orchestration |
| Infrastructure | AWS, Terraform | Cloud resources |

## Data Flow

### 1. User Session Start
```
Client → CDN → Load Balancer → Session State Service → Redis
                                   ↓
                              PostgreSQL (create session record)
```

### 2. State Synchronization
```
Client A → WebSocket → Session State Service → Redis → WebSocket → Client B
```

### 3. Multi-Device Handoff
```
Device A (pause) → Session State Service → Redis (snapshot)
                                               ↓
Device B (connect) → Session State Service → Redis (retrieve) → Device B
```

---

**File:** system-architecture.diagram  
**Format:** ASCII (can be converted to Mermaid/PlantUML)  
**Last Updated:** 2026-02-12
