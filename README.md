******THIS IS A SECURITY RESEARCH PROJECT. DO NOT USE THIS SOFTWARE THERE IS AN OBFUSCATED RAT IN THIS*****

# Security Research Proof of Concept

This repository contains a proof-of-concept implementation created strictly for security research and educational purposes. The goal of this project is to demonstrate how remote access techniques can be implemented so that defenders, security researchers, and students can better understand, detect, and mitigate such threats.

This code is **not intended for unauthorized access, surveillance, or malicious use**. Deploying software like this against systems without explicit permission is illegal and unethical.

No guarantees, support, or warranties are provided. By accessing this repository, you agree to use the information responsibly, in controlled environments, and in compliance with all applicable laws and regulations.

If you are a defender, this project is meant to help you understand attacker tradecraft so you can build stronger protections—not to enable abuse.

see [stardust.md](stardust.md) for more details 

# HarmonyFlow SyncBridge

A cloud-native wellness platform enabling seamless cross-device session continuity and real-time state synchronization.

---

## Overview

HarmonyFlow SyncBridge is a production-ready wellness platform built on a microservices architecture that allows users to maintain their session state across multiple devices in real-time. The platform supports up to 5 simultaneous devices with sub-100ms handoff latency, powered by WebSocket connections, Redis caching, and robust authentication.

### Key Features

- **Cross-Device Handoff**: Seamlessly transfer sessions between devices with QR code pairing
- **Real-Time State Synchronization**: WebSocket-based state updates across all connected devices
- **Multi-Device Support**: Connect up to 5 devices simultaneously
- **Offline Support**: Progressive Web App (PWA) with offline capabilities
- **Secure Authentication**: JWT-based authentication with role-based access control
- **Admin Dashboard**: Real-time metrics, session monitoring, and system health
- **Mobile Apps**: Native iOS and Android applications with React Native

---

## Architecture

HarmonyFlow SyncBridge follows a cloud-native microservices architecture deployed on Kubernetes:

### Core Services

| Service | Technology | Description |
|----------|------------|-------------|
| **Session State Service** | Go | Manages session state, WebSocket connections, and multi-device handoff |
| **Content Delivery Service** | Rust | Chunked asset delivery with offline caching (Phase 2) |
| **Collaboration Service** | Node.js | Real-time co-editing with WebRTC + OT (Phase 3) |
| **Personalization Service** | Python | A/B testing and adaptive UI (Phase 4) |

### Infrastructure Components

- **Kubernetes**: Container orchestration with auto-scaling (HPA: 5-20 replicas)
- **PostgreSQL**: Primary database with 2 replicas for high availability
- **Redis**: 6-node cluster for session state caching
- **RabbitMQ**: 3-node cluster for asynchronous messaging
- **Vault**: HashiCorp Vault for secrets management
- **Prometheus/Grafana**: Monitoring and alerting stack

---

## Documentation

### Getting Started

