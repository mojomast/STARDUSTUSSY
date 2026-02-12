# HarmonyFlow SyncBridge - Security Runbook

**Version:** 1.0  
**Last Updated:** February 11, 2026  
**Owner:** Security Team  
**Classification:** INTERNAL USE ONLY

---

## Table of Contents

1. [Overview](#overview)
2. [Security Architecture](#security-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [Monitoring & Alerting](#monitoring--alerting)
5. [Security Controls](#security-controls)
6. [Operational Procedures](#operational-procedures)
7. [Troubleshooting](#troubleshooting)
8. [References](#references)

---

## Overview

This runbook provides operational guidance for maintaining the security of the HarmonyFlow SyncBridge platform. It covers day-to-day security operations, monitoring, and response procedures.

### System Components

- **Session State Service (Go)** - Core backend service
- **Client State Manager (TypeScript)** - Client-side library
- **Redis** - Session storage and caching
- **WebSocket** - Real-time communication layer

---

## Security Architecture

### Authentication Flow

```
┌─────────────┐     JWT Token      ┌──────────────────┐
│   Client    │ <----------------> │  Session State   │
│             │     (15 min)       │     Service      │
└─────────────┘                    └──────────────────┘
       │                                    │
       │ WebSocket                          │ Redis
       │ Connection                         │ Storage
       ▼                                    ▼
┌─────────────┐                    ┌──────────────────┐
│  WebSocket  │ <----------------> │  Session Data    │
│  Handler    │   State Sync       │  Encrypted       │
└─────────────┘                    └──────────────────┘
```

### Security Boundaries

1. **Network Perimeter**
   - TLS 1.3 required for all connections
   - WebSocket origin validation enforced
   - Rate limiting at load balancer and application level

2. **Authentication Boundary**
   - JWT tokens required for all operations except health check
   - Token refresh every 15 minutes
   - Session validation on every WebSocket message

3. **Data Boundary**
   - PII encrypted at rest in Redis
   - Sensitive fields masked in logs
   - No plaintext secrets in code or config

---

## Authentication & Authorization

### JWT Token Structure

```json
{
  "user_id": "uuid",
  "device_id": "uuid",
  "session_id": "uuid",
  "roles": ["user"],
  "exp": 1707734400,
  "iat": 1707733500,
  "nbf": 1707733500
}
```

### Role Definitions

| Role | Permissions |
|------|-------------|
| `user` | Read/write own session data, WebSocket connections |
| `admin` | Full system access, metrics, broadcast messages |
| `service` | Internal service-to-service authentication |

### Token Validation Checklist

- [ ] Signature verified with HS256
- [ ] Expiration time not exceeded
- [ ] Issued at time reasonable (no future tokens)
- [ ] Not before time respected
- [ ] Required claims present (user_id, session_id, device_id)

---

## Monitoring & Alerting

### Critical Security Metrics

Monitor these metrics with the following thresholds:

#### 1. Authentication Metrics

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Failed auth rate | > 5/min | > 20/min | Check for brute force |
| Token validation errors | > 1% | > 5% | Investigate token issues |
| Refresh token reuse | > 0 | > 0 | Potential token theft |

#### 2. WebSocket Metrics

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Connection rate | > 100/min | > 500/min | Check for DoS |
| Message rate per conn | > 100/min | > 500/min | Rate limit client |
| Origin violations | > 0 | > 10 | Block IPs |
| Unauthenticated messages | > 10/min | > 50/min | Investigate |

#### 3. Data Access Metrics

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Session access anomalies | > 5% | > 10% | Check for hijacking |
| Admin endpoint access | audit | audit | Review logs |
| Data export attempts | > 0 | > 0 | Investigate |

### Log Analysis Queries

#### Failed Authentication Attempts

```bash
# grep pattern for failed auth
grep "Invalid token\|Unauthorized\|token.*expired" /var/log/syncbridge/*.log

# Count by IP
grep "Invalid token" /var/log/syncbridge/*.log | awk '{print $NF}' | sort | uniq -c | sort -rn | head -20
```

#### WebSocket Anomalies

```bash
# High message rate by connection
grep "Send channel full" /var/log/syncbridge/*.log | awk '{print $6}' | sort | uniq -c | sort -rn

# Origin violations (after fix deployed)
grep "origin.*rejected" /var/log/syncbridge/*.log
```

### Alert Configuration Examples

#### Prometheus AlertManager Rules

```yaml
groups:
  - name: syncbridge_security
    rules:
      - alert: HighAuthFailureRate
        expr: rate(syncbridge_auth_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate"
          
      - alert: PotentialBruteForce
        expr: rate(syncbridge_auth_failures_total[1m]) > 0.5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Possible brute force attack"
          
      - alert: WebSocketDoS
        expr: rate(syncbridge_websocket_messages_total[1m]) > 1000
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Possible WebSocket DoS attack"
```

---

## Security Controls

### 1. Rate Limiting Configuration

#### HTTP Endpoints

```go
// Recommended configuration
RateLimitConfig{
    PublicEndpoints: RateLimit{
        RequestsPerMinute: 60,
        BurstSize: 10,
    },
    AuthEndpoints: RateLimit{
        RequestsPerMinute: 5,
        BurstSize: 3,
    },
    AuthenticatedEndpoints: RateLimit{
        RequestsPerMinute: 1000,
        BurstSize: 100,
    },
    AdminEndpoints: RateLimit{
        RequestsPerMinute: 100,
        BurstSize: 20,
    },
}
```

#### WebSocket Connections

```go
// Per-connection limits
WebSocketRateLimit{
    MessagesPerMinute: 100,
    MaxConnectionsPerIP: 10,
    ConnectionRatePerIP: 5,  // per minute
}
```

### 2. Input Validation Rules

#### Session ID Validation

- Must be valid UUID v4 format
- Length: exactly 36 characters
- Pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`

#### User ID Validation

- Must be valid UUID
- No special characters except hyphens
- Max length: 64 characters

#### State Data Validation

- Max size: 512KB per snapshot
- Max depth: 10 levels nested
- No circular references
- Field names: alphanumeric + underscore, max 256 chars

### 3. Encryption Configuration

#### At Rest (Redis)

```go
// Field-level encryption for sensitive data
EncryptionConfig{
    Algorithm: "AES-256-GCM",
    KeyRotation: 90 * 24 * time.Hour,  // 90 days
    SensitiveFields: []string{
        "email",
        "phone",
        "ssn",
        "credit_card",
        "password",
    },
}
```

#### In Transit

- TLS 1.3 minimum
- Certificate pinning for mobile clients
- HSTS with 1 year max-age

### 4. WebSocket Security Configuration

```go
// Secure upgrader configuration
var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        origin := r.Header.Get("Origin")
        allowedOrigins := getAllowedOrigins() // from config
        return isAllowedOrigin(origin, allowedOrigins)
    },
    EnableCompression: true,
}
```

---

## Operational Procedures

### Daily Security Checks

#### Morning Checklist (Run at 09:00 UTC)

- [ ] Review overnight authentication failure logs
- [ ] Check for blocked IPs in rate limiter
- [ ] Verify security monitoring dashboards accessible
- [ ] Review any automated security alerts
- [ ] Check certificate expiry (alert if < 30 days)

#### Evening Checklist (Run at 18:00 UTC)

- [ ] Review day's security events
- [ ] Check for unusual traffic patterns
- [ ] Verify backup completion (if applicable)
- [ ] Review admin access logs

### Weekly Security Tasks

- [ ] Run dependency vulnerability scan
- [ ] Review access logs for anomalies
- [ ] Verify security headers on all endpoints
- [ ] Test rate limiting effectiveness
- [ ] Review and rotate any temporary credentials

### Monthly Security Tasks

- [ ] Full security metrics review
- [ ] Penetration test key endpoints
- [ ] Update threat model
- [ ] Review and update security runbook
- [ ] Conduct access review for admin accounts
- [ ] Test incident response procedures

### Quarterly Security Tasks

- [ ] External penetration test
- [ ] Security architecture review
- [ ] Policy compliance audit
- [ ] Disaster recovery test
- [ ] Security training for team

---

## Troubleshooting

### Issue: High Authentication Failure Rate

**Symptoms:**
- Alert: HighAuthFailureRate firing
- Increased 401 responses
- Users reporting login issues

**Investigation Steps:**

1. Check logs for error patterns:
   ```bash
   grep "Invalid token\|Unauthorized" /var/log/syncbridge/*.log | tail -100
   ```

2. Identify source IPs:
   ```bash
   grep "Invalid token" /var/log/syncbridge/*.log | awk '{print $6}' | sort | uniq -c | sort -rn
   ```

3. Check for time sync issues:
   ```bash
   # Verify JWT exp/iat are reasonable
   grep "token.*expired" /var/log/syncbridge/*.log | head -20
   ```

**Resolution:**
- If specific IPs: Block at firewall/WAF
- If widespread: Check JWT secret rotation status
- If time-related: Sync server clocks (NTP)

### Issue: WebSocket Connection Flooding

**Symptoms:**
- High connection count
- Memory usage increasing
- "Send channel full" warnings

**Investigation Steps:**

1. Check connection metrics:
   ```bash
   curl http://localhost:8080/admin/metrics/connections
   ```

2. Identify top connection sources:
   ```bash
   netstat -an | grep :8080 | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
   ```

3. Review WebSocket logs:
   ```bash
   grep "Connection registered" /var/log/syncbridge/*.log | tail -50
   ```

**Resolution:**
- Implement emergency rate limiting
- Restart WebSocket manager if necessary
- Block abusive IPs
- Scale horizontally if legitimate traffic

### Issue: Suspicious Admin Activity

**Symptoms:**
- Unusual admin endpoint access
- After-hours admin activity
- Unknown admin tokens

**Investigation Steps:**

1. Review admin access logs:
   ```bash
   grep "/admin/" /var/log/syncbridge/*.log | grep -v "health"
   ```

2. Check token claims:
   ```bash
   # Decode JWT and check role claim
   # Look for unexpected admin roles
   ```

3. Verify admin user list:
   ```bash
   # Query identity provider for active admins
   ```

**Resolution:**
- Revoke suspicious tokens immediately
- Force password reset for affected accounts
- Enable additional MFA requirements
- Review audit logs for data access

### Issue: Redis Security Concerns

**Symptoms:**
- Unexpected Redis connections
- Data anomalies in sessions
- Performance degradation

**Investigation Steps:**

1. Check Redis access:
   ```bash
   redis-cli CLIENT LIST
   ```

2. Monitor commands:
   ```bash
   redis-cli MONITOR | grep -E "(session|device|user)"
   ```

3. Check for unauthorized access:
   ```bash
   # Review Redis ACL logs
   redis-cli ACL LOG
   ```

**Resolution:**
- Enable Redis AUTH if not already enabled
- Rotate Redis password
- Enable SSL for Redis connections
- Review network ACLs

---

## Security Configuration Reference

### Environment Variables

| Variable | Description | Example | Security Level |
|----------|-------------|---------|----------------|
| `JWT_SECRET` | JWT signing key | (32+ byte random) | CRITICAL |
| `JWT_REFRESH_SECRET` | Refresh token key | (32+ byte random) | CRITICAL |
| `REDIS_PASSWORD` | Redis auth password | (strong password) | HIGH |
| `ALLOWED_ORIGINS` | CORS whitelist | `https://app.example.com` | HIGH |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` | MEDIUM |
| `LOG_LEVEL` | Logging verbosity | `info` | LOW |
| `ENCRYPTION_KEY` | Data encryption key | (32 byte random) | CRITICAL |

### File Permissions

```bash
# Configuration files
chmod 600 /etc/syncbridge/config.yaml
chown root:syncbridge /etc/syncbridge/config.yaml

# Log files
chmod 640 /var/log/syncbridge/*.log
chown syncbridge:syncbridge /var/log/syncbridge/*.log

# TLS certificates
chmod 600 /etc/syncbridge/certs/*.key
chown root:root /etc/syncbridge/certs/*.key
```

### Network Security

#### Firewall Rules

```bash
# Allow only HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j DROP

# Allow Redis only from app servers
iptables -A INPUT -p tcp --dport 6379 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 6379 -j DROP

# Rate limit new connections
iptables -A INPUT -p tcp --dport 443 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT
```

---

## Emergency Contacts

| Role | Contact | Method |
|------|---------|--------|
| Security Lead | security@harmonyflow.io | Email/Slack |
| On-Call Engineer | oncall@harmonyflow.io | PagerDuty |
| DevOps Lead | devops@harmonyflow.io | Email/Slack |
| Legal/Compliance | legal@harmonyflow.io | Email |

---

## References

### Internal Documentation
- Architecture Diagrams: `/docs/architecture`
- API Documentation: `/docs/api`
- Incident Response Plan: `/security/incident-response.md`

### External Resources
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- JWT Security Best Practices: https://tools.ietf.org/html/rfc8725
- WebSocket Security: https://devcenter.heroku.com/articles/websocket-security
- Redis Security: https://redis.io/topics/security

### Security Tools
- gosec: https://github.com/securego/gosec
- govulncheck: https://go.dev/security/vuln/
- OWASP ZAP: https://www.zaproxy.org/
- Burp Suite: https://portswigger.net/burp

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-11 | Security-Agent | Initial version |

---

**Document Classification:** INTERNAL USE ONLY  
**Next Review Date:** 2026-05-11
