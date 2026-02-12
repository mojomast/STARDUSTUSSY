# HarmonyFlow SyncBridge - Security Quick Reference

**One-page reference for critical security information**

---

## Critical Vulnerabilities (Fix Immediately)

### 1. Hardcoded JWT Secrets (CVSS 9.8)
```go
// main.go:44-45 - REMOVE DEFAULTS
SecretKey:        getEnv("JWT_SECRET", ""), // No default!
RefreshSecretKey: getEnv("JWT_REFRESH_SECRET", ""), // No default!
```

### 2. WebSocket CORS (CVSS 8.6)
```go
// websocket.go:20-26 - IMPLEMENT VALIDATION
CheckOrigin: func(r *http.Request) bool {
    origin := r.Header.Get("Origin")
    allowed := []string{"https://harmonyflow.io", "https://app.harmonyflow.io"}
    return contains(allowed, origin)
},
```

### 3. Admin Auth Bypass (CVSS 10.0)
```go
// admin.go:210-214 - IMPLEMENT CHECKS
func (h *AdminHandler) RequireAdmin() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        claims, err := validateToken(token)
        if err != nil || !contains(claims.Roles, "admin") {
            c.AbortWithStatus(403)
            return
        }
        c.Next()
    }
}
```

---

## Security Checklist

### Environment Variables (REQUIRED)
```bash
JWT_SECRET=<32+ byte random string>
JWT_REFRESH_SECRET=<32+ byte random string>
REDIS_PASSWORD=<strong password>
ALLOWED_ORIGINS=https://harmonyflow.io,https://app.harmonyflow.io
RATE_LIMIT_ENABLED=true
```

### Before Production
- [ ] JWT secrets from environment (no defaults)
- [ ] WebSocket origin validation strict
- [ ] Admin endpoints require auth + admin role
- [ ] Rate limiting enabled (100 req/min default)
- [ ] CSRF tokens on state-changing operations
- [ ] Data encryption at rest for PII
- [ ] Security headers configured
- [ ] TLS 1.3 only
- [ ] Logs don't contain secrets/PII

---

## Emergency Commands

### Revoke All Tokens
```bash
# Rotate JWT secret (invalidates all tokens)
kubectl set env deployment/session-state-service JWT_SECRET=$(openssl rand -base64 32)

# Or blacklist specific tokens
redis-cli SADD "token:blacklist" "[TOKEN_ID]"
```

### Block IP Address
```bash
iptables -A INPUT -s [MALICIOUS_IP] -j DROP
# Or via CDN/WAF
```

### Emergency Rate Limiting
```bash
# Immediate protection
iptables -A INPUT -p tcp --dport 443 -m limit --limit 50/minute --limit-burst 100 -j ACCEPT
```

---

## Log Locations

```
Application Logs: /var/log/syncbridge/
Access Logs: /var/log/nginx/access.log
Error Logs: /var/log/syncbridge/error.log
Audit Logs: /var/log/syncbridge/audit.log
```

---

## Key Metrics to Monitor

| Metric | Warning | Critical |
|--------|---------|----------|
| Failed auth rate | > 5/min | > 20/min |
| WebSocket conn rate | > 100/min | > 500/min |
| Response time | > 500ms | > 2s |
| Error rate | > 1% | > 5% |

---

## Security Contacts

- **Security Team:** security@harmonyflow.io
- **Incident Response:** incident@harmonyflow.io
- **On-Call:** oncall@harmonyflow.io

---

**Version:** 1.0 | **Last Updated:** February 11, 2026
