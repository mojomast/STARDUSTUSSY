# Security Architecture Diagram

**Description:** Security architecture showing defense-in-depth controls across all layers.

## ASCII Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Security Architecture - HarmonyFlow               │
│                      Defense in Depth Approach                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Physical & Network Security                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AWS Physical Security                                      │  │
│  │  • Data centers with 24/7 physical security                 │  │
│  │  • Biometric access controls                                 │  │
│  │  • Video surveillance                                       │  │
│  │  • Environmental controls (fire suppression, HVAC)         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Network Security                                           │  │
│  │  • VPC isolation (10.0.0.0/16)                            │  │
│  │  • Public/Private subnet separation                         │  │
│  │  • Security Groups (stateful firewalls)                     │  │
│  │  • NACLs (stateless firewalls)                              │  │
│  │  • VPC Flow Logs                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 2: Edge Security (CDN/WAF)                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Cloudflare Security                                        │  │
│  │  • DDoS Protection (L3-L7)                                 │  │
│  │  • Web Application Firewall (WAF)                           │  │
│  │  • Bot Management                                           │  │
│  │  • Rate Limiting                                            │  │
│  │  • IP Reputation                                            │  │
│  │  • Geo-IP Blocking                                          │  │
│  │  • SSL/TLS Termination                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Rules:                                                          │
│  • Block SQL injection patterns                                   │
│  • Block XSS attempts                                             │
│  • Block known malicious IPs                                      │
│  • Rate limit per IP: 1000 req/min                               │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 3: Transport Security                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  TLS 1.3 (Minimum)                                         │  │
│  │  • Strong ciphers only (AES-256-GCM, ChaCha20)             │  │
│  │  • HSTS (Strict-Transport-Security) with 1 year max-age    │  │
│  │  • Certificate pinning (mobile apps)                         │  │
│  │  • OCSP Stapling                                            │  │
│  │  • Certificate Transparency                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Certificate Management:                                           │
│  • Let's Encrypt (automatic renewal)                              │
│  • 90-day validity                                                │
│  • Automatic renewal 30 days before expiry                         │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 4: Application Security                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Authentication & Authorization                             │  │
│  │  • JWT Bearer tokens (HS256)                               │  │
│  │  • Access token: 15 min expiry                             │  │
│  │  • Refresh token: 7 days expiry                            │  │
│  │  • Role-Based Access Control (RBAC)                         │  │
│  │  • Device-bound sessions                                    │  │
│  │  • Multi-factor authentication (optional)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Input Validation                                          │  │
│  │  • UUID v4 format validation                               │  │
│  │  • JSON Schema validation                                 │  │
│  │  • Size limits (512KB max state)                           │  │
│  │  • Depth limits (max 10 levels nested)                     │  │
│  │  • Character whitelist for user inputs                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Rate Limiting                                             │  │
│  │  • Per IP: 100 requests/hour                               │  │
│  │  • Per user: 1000 requests/hour                            │  │
│  │  • Per device: 100 WebSocket messages/minute                │  │
│  │  • Token bucket algorithm                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  CSRF Protection                                           │  │
│  │  • CSRF tokens on state-changing requests                  │  │
│  │  • SameSite=Strict cookies                                 │  │
│  │  • Double-submit cookie pattern                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  CORS Controls                                             │  │
│  │  • Whitelisted origins only                                 │  │
│  │  • Pre-flight caching                                       │  │
│  │  • No credentials for cross-origin                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 5: Service Mesh Security                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Linkerd Service Mesh                                      │  │
│  │  • Mutual TLS (mTLS) for all service-to-service traffic   │  │
│  │  • Automatic certificate rotation (24 hours)               │  │
│  │  • Service identity (SPIFFE)                              │  │
│  │  • Zero trust networking                                   │  │
│  │  • Network policies (deny by default)                      │  │
│  │  • Traffic splitting (canary deployments)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  mTLS Flow:                                                       │
│  ┌──────────┐    mTLS    ┌──────────┐    mTLS    ┌──────────┐   │
│  │ Service  │◄────────►│  Linkerd │◄────────►│ Service  │   │
│  │  A       │          │  Mesh    │          │   B      │   │
│  └──────────┘          └──────────┘          └──────────┘   │
│     ↑ Sidecar                               ↑ Sidecar          │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 6: Data Security                                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Encryption at Rest                                        │  │
│  │  • AES-256-GCM encryption                                  │  │
│  │  • Field-level encryption for PII                          │  │
│  │  • Database encryption (RDS)                               │  │
│  │  • Volume encryption (EBS)                                │  │
│  │  • Key rotation every 90 days                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Secrets Management                                       │  │
│  │  • HashiCorp Vault                                        │  │
│  │  • Automatic secret rotation                               │  │
│  │  • Encryption with KMS (AWS)                              │  │
│  │  • Audit logging of all secret access                      │  │
│  │  • One-time use tokens                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Sensitive Fields (encrypted):                                    │
│  • Email addresses                                               │
│  • Phone numbers                                                  │
│  • User notes                                                    │
│  • Session data (optional)                                        │
│                                                                   │
│  Non-sensitive (plain text):                                      │
│  • Session metadata                                              │
│  • Device information                                            │
│  • Configuration                                                │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 7: Logging & Monitoring Security                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Security Logging                                          │  │
│  │  • All authentication attempts                              │  │
│  │  • Authorization failures                                   │  │
│  │  • Sensitive data access                                    │  │
│  │  • Configuration changes                                   │  │
│  │  • Security events (SIEM)                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Security Monitoring                                       │  │
│  │  • Prometheus metrics for security events                   │  │
│  │  • Grafana dashboards                                      │  │
│  │  • AlertManager for real-time alerts                       │  │
│  │  • Loki for log aggregation                                │  │
│  │  • SIEM integration (planned)                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Security Metrics:                                                 │
│  • Failed authentication rate                                     │
│  • Blocked requests by WAF                                         │
│  • Rate limit violations                                          │
│  • Anomalous behavior detection                                   │
│  • Vulnerability scan results                                     │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 8: Compliance & Governance                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Compliance Standards                                      │  │
│  │  • GDPR (General Data Protection Regulation)                │  │
│  │  • CCPA (California Consumer Privacy Act)                   │  │
│  │  • SOC 2 Type II (in progress)                              │  │
│  │  • ISO 27001 (planned)                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Security Policies                                         │  │
│  │  • Acceptable Use Policy                                   │  │
│  │  • Data Retention Policy                                   │  │
│  │  • Incident Response Policy                                │  │
│  │  • Access Control Policy                                   │  │
│  │  • Vulnerability Management Policy                          │  │
│  │  • Third-Party Risk Policy                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Security Processes                                        │  │
│  │  • Regular security reviews                               │  │
│  │  • Penetration testing (quarterly)                        │  │
│  │  • Vulnerability scanning (weekly)                         │  │
│  │  • Security training (monthly)                              │  │
│  │  • Incident response drills (quarterly)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   Threat Mitigation Summary                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Threat: DDoS Attack                                               │
│  Mitigation: Cloudflare DDoS protection + AWS Shield + Rate limiting│
│                                                                     │
│  Threat: SQL Injection                                            │
│  Mitigation: WAF + Prepared statements + Input validation          │
│                                                                     │
│  Threat: XSS                                                       │
│  Mitigation: WAF + Output encoding + CSP headers                    │
│                                                                     │
│  Threat: Man-in-the-Middle                                         │
│  Mitigation: TLS 1.3 + mTLS + Certificate pinning                  │
│                                                                     │
│  Threat: Data Breach                                               │
│  Mitigation: Encryption at rest + Field-level encryption + Access   │
│              controls + Audit logging                               │
│                                                                     │
│  Threat: Insider Threat                                             │
│  Mitigation: Role-based access + Audit logging + Separation of      │
│              duties + Background checks                             │
│                                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

## Security Controls Matrix

| Control | Layer | Status | Owner |
|---------|-------|--------|-------|
| DDoS Protection | Edge | ✅ Active | Cloudflare/AWS |
| WAF | Edge | ✅ Active | Cloudflare |
| TLS 1.3 | Transport | ✅ Active | DevOps |
| mTLS | Service Mesh | ✅ Active | Platform |
| JWT Auth | Application | ✅ Active | Backend |
| Rate Limiting | Application | ✅ Active | Backend |
| Input Validation | Application | ✅ Active | Backend |
| CSRF Protection | Application | ✅ Active | Backend |
| Encryption at Rest | Data | ✅ Active | DevOps |
| Secrets Management | Data | ✅ Active | Security |
| Audit Logging | Monitoring | ✅ Active | Security |
| SIEM Integration | Monitoring | ⏳ Planned | Security |
| CASB | Monitoring | ⏳ Planned | Security |

---

**File:** security-architecture.diagram  
**Format:** ASCII  
**Last Updated:** 2026-02-12