- [Quick Start Guide](docs/user/USER_GUIDE.md) - Get started with HarmonyFlow SyncBridge
- [API Reference](docs/api/API_REFERENCE.md) - Complete API documentation with examples
- [Deployment Guide](docs/operations/DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions

### Architecture & Design

- [System Architecture](docs/architecture/diagrams/system-architecture.md) - High-level system overview
- [Data Flow](docs/architecture/diagrams/data-flow.md) - Detailed data flow diagrams
- [Network Topology](docs/architecture/diagrams/network-topology.md) - AWS VPC layout and security zones
- [Kubernetes Deployment](docs/architecture/diagrams/k8s-deployment.md) - K8s deployment architecture
- [Security Architecture](docs/architecture/diagrams/security-architecture.md) - Defense-in-depth security model

### Operations

- [Operations Handbook](docs/handoff/OPERATIONS_HANDBOOK.md) - Complete operations guide for the team
- [Monitoring Runbook](docs/runbooks/monitoring-runbook.md) - Monitoring setup, dashboards, and alerts
- [Backup & Recovery Runbook](docs/runbooks/backup-recovery-runbook.md) - Backup strategy and disaster recovery
- [Deployment Runbook](docs/runbooks/deployment-runbook.md) - Production deployment procedures
- [Rollback Runbook](docs/runbooks/rollback-runbook.md) - Rollback procedures for failed deployments
- [Troubleshooting Guide](docs/runbooks/troubleshooting-guide.md) - Common issues and resolution steps

### Security

- [Security Overview](docs/security/SECURITY_OVERVIEW.md) - Threat model, security controls, audit logging
- [Vulnerability Disclosure Policy](security/VULNERABILITY_DISCLOSURE_POLICY.md) - Public security disclosure policy
- [Security Runbook](security/SECURITY_RUNBOOK.md) - Operational security procedures
- [Incident Response Procedures](security/INCIDENT_RESPONSE_PROCEDURES.md) - Security incident response

### Testing & Quality

- [Week 4 Security Assessment](security/WEEK4_SECURITY_ASSESSMENT.md) - Complete security audit findings
- [Penetration Test Report](tests/security/PENETRATION_TEST_REPORT.md) - Security testing results
- [Week 5 Quality Gates](WEEK5_QUALITY_GATES_VERIFICATION.md) - Quality gates verification
- [Week 6 Success Criteria](WEEK6_SUCCESS_CRITERIA_VERIFICATION.md) - Final success criteria

---

## Project Structure

```
watercooler/
├── services/                      # Backend services
│   └── session-state-service/     # Go backend (Phase 1)
│       ├── cmd/                   # Application entry point
│       ├── internal/
│       │   ├── auth/              # JWT authentication
│       │   ├── handlers/          # HTTP & WebSocket handlers
│       │   ├── middleware/        # Security middleware
│       │   ├── protocol/          # WebSocket implementation
│       │   └── redis/             # Redis client
│       └── tests/                # Unit tests
│
├── packages/                      # Shared libraries
│   └── client-state-manager/      # TypeScript state management
│       ├── src/
│       │   ├── core/              # StateManager, WebSocketClient
│       │   ├── handoff/           # Multi-device handoff
│       │   ├── adapters/          # Redux, MobX adapters
│       │   └── types/             # TypeScript definitions
│       └── tests/                # Unit tests
│
├── apps/                          # Frontend applications
│   ├── web/                       # React PWA
│   │   └── src/
│   │       ├── components/         # UI components
│   │       ├── store/              # Redux state management
│   │       └── screens/           # Page components
│   └── mobile/                    # React Native
│       ├── src/
│       │   ├── screens/            # Mobile screens
│       │   ├── navigation/         # React Navigation
│       │   └── services/           # API integration
│       ├── ios/                    # iOS project
│       └── android/                # Android project
│
├── contracts/                     # API contracts
│   ├── openapi/                   # OpenAPI 3.0 specs
│   ├── websocket/                 # WebSocket protocol
│   ├── protobuf/                  # Protocol buffer definitions
│   └── typescript/                # Generated TypeScript types
│
├── infrastructure/                 # Infrastructure as code
│   ├── terraform/                 # AWS infrastructure
│   ├── kubernetes/                # K8s manifests
│   ├── vault/                     # Vault configuration
│   └── scripts/                   # Deployment scripts
│
├── tests/                         # Test suites
│   ├── e2e/                       # Playwright E2E tests
│   ├── integration/               # Integration tests
│   ├── security/                  # Security tests
│   ├── load/                      # Load testing (k6)
│   └── production/                # Production test reports
│
├── docs/                          # Documentation
│   ├── api/                       # API documentation
│   ├── architecture/              # Architecture diagrams
│   ├── runbooks/                  # Operations runbooks
│   ├── security/                  # Security documentation
│   ├── operations/                # Operational guides
│   ├── handoff/                   # Handoff documentation
│   └── user/                     # User documentation
│
└── security/                      # Security artifacts
    ├── WEEK4_SECURITY_ASSESSMENT.md
    ├── SECURITY_RUNBOOK.md
    └── INCIDENT_RESPONSE_PROCEDURES.md
```

---

## Technology Stack

### Backend

- **Go 1.21+** - Session State Service
- **Gin** - HTTP framework
- **Gorilla WebSocket** - WebSocket implementation
- **Redis** - State caching and distributed rate limiting
- **PostgreSQL** - Primary database
- **RabbitMQ** - Message queue
- **golang-jwt/jwt** - JWT authentication

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type-safe development
- **Redux Toolkit** - State management
- **Vite** - Build tool
- **Playwright** - E2E testing
- **Jest** - Unit testing

### Mobile

- **React Native** - Cross-platform mobile
- **React Navigation** - Navigation
- **Expo** - Development framework

### Infrastructure

- **Kubernetes** - Container orchestration
- **EKS** - Managed Kubernetes (AWS)
- **Terraform** - Infrastructure as code
- **Vault** - Secrets management
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **NGINX** - Load balancing

---

## Key Capabilities

### Cross-Device Handoff

- **QR Code Pairing**: Scan QR code to pair new devices
- **5-Device Support**: Connect up to 5 devices simultaneously
- **45-80ms Latency**: Fast state transfer between devices
- **Conflict Resolution**: Handle conflicting state changes
- **Token-Based Security**: One-time use handoff tokens

### Real-Time Synchronization

- **WebSocket Protocol**: Persistent connections for real-time updates
- **State Management**: Automatic state propagation across devices
- **Offline Support**: Continue working offline, sync on reconnection
- **Conflict Detection**: Detect and resolve state conflicts

### Security

- **JWT Authentication**: HMAC-SHA256 signed tokens
- **Role-Based Access Control**: Admin, user, guest roles
- **Rate Limiting**: 100 req/min per IP, 1000 req/min per user
- **CSRF Protection**: Double-submit cookie pattern
- **CORS Security**: Strict origin whitelist
- **Secrets Management**: Vault-based secrets storage

### Performance

- **Bundle Size**: 75KB (43% reduction)
- **API Response Time**: p50 <50ms, p95 <100ms
- **Handoff Latency**: <100ms average
- **Concurrent Connections**: Tested to 12,000+
- **Auto-Scaling**: 5-20 replicas based on load

---

## Performance Metrics

| Metric | Value | Target | Status |
|--------|--------|---------|--------|
| API Response Time (p50) | 42ms | <50ms | ✅ |
| API Response Time (p95) | 85ms | <100ms | ✅ |
| API Response Time (p99) | 145ms | <200ms | ✅ |
| Handoff Latency | 82ms | <100ms | ✅ |
| WebSocket Latency | 32ms | <50ms | ✅ |
| Bundle Size | 75KB | <100KB | ✅ |
| Test Coverage | 94% | >90% | ✅ |

---

## Security Posture

| Category | Critical | High | Medium | Low | Status |
|----------|----------|------|--------|-----|--------|
| Vulnerabilities | 0 | 0 | 2 | 5 | ✅ Excellent |
| Security Tests | 157 | - | - | - | 100% Pass |
| OWASP Compliance | 10/10 | - | - | - | ✅ Compliant |

---

## Testing

### Test Coverage

- **Unit Tests**: 157 tests (Go + TypeScript)
- **Integration Tests**: 132 tests
- **E2E Tests**: 190+ tests (60 critical, 130+ edge cases)
- **Security Tests**: 157 penetration tests
- **Load Tests**: 10,000 concurrent connections validated

### Test Execution

```bash
# Run unit tests
cd services/session-state-service
go test ./...

# Run integration tests
cd tests/integration
npm test

# Run E2E tests
cd tests/e2e
npx playwright test

# Run security tests
cd tests/security
go test -v
```

---

## Deployment

### Prerequisites

- Kubernetes cluster (EKS recommended)
- Docker
- kubectl configured
- Vault access
- AWS credentials (for EKS)

### Quick Deploy

```bash
# Deploy to staging
cd infrastructure
./scripts/deploy-production.sh staging

# Deploy to production
./scripts/deploy-production.sh production

# Migrate secrets to Vault
cd vault
./migrate-secrets-to-vault.sh production

# Run smoke tests
./scripts/smoke-test.sh
```

### Production Deployment

See [Deployment Guide](docs/operations/DEPLOYMENT_GUIDE.md) for detailed production deployment instructions.

---

## Monitoring

The platform includes comprehensive monitoring with:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Dashboards and visualization
- **AlertManager**: Alert routing and notification
- **Loki**: Log aggregation
- **PagerDuty**: On-call alerting
- **Slack**: Team notifications

**Dashboards:**
- API Metrics Dashboard
- WebSocket Metrics Dashboard
- Database Metrics Dashboard
- Redis Metrics Dashboard
- System Metrics Dashboard
- Custom Alerts Dashboard

See [Monitoring Runbook](docs/runbooks/monitoring-runbook.md) for details.

---

## Roadmap

### Phase 1: Foundation ✅ COMPLETE

- ✅ Week 1: Infrastructure, data layer, API contracts
- ✅ Week 2: Integration, PWA, testing framework
- ✅ Week 3: Cross-device handoff, admin dashboard
- ✅ Week 4: Performance optimization, security audit
- ✅ Week 5: Security fixes, penetration testing
- ✅ Week 6: Production polish, documentation

### Phase 2: Content Delivery (Upcoming)

- Rust-based Content Delivery Service
- Chunked asset delivery
- Offline caching optimization
- CDN integration

### Phase 3: Collaboration (Future)

- Node.js Collaboration Service
- WebRTC-based real-time communication
- Operational Transformation (OT)
- Multi-user editing

### Phase 4: Personalization (Future)

- Python Personalization Service
- A/B testing framework
- Adaptive UI based on user behavior
- Machine learning recommendations

---

## Contributing

This project is developed as a coordinated effort by multiple specialized development teams. For contribution guidelines and development procedures, refer to:

- [Operations Handbook](docs/handoff/OPERATIONS_HANDBOOK.md) - Team workflows and procedures
- [Security Overview](docs/security/SECURITY_OVERVIEW.md) - Security guidelines
- [API Reference](docs/api/API_REFERENCE.md) - API development standards

---

## Support

### Documentation

- [User Guide](docs/user/USER_GUIDE.md) - End-user documentation
- [Troubleshooting Guide](docs/runbooks/troubleshooting-guide.md) - Common issues
- [FAQ](docs/user/USER_GUIDE.md#faq) - Frequently asked questions

### Escalation

For critical issues or questions, refer to:
- [Incident Response Procedures](security/INCIDENT_RESPONSE_PROCEDURES.md)
- [Operations Handbook](docs/handoff/OPERATIONS_HANDBOOK.md#escalation-contacts)

---

## License

[Add your license information here]

---

## Acknowledgments

Built with modern cloud-native technologies and best practices for scalability, security, and performance.

---

**Project Status**: Phase 1 Complete, Production Deployment Ready  
**Last Updated**: February 12, 2026  
**Documentation Version**: 1.0
