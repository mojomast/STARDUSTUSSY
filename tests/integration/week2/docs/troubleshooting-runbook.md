# Troubleshooting Runbook

## HarmonyFlow SyncBridge - Week 2 Integration

---

## Quick Diagnostics

### Service Health Check

```bash
#!/bin/bash
# Check all services are running

echo "Checking Session State Service..."
curl -s http://localhost:8080/health | jq .

echo "Checking Redis..."
redis-cli ping

echo "Checking WebSocket..."
websocat ws://localhost:8080/ws -v
```

### Common Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| 400 | Bad Request | Check message format |
| 401 | Unauthorized | Re-authenticate with valid token |
| 403 | Forbidden | Authentication required |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Wait and retry |
| 500 | Server Error | Check service logs |

---

## Connection Issues

### Problem: Cannot Connect to WebSocket

**Symptoms:**
- `Error: connect ECONNREFUSED`
- Connection timeout
- `WebSocket is not connected` errors

**Diagnosis:**
```bash
# 1. Check if service is listening
netstat -tlnp | grep 8080
lsof -i :8080

# 2. Check service health
curl http://localhost:8080/health

# 3. Test WebSocket directly
websocat ws://localhost:8080/ws
```

**Resolution:**
1. Start the Go service:
   ```bash
   cd services/session-state-service
   go run cmd/main.go
   ```

2. Check for port conflicts:
   ```bash
   kill $(lsof -t -i:8080)
   ```

3. Verify environment variables:
   ```bash
   echo $SERVER_ADDR  # Should be :8080
   ```

---

### Problem: Connection Drops Frequently

**Symptoms:**
- WebSocket closes unexpectedly
- `ECONNRESET` errors
- Connection timeout after inactivity

**Diagnosis:**
```bash
# Check server logs for errors
tail -f /var/log/harmonyflow/session-state-service.log

# Monitor connection count
curl http://localhost:8080/health | jq '.active_connections'
```

**Resolution:**
1. **Heartbeat not configured:**
   - Ensure client sends heartbeat every 30 seconds
   - Server expects pong response within 60 seconds

2. **Proxy/LB timeout:**
   - If behind nginx/ALB, increase timeout:
   ```nginx
   proxy_read_timeout 120s;
   proxy_send_timeout 120s;
   ```

3. **Check goroutine leaks:**
   ```bash
   curl http://localhost:8080/debug/pprof/goroutine?debug=1
   ```

---

## Authentication Issues

### Problem: Authentication Fails

**Symptoms:**
- `AuthFailure` message received
- `401 Unauthorized` error
- Token rejected

**Diagnosis:**
```bash
# Test JWT validation
jwt decode eyJhbGciOiJIUzI1NiIs...

# Check token expiration
node -e "console.log(new Date(1707657600 * 1000))"

# Verify JWT secret
echo $JWT_SECRET
```

**Resolution:**
1. **Token expired:**
   - Generate new token with valid expiration
   - Use refresh token flow if available

2. **Wrong secret:**
   ```bash
   # Service and tests must use same secret
   export JWT_SECRET="harmony-flow-secret-key"
   ```

3. **Token format:**
   ```javascript
   // Ensure token has required claims
   {
     "user_id": "...",
     "device_id": "...",
     "session_id": "...",
     "exp": 1707657600
   }
   ```

---

### Problem: Session Not Found

**Symptoms:**
- Snapshot returns empty state
- `SESSION_NOT_FOUND` error

**Diagnosis:**
```bash
# Check Redis for session data
redis-cli KEYS "session:*"
redis-cli HGETALL "session:<session_id>"
```

**Resolution:**
1. **Session expired:**
   - Default TTL is 7 days
   - Create new session if expired

2. **Wrong session ID:**
   - Verify session_id in JWT matches request

3. **Redis connection:**
   ```bash
   redis-cli ping  # Should return PONG
   ```

---

## State Synchronization Issues

