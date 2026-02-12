# HarmonyFlow SyncBridge - Security Test Plan (Week 5)

**Version:** 1.0  
**Date:** February 11, 2026  
**Owner:** Security Team  
**Classification:** INTERNAL USE ONLY  
**Sprint:** Week 5 - Penetration Testing

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Test Scope](#test-scope)
3. [Test Methodology](#test-methodology)
4. [Test Cases](#test-cases)
5. [Tools and Resources](#tools-and-resources)
6. [Timeline and Schedule](#timeline-and-schedule)
7. [Reporting](#reporting)
8. [Acceptance Criteria](#acceptance-criteria)
9. [Risk and Mitigation](#risk-and-mitigation)
10. [Appendices](#appendices)

---

## Executive Summary

This document outlines the comprehensive security test plan for Week 5 penetration testing of the HarmonyFlow SyncBridge platform. The goal is to validate the security posture of the system and verify that Week 4 security hardening measures have been properly implemented.

### Objectives

1. Validate authentication and authorization controls
2. Test WebSocket security implementation
3. Verify input validation and sanitization
4. Assess data protection mechanisms
5. Evaluate rate limiting and DoS protection
6. Review admin endpoint security
7. Test CSRF protection
8. Validate secure configuration

### Success Criteria

- No Critical or High vulnerabilities in production
- All Week 4 security items remediated and verified
- Security controls working as designed
- Documentation updated with findings

---

## Test Scope

### In Scope

#### Components

| Component | Version | Test Focus |
|-----------|---------|------------|
| Session State Service | 1.1.0 | Authentication, Authorization, APIs |
| Client State Manager | Latest | Token management, Input handling |
| WebSocket Handler | 1.1.0 | Real-time comms security |
| Redis Backend | 7.x | Data storage security |

#### Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Staging | https://staging-api.harmonyflow.io | Primary test target |
| Production | https://api.harmonyflow.io | Limited testing only |
| Local Dev | http://localhost:8080 | Tool development |

#### Test Types

1. **Black Box Testing** - No prior knowledge
2. **Gray Box Testing** - Limited credentials and documentation
3. **White Box Testing** - Full source code access
4. **Dynamic Testing** - Runtime vulnerability detection
5. **Configuration Review** - Security configuration assessment

### Out of Scope

- Infrastructure penetration testing (AWS/GCP)
- Physical security testing
- Social engineering attacks
- Denial of Service attacks that degrade service
- Third-party dependencies (unless zero-day)

### Testing Constraints

1. **No Production Data:** Use only test accounts and data
2. **No Service Disruption:** Stop if testing affects service availability
3. **Business Hours:** Coordinate with team for production testing
4. **Rate Limits:** Respect rate limiting to avoid blocks

---

## Test Methodology

### Approach

We will follow the OWASP Testing Guide methodology:

1. **Information Gathering** (Day 1)
2. **Configuration and Deployment Management** (Day 1)
3. **Identity Management** (Day 2)
4. **Authentication** (Day 2)
5. **Authorization** (Day 3)
6. **Session Management** (Day 3)
7. **Input Validation** (Day 4)
8. **Error Handling** (Day 4)
9. **Cryptography** (Day 4)
10. **Business Logic** (Day 5)
11. **Client-Side** (Day 5)
12. **API Testing** (Day 5)

### Testing Standards

- **OWASP Top 10 2021**
- **OWASP Testing Guide v4.2**
- **OWASP ASVS 4.0**
- **CWE/SANS Top 25**
- **NIST Cybersecurity Framework**

### Severity Ratings

| Severity | CVSS 3.1 | Description |
|----------|----------|-------------|
| Critical | 9.0-10.0 | Immediate exploitation, system compromise |
| High | 7.0-8.9 | Significant impact, likely exploitation |
| Medium | 4.0-6.9 | Moderate impact, harder to exploit |
| Low | 0.1-3.9 | Minor issue, unlikely exploitation |
| Informational | 0.0 | Best practice recommendation |

---

## Test Cases

### TC-AUTH-001: JWT Token Security

**Objective:** Validate JWT implementation security

**Preconditions:**
- Valid user account created
- JWT token obtained

**Test Steps:**

1. **Token Structure Analysis**
   ```bash
   # Decode JWT header and payload
   jwt decode [TOKEN]
   
   # Verify algorithm is HS256
   # Check for sensitive data in claims
   ```

2. **Algorithm Confusion Attack**
   ```bash
   # Change algorithm to "none"
   # Change algorithm to "RS256" with public key
   # Attempt to forge token
   ```

3. **Secret Strength Test**
   ```bash
   # Attempt to crack JWT secret
   # Use weak secrets from assessment report
   hashcat -m 16500 jwt.txt wordlist.txt
   ```

4. **Token Expiry Bypass**
   ```bash
   # Modify exp claim to future date
   # Replay expired token
   # Test clock skew handling
   ```

**Expected Results:**
- Algorithm cannot be changed
- Weak secrets rejected
- Expired tokens rejected
- Clock skew handled (±5 minutes)

**Pass Criteria:** No token forgery possible

---

### TC-AUTH-002: Token Refresh Security

**Objective:** Test token refresh mechanism

**Test Steps:**

1. **Refresh Token Rotation**
   - Use refresh token
   - Verify old refresh token invalidated
   - Attempt reuse of old refresh token

2. **Refresh Token Theft Detection**
   - Use refresh token from different IP
   - Use refresh token after detection
   - Verify token family invalidation

3. **Refresh Token Expiry**
   - Wait for refresh expiry
   - Attempt refresh with expired token
   - Verify rejection

**Expected Results:**
- Refresh tokens single-use
- Reuse detection active
- Expiry enforced

**Pass Criteria:** No refresh token replay possible

---

### TC-AUTH-003: Session Management

**Objective:** Validate session security

**Test Steps:**

1. **Session Fixation**
   - Access site without authentication
   - Note session identifier
   - Authenticate
   - Verify session ID changed

2. **Concurrent Sessions**
   - Login from Device A
   - Login from Device B
   - Verify both sessions valid or proper handling

3. **Session Timeout**
   - Login and wait for timeout
   - Attempt action after timeout
   - Verify re-authentication required

4. **Session Termination**
   - Login
   - Logout
   - Attempt to use old token
   - Verify rejection

**Expected Results:**
- Session fixation protected
- Concurrent sessions handled
- Timeout enforced
- Logout invalidates session

**Pass Criteria:** Secure session lifecycle

---

### TC-AUTH-004: Rate Limiting

**Objective:** Verify rate limiting protection

**Test Steps:**

1. **Authentication Rate Limiting**
   ```bash
   # Attempt 100 rapid logins
   for i in {1..100}; do
     curl -X POST https://api.harmonyflow.io/auth/login \
       -d '{"username":"test","password":"wrong"}'
   done
   
   # Verify account/IP blocked after threshold
   ```

2. **API Rate Limiting**
   ```bash
   # Test rate limits on various endpoints
   # Verify 429 responses
   # Check rate limit headers
   ```

3. **WebSocket Rate Limiting**
   ```bash
   # Send 1000 messages/minute
   # Verify connection throttled or closed
   ```

4. **Bypass Attempts**
   - Rotate IPs (if possible)
   - Change User-Agent
   - Add random delays
   - Use multiple accounts

**Expected Results:**
- Rate limits enforced
- 429 responses returned
- Headers indicate limits
- No effective bypass

**Pass Criteria:** DoS protection working

---

### TC-WS-001: WebSocket Origin Validation

**Objective:** Test CORS and origin validation

**Test Steps:**

1. **Origin Header Validation**
   ```javascript
   // Connect from unauthorized origin
   const ws = new WebSocket('wss://ws.harmonyflow.io', [], {
     origin: 'https://evil.com'
   });
   
   // Verify connection rejected
   ```

2. **Missing Origin Header**
   ```bash
   # Connect without Origin header
   wscat -c wss://ws.harmonyflow.io \
     -H "Origin: "
   
   # Verify behavior
   ```

3. **Subdomain Testing**
   - Test *.harmonyflow.io
   - Test subdomain variations
   - Verify strict matching

4. **Null Origin**
   ```javascript
   // Test null origin (e.g., from sandboxed iframe)
   // Verify rejection
   ```

**Expected Results:**
- Unauthorized origins rejected
- Missing origin handled securely
- Subdomain validation strict
- Null origin rejected

**Pass Criteria:** No cross-origin WebSocket hijacking

---

### TC-WS-002: WebSocket Authentication

**Objective:** Validate WebSocket authentication

**Test Steps:**

1. **Unauthenticated Access**
   ```javascript
   // Connect without auth
   // Attempt to send state updates
   // Verify rejection
   ```

2. **Token in Messages**
   ```javascript
   // Send expired token
   // Send malformed token
   // Send token for different user
   ```

3. **Auth Message Validation**
   - Send auth without token
   - Send auth with valid token
   - Verify session established
   - Test token expiry during session

4. **Message-Level Auth**
   - Authenticate
   - Intercept and modify another user's message
   - Verify authorization checks

**Expected Results:**
- Unauthenticated requests rejected
- Token validation enforced
- Authorization checks on each action
- Token expiry handled gracefully

**Pass Criteria:** Strong WebSocket authentication

---

### TC-WS-003: WebSocket Message Security

**Objective:** Test message handling security

**Test Steps:**

1. **Message Size Limits**
   ```javascript
   // Send 1MB message
   const largeMsg = 'x'.repeat(1024 * 1024);
   ws.send(JSON.stringify({type: 'update', data: largeMsg}));
   
   // Verify rejection or truncation
   ```

2. **Message Type Validation**
   - Send unknown message type
   - Send invalid JSON
   - Send binary data (if applicable)

3. **Injection Attacks**
   ```javascript
   // Test for command injection in messages
   const payload = {
     type: 'update',
     data: '; cat /etc/passwd;'
   };
   ```

4. **Message Flooding**
   - Send 1000 messages/second
   - Verify rate limiting
   - Check connection stability

**Expected Results:**
- Large messages rejected
- Invalid types handled
- No injection possible
- Flooding prevented

**Pass Criteria:** Robust message handling

---

### TC-API-001: REST API Security

**Objective:** Test HTTP endpoint security

**Test Steps:**

1. **Authentication Bypass**
   - Access protected endpoints without auth
   - Test with invalid tokens
   - Test with expired tokens
   - Test parameter pollution

2. **Authorization Bypass**
   - Access other user's data
   - Modify other user's sessions
   - Test IDOR vulnerabilities
   - Test path traversal in IDs

3. **HTTP Method Testing**
   - Test GET vs POST confusion
   - Try PUT/DELETE where not allowed
   - Test method override headers

4. **Content-Type Testing**
   - Send JSON to XML endpoints
   - Test content-type bypass
   - Verify proper parsing

**Expected Results:**
- Auth required for protected endpoints
- Authorization enforced
- HTTP methods validated
- Content types enforced

**Pass Criteria:** Secure API implementation

---

### TC-API-002: Input Validation

**Objective:** Test input sanitization

**Test Steps:**

1. **SQL Injection**
   ```bash
   # Test session ID parameter
   curl "https://api.harmonyflow.io/session/' OR '1'='1"
   
   # Test in JSON body
   curl -X POST https://api.harmonyflow.io/session/snapshot \
     -d '{"session_id": "test\u0027 OR \u00271\u0027=\u00271"}'
   ```

2. **NoSQL Injection**
   ```bash
   # Test MongoDB/Redis injection
   curl -X POST https://api.harmonyflow.io/session/snapshot \
     -d '{"user_id": {"$ne": null}}'
   ```

3. **XSS Testing**
   ```bash
   # Test stored XSS via state data
   curl -X POST https://api.harmonyflow.io/session/snapshot \
     -d '{"state_data": {"xss": "\u003cscript>alert(1)\u003c/script>"}}'
   ```

4. **Command Injection**
   ```bash
   # Test where user input might reach shell
   ```

5. **Path Traversal**
   ```bash
   # Test file path parameters
   curl "https://api.harmonyflow.io/session/../../../etc/passwd"
   ```

**Expected Results:**
- No SQL/NoSQL injection possible
- XSS sanitized or encoded
- No command execution
- Path traversal blocked

**Pass Criteria:** All injection attacks prevented

---

### TC-API-003: CSRF Protection

**Objective:** Test CSRF defenses

**Test Steps:**

1. **State-Changing Without Token**
   ```html
   <!-- Create malicious page -->
   <form action="https://api.harmonyflow.io/session/snapshot" method="POST">
     <input name="session_id" value="hacked" />
     <script>document.forms[0].submit()</script>
   </form>
   ```

2. **CSRF Token Validation**
   - Test without CSRF token
   - Test with invalid CSRF token
   - Test with expired CSRF token
   - Test token reuse

3. **SameSite Cookie Testing**
   - Verify SameSite=Strict on session cookies
   - Test cross-origin POST requests
   - Verify rejection

4. **Double Submit Cookie**
   - Test cookie pattern
   - Verify token-cookie correlation

**Expected Results:**
- CSRF tokens required
- Tokens validated properly
- SameSite cookies enforced
- Double submit working

**Pass Criteria:** CSRF attacks prevented

---

### TC-ADMIN-001: Admin Endpoint Security

**Objective:** Validate admin access controls

**Test Steps:**

1. **Unauthenticated Access**
   ```bash
   # Access admin endpoints without auth
   curl https://api.harmonyflow.io/admin/metrics/all
   
   # Verify 401/403 response
   ```

2. **Non-Admin Access**
   ```bash
   # Login as regular user
   # Attempt admin actions
   # Verify rejection
   ```

3. **Admin Privilege Escalation**
   - Modify JWT to add admin role
   - Attempt admin operations
   - Verify signature validation

4. **Admin Functionality**
   - Test broadcast functionality
   - Test session deletion
   - Test metrics access
   - Verify proper authorization

**Expected Results:**
- Admin endpoints require authentication
- Admin role verified
- No privilege escalation possible
- Admin actions logged

**Pass Criteria:** Secure admin access

---

### TC-CRYPTO-001: Cryptographic Implementation

**Objective:** Test cryptography usage

**Test Steps:**

1. **TLS Configuration**
   ```bash
   # Test SSL/TLS configuration
   nmap --script ssl-enum-ciphers -p 443 api.harmonyflow.io
   
   # Check certificate
   openssl s_client -connect api.harmonyflow.io:443
   ```

2. **Certificate Validation**
   - Verify valid certificate chain
   - Check expiration dates
   - Test for weak ciphers
   - Verify HSTS headers

3. **Data Encryption**
   - Verify data encrypted in Redis
   - Test field-level encryption
   - Verify key rotation

4. **Randomness**
   - Check token generation
   - Verify cryptographically secure RNG
   - Test session ID randomness

**Expected Results:**
- TLS 1.2+ only
- Strong cipher suites
- Valid certificates
- Proper encryption

**Pass Criteria:** Strong cryptography

---

### TC-DATA-001: Data Protection

**Objective:** Test data handling security

**Test Steps:**

1. **Sensitive Data in Logs**
   ```bash
   # Review application logs
   grep -i "password\|secret\|token" /var/log/syncbridge/*.log
   
   # Verify no sensitive data logged
   ```

2. **PII Handling**
   - Check JWT claims for PII
   - Review stored data
   - Verify encryption of sensitive fields

3. **Data Retention**
   - Verify TTL on Redis keys
   - Test automatic expiration
   - Check backup retention

4. **Data Exposure**
   - Test error messages
   - Verify no stack traces in production
   - Check for information leakage

**Expected Results:**
- No secrets in logs
- PII protected
- Data expires properly
- Minimal error information

**Pass Criteria:** Secure data handling

---

### TC-CLIENT-001: Client-Side Security

**Objective:** Test client library security

**Test Steps:**

1. **Token Storage**
   ```javascript
   // Check localStorage for tokens
   console.log(localStorage.getItem('harmonyflow_auth_token'));
   
   // Verify secure storage
   ```

2. **XSS Protection**
   - Test for DOM-based XSS
   - Verify output encoding
   - Check innerHTML usage

3. **Dependency Scanning**
   ```bash
   npm audit
   yarn audit
   # Review findings
   ```

4. **Build Security**
   - Check for source maps in production
   - Verify minification
   - Review webpack config

**Expected Results:**
- Tokens stored securely
- No XSS vulnerabilities
- No vulnerable dependencies
- Production build secure

**Pass Criteria:** Secure client implementation

---

## Tools and Resources

### Testing Tools

| Tool | Purpose | Version |
|------|---------|---------|
| Burp Suite Professional | Web/HTTP testing | Latest |
| OWASP ZAP | Automated scanning | Latest |
| Postman | API testing | Latest |
| wscat | WebSocket testing | Latest |
| jwt_tool | JWT testing | Latest |
| SQLMap | SQL injection testing | Latest |
| Nmap | Network scanning | Latest |
| OpenSSL | Crypto testing | Latest |
| Metasploit | Exploit testing | Latest |
| Nikto | Web server scanning | Latest |

### Scripts

```bash
# automation/run_tests.sh
#!/bin/bash
# Main test execution script

# Setup
source .env
API_URL=${API_URL:-"https://staging-api.harmonyflow.io"}
WS_URL=${WS_URL:-"wss://staging-ws.harmonyflow.io"}

# Run test suites
echo "Starting security test suite..."

# Authentication tests
./tests/auth_tests.sh

# WebSocket tests
./tests/websocket_tests.sh

# API tests
./tests/api_tests.sh

# Generate report
./scripts/generate_report.sh

echo "Testing complete. See reports/ directory."
```

### Test Accounts

| Account Type | Username | Permissions | Notes |
|--------------|----------|-------------|-------|
| Standard User | test_user_1@harmonyflow.io | User | For auth testing |
| Admin User | admin_test@harmonyflow.io | Admin | For admin testing |
| Service Account | svc_test | Service | For internal testing |

---

## Timeline and Schedule

### Week 5 Schedule

| Day | Focus Areas | Deliverable |
|-----|-------------|-------------|
| Monday | Information gathering, config review | Environment assessment |
| Tuesday | Authentication, Authorization | Auth test results |
| Wednesday | Session management, WebSocket | Session/WS results |
| Thursday | Input validation, API security | Validation results |
| Friday | Business logic, reporting | Final report |

### Daily Schedule

**09:00** - Team standup and test planning  
**09:30** - Test execution  
**12:00** - Lunch break  
**13:00** - Test execution (continued)  
**16:00** - Findings review  
**17:00** - Daily report submission  

### Milestones

- **Day 1:** Environment ready, tools configured
- **Day 2:** Authentication tests complete
- **Day 3:** All major tests complete
- **Day 4:** Verification and retests complete
- **Day 5:** Final report delivered

---

## Reporting

### Daily Reports

**Template:**

```markdown
## Security Test Daily Report - Day [N]

**Date:** [Date]
**Tester:** [Name]
**Tests Completed:** [List]
**Tests Remaining:** [List]

### Findings Summary
- Critical: [N]
- High: [N]
- Medium: [N]
- Low: [N]

### New Findings
| ID | Severity | Title | Status |
|----|----------|-------|--------|
| [ID] | [Sev] | [Title] | [New/Confirmed] |

### Blockers
- [List any blockers]

### Notes
[Any important observations]
```

### Final Report Structure

1. **Executive Summary**
   - Overall risk rating
   - Key findings summary
   - Recommendations priority

2. **Methodology**
   - Testing approach
   - Tools used
   - Test coverage

3. **Findings**
   - Detailed vulnerability descriptions
   - Proof of concept
   - Risk ratings
   - Remediation guidance

4. **Appendices**
   - Test cases executed
   - Raw output/logs
   - References

### Reporting Tools

- Dradis (collaboration)
- DefectDojo (tracking)
- Custom report templates

---

## Acceptance Criteria

### Pass Criteria

1. **No Critical Vulnerabilities**
   - CVSS 9.0+ must be remediated immediately

2. **No Unremediated High Vulnerabilities**
   - CVSS 7.0-8.9 must have remediation plan

3. **Week 4 Items Complete**
   - All critical and high items from Week 4 remediated

4. **Security Controls Working**
   - Rate limiting effective
   - Authentication secure
   - Authorization enforced

5. **Documentation Updated**
   - Security runbook current
   - Incident procedures updated
   - VDP published

### Conditional Pass Criteria

If medium/low vulnerabilities exist:
- Documented in risk register
- Remediation timeline established
- Temporary mitigations in place

### Failure Criteria

Testing fails if:
- Any critical vulnerability unremediated
- Week 4 critical items incomplete
- No remediation plan for high vulnerabilities
- Repeated vulnerabilities from Week 4

---

## Risk and Mitigation

### Testing Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Service disruption | High | Low | Test in staging; monitor closely |
| Data corruption | Medium | Low | Use test data only; backups ready |
| False positives | Low | Medium | Manual verification required |
| Scope creep | Medium | Medium | Strict adherence to test plan |
| Tool failures | Low | Low | Multiple tools for redundancy |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Launch delay | High | Start testing early; parallel remediation |
| Vulnerability disclosure | Medium | Coordinated disclosure process |
| Reputational damage | Medium | Professional remediation response |

### Escalation Procedures

1. **Service Disruption**
   - Immediately: Stop testing
   - Within 15 min: Notify team lead
   - Within 30 min: Escalate to CTO

2. **Critical Finding**
   - Immediately: Document finding
   - Within 1 hour: Report to security team
   - Within 4 hours: Emergency remediation

3. **Scope Questions**
   - Discuss with test lead
   - Document decision
   - Proceed with caution

---

## Appendices

### Appendix A: Test Environment Details

**Staging Environment:**
- URL: https://staging-api.harmonyflow.io
- WebSocket: wss://staging-ws.harmonyflow.io
- Redis: staging-redis.harmonyflow.io:6379

**Test Credentials:**
```
[Stored in secure vault]
```

### Appendix B: API Documentation

- OpenAPI Spec: https://staging-api.harmonyflow.io/docs
- WebSocket Protocol: /docs/protocol.md

### Appendix C: OWASP Testing Checklist

**Authentication:**
- [ ] Test for credentials transport (OTG-AUTHN-001)
- [ ] Test for default credentials (OTG-AUTHN-002)
- [ ] Test for weak lockout mechanism (OTG-AUTHN-003)
- [ ] Test for bypassing auth schema (OTG-AUTHN-004)
- [ ] Test for vulnerable remember password (OTG-AUTHN-005)
- [ ] Test for browser cache weakness (OTG-AUTHN-006)
- [ ] Test for weak password policy (OTG-AUTHN-007)
- [ ] Test for weak security question (OTG-AUTHN-008)
- [ ] Test for weak password change (OTG-AUTHN-009)
- [ ] Test for weak auth in alternative channel (OTG-AUTHN-010)

**Session Management:**
- [ ] Test for session management schema (OTG-SESS-001)
- [ ] Test for cookie attributes (OTG-SESS-002)
- [ ] Test for session fixation (OTG-SESS-003)
- [ ] Test for exposed session variables (OTG-SESS-004)
- [ ] Test for CSRF (OTG-SESS-005)
- [ ] Test for logout functionality (OTG-SESS-006)
- [ ] Test for session timeout (OTG-SESS-007)
- [ ] Test for session puzzling (OTG-SESS-008)

**Input Validation:**
- [ ] Test for Reflected XSS (OTG-INPVAL-001)
- [ ] Test for Stored XSS (OTG-INPVAL-002)
- [ ] Test for HTTP Verb Tampering (OTG-INPVAL-003)
- [ ] Test for HTTP Parameter Pollution (OTG-INPVAL-004)
- [ ] Test for SQL Injection (OTG-INPVAL-005)
- [ ] Test for LDAP Injection (OTG-INPVAL-006)
- [ ] Test for ORM Injection (OTG-INPVAL-007)
- [ ] Test for XML Injection (OTG-INPVAL-008)
- [ ] Test for SSI Injection (OTG-INPVAL-009)
- [ ] Test for XPath Injection (OTG-INPVAL-010)
- [ ] Test for IMAP/SMTP Injection (OTG-INPVAL-011)
- [ ] Test for Code Injection (OTG-INPVAL-012)
- [ ] Test for Command Injection (OTG-INPVAL-013)
- [ ] Test for Buffer Overflow (OTG-INPVAL-014)
- [ ] Test for Incubated Vulnerability (OTG-INPVAL-015)
- [ ] Test for HTTP Splitting/Smuggling (OTG-INPVAL-016)

### Appendix D: Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | [Name] | [Phone] | security@harmonyflow.io |
| DevOps Lead | [Name] | [Phone] | devops@harmonyflow.io |
| Test Lead | [Name] | [Phone] | [Email] |

---

**Document Owner:** Security Team  
**Review Date:** 2026-02-18 (Post-Week 5)  
**Classification:** INTERNAL USE ONLY