### Problem: State Updates Not Persisting

**Symptoms:**
- State changes lost after reconnection
- Snapshot returns stale data
- Updates not broadcasted

**Diagnosis:**
```bash
# Enable debug logging
export LOG_LEVEL=debug
go run cmd/main.go

# Check Redis for updates
redis-cli MONITOR
```

**Resolution:**
1. **Redis not connected:**
   ```bash
   # Check Redis connection
   telnet localhost 6379
   ```

2. **Authentication missing:**
   - State updates require authentication
   - Check `IsAuthenticated` flag in connection

3. **Race condition:**
   - Add delays between updates for testing
   - Use proper async/await

---

### Problem: State Update Broadcasting Fails

**Symptoms:**
- Other clients don't receive updates
- Only sender sees changes

**Diagnosis:**
```bash
# Check WebSocket manager
# (Add logging in protocol/manager.go)

# Verify user connections
curl http://localhost:8080/metrics | grep active_connections
```

**Resolution:**
1. **Same session required:**
   - All clients must use same session_id in token

2. **Broadcast channel full:**
   - Check for blocking sends
   - Increase channel buffer if needed

3. **User ID mismatch:**
   - Verify all clients have same user_id in token

---

## Performance Issues

### Problem: High Latency

**Symptoms:**
- Slow response times
- Test timeouts
- Degraded user experience

**Diagnosis:**
```bash
# Profile the service
curl http://localhost:8080/debug/pprof/profile > cpu.prof
go tool pprof cpu.prof

# Check Redis latency
redis-cli --latency

# Monitor system resources
htop
iostat -x 1
```

**Resolution:**
1. **Redis slow:**
   - Check network latency to Redis
   - Consider Redis Cluster for high load

2. **CPU bound:**
   - Profile and optimize hot paths
   - Check for busy loops

3. **Memory pressure:**
   - Monitor Redis memory usage
   - Adjust snapshot TTL if needed

---

### Problem: Too Many Connections

**Symptoms:**
- `EMFILE` errors
- Connection refused
- Service unresponsive

**Diagnosis:**
```bash
# Check connection count
ss -s
curl http://localhost:8080/health | jq '.active_connections'

# Check file descriptors
ulimit -n
cat /proc/sys/fs/file-max
```

**Resolution:**
1. **Increase limits:**
   ```bash
   ulimit -n 65535
   ```

2. **Connection leaks:**
   - Ensure clients disconnect properly
   - Check for lingering goroutines

3. **Connection pooling:**
   - Use connection reuse
   - Implement proper cleanup

---

## Message Serialization Issues

### Problem: Invalid Message Format

**Symptoms:**
- `InvalidMessage` errors
- JSON parse failures
- Malformed payload errors

**Diagnosis:**
```bash
# Log raw messages
# (Add logging in websocket handler)

# Test message format
node -e "console.log(JSON.stringify({type:1,timestamp:Date.now()/1000,payload:{}}))"
```

**Resolution:**
1. **Check message structure:**
   ```json
   {
     "type": 1,
     "timestamp": 1707657600,
     "payload": {}
   }
   ```

2. **Numeric message types:**
   - Use integers, not strings
   - Reference MessageType enum

3. **Timestamp format:**
   - Must be Unix timestamp (seconds)
   - Not ISO8601 string

---

### Problem: Large Messages Fail

**Symptoms:**
- Connection closed on large state update
- `message too large` error

**Resolution:**
1. **Check message size:**
   - Default limit: 512KB
   - Compress large payloads if needed

2. **Chunk large updates:**
   - Split into smaller updates
   - Use pagination for large data

---

## Redis Issues

### Problem: Redis Connection Failed

**Symptoms:**
- `connection refused` errors
- Snapshot operations fail
- State not persisted

**Diagnosis:**
```bash
# Check Redis status
redis-cli ping
redis-cli INFO | grep connected_clients

# Check network
netstat -tlnp | grep 6379
telnet localhost 6379
```

**Resolution:**
1. **Start Redis:**
   ```bash
   redis-server --daemonize yes
   # or
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **Check configuration:**
   ```bash
   export REDIS_ADDR="localhost:6379"
   export REDIS_PASSWORD=""
   ```

3. **Test connection:**
   ```bash
   redis-cli SET test_key test_value
   redis-cli GET test_key
   ```

---

### Problem: Redis Memory Full

**Symptoms:**
- `OOM command not allowed` errors
- Write operations fail

**Diagnosis:**
```bash
redis-cli INFO memory | grep used_memory
redis-cli INFO stats | grep evicted_keys
```

**Resolution:**
1. **Increase memory limit:**
   ```bash
   redis-cli CONFIG SET maxmemory 2gb
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

2. **Reduce snapshot TTL:**
   - Default: 7 days
   - Reduce in production if needed

3. **Clean up old data:**
   ```bash
   redis-cli --scan --pattern "session:*" | xargs redis-cli DEL
   ```

---

## Integration Test Failures

### Problem: Tests Timeout

**Symptoms:**
- Jest timeouts
- `Exceeded timeout of 30000ms`

**Resolution:**
1. **Increase test timeout:**
   ```bash
   npm test -- --testTimeout=60000
   ```

2. **Check service availability:**
   ```bash
   curl http://localhost:8080/health
   ```

3. **Reduce concurrent tests:**
   ```bash
   npm test -- --maxWorkers=1
   ```

---

### Problem: Tests Fail Intermittently

**Symptoms:**
- Flaky tests
- Race conditions
- Timing-dependent failures

**Resolution:**
1. **Add delays:**
   ```typescript
   await wait(100);  // Allow server to process
   ```

2. **Use proper synchronization:**
   ```typescript
   await client.waitForMessage(MessageType.SnapshotResponse, 5000);
   ```

3. **Check for resource leaks:**
   - Ensure all connections closed in `afterEach`
   - Use unique IDs for each test

---

## Getting Help

### Collect Debug Information

```bash
# Service version
curl http://localhost:8080/health

# Service logs
journalctl -u harmonyflow-session -n 100

# System info
uname -a
go version
node --version
redis-server --version

# Test output
npm test 2>&1 | tee test-output.log
```

### Reporting Issues

Include in bug report:
1. Service version
2. Error message
3. Steps to reproduce
4. Debug logs
5. Environment details

### Contact

- Slack: #harmonyflow-dev
- Email: dev@harmonyflow.io
- On-call: pagerduty rotation

---

## Emergency Procedures

### Service Down

1. **Check health:**
   ```bash
   curl http://localhost:8080/health
   ```

2. **Restart service:**
   ```bash
   systemctl restart harmonyflow-session
   # or
   docker-compose restart
   ```

3. **Check Redis:**
   ```bash
   redis-cli ping
   ```

4. **Verify connections:**
   ```bash
   ss -tlnp | grep 8080
   ```

### Data Loss

1. **Check Redis backups:**
   ```bash
   ls -la /var/lib/redis/backup/
   ```

2. **Restore from backup:**
   ```bash
   redis-cli --rdb backup.rdb
   ```

3. **Contact on-call:**
   - Page on-call engineer
   - Begin incident response

---

## Appendix

### Useful Commands

```bash
# Monitor all WebSocket traffic
websocat -v ws://localhost:8080/ws

# Send test message
echo '{"type":1,"timestamp":1707657600,"payload":{}}' | websocat ws://localhost:8080/ws

# Watch Redis operations
redis-cli MONITOR

# Profile Go service
go tool pprof http://localhost:8080/debug/pprof/profile
```

### Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_ADDR` | `:8080` | HTTP server bind address |
| `REDIS_ADDR` | `localhost:6379` | Redis connection string |
| `JWT_SECRET` | - | JWT signing secret |
| `LOG_LEVEL` | `info` | Logging verbosity |
