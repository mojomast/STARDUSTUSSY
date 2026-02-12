# Troubleshooting Guide

## Common Issues and Solutions

### Test Execution Issues

#### Issue: Tests timing out
**Symptoms:** Tests fail with timeout errors

**Solutions:**
1. Increase timeout in `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 30000,
  navigationTimeout: 30000,
}
```

2. Check staging environment performance
3. Reduce parallel workers: `workers: 1`
4. Check network connectivity to staging

#### Issue: Browser launch fails
**Symptoms:** Error launching browser instances

**Solutions:**
1. Install Playwright browsers:
```bash
npx playwright install
```

2. Install system dependencies:
```bash
npx playwright install-deps
```

3. Check available memory (needs 2GB+ free)

#### Issue: Mobile emulation not working
**Symptoms:** Tests run as desktop instead of mobile

**Solutions:**
1. Verify device profile:
```typescript
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
  deviceScaleFactor: 2,
});
```

2. Check device is in Playwright's list
3. Use built-in device descriptors:
```typescript
import { devices } from '@playwright/test';
const context = await browser.newContext({ ...devices['iPhone 12'] });
```

### WebSocket Connection Issues

#### Issue: WebSocket connection fails
**Symptoms:** "Connection failed" or "WebSocket error"

**Solutions:**
1. Verify WebSocket URL is correct
2. Check CORS settings on server
3. Verify SSL certificates
4. Check firewall/proxy settings

#### Issue: Connection drops frequently
**Symptoms:** Frequent disconnections during tests

**Solutions:**
1. Increase heartbeat interval
2. Check server keepalive settings
3. Verify network stability
4. Add reconnection logic verification

### Session and State Issues

#### Issue: Session not found
**Symptoms:** "Session not found" error

**Solutions:**
1. Verify session ID is correct
2. Check session hasn't expired
3. Verify server session persistence
4. Check Redis/memory store connection

#### Issue: State not syncing
**Symptoms:** Changes on one device don't appear on others

**Solutions:**
1. Verify both devices connected to same session
2. Check WebSocket message delivery
3. Verify conflict resolution working
4. Check state serialization/deserialization

#### Issue: Data loss during handoff
**Symptoms:** State missing after device handoff

**Solutions:**
1. Verify state was saved before handoff
2. Check state transfer in handoff token
3. Verify snapshot retrieval
4. Check for race conditions

### Performance Issues

#### Issue: Slow handoff latency
**Symptoms:** Handoff takes >100ms

**Solutions:**
1. Profile server response time
2. Check database query performance
3. Verify network latency
4. Optimize state serialization

#### Issue: High memory usage
**Symptoms:** Tests crash with out of memory

**Solutions:**
1. Reduce concurrent workers
2. Close contexts after each test
3. Check for memory leaks
4. Use `test.afterEach` cleanup

#### Issue: Slow test execution
**Symptoms:** Tests take too long to complete

**Solutions:**
1. Run tests in parallel (if not multi-device)
2. Use `fullyParallel: true` in config
3. Optimize setup/teardown
4. Use test retries instead of long timeouts

### Device Management Issues

#### Issue: Device presence not updating
**Symptoms:** Device count incorrect

**Solutions:**
1. Check presence heartbeat
2. Verify disconnect detection
3. Check WebSocket close handlers
4. Add explicit presence refresh

#### Issue: Conflict resolution not triggering
**Symptoms:** Concurrent edits overwrite each other

**Solutions:**
1. Verify version vectors in use
2. Check conflict detection logic
3. Verify resolution strategy applied
4. Add conflict indicator visibility checks

### Debugging Tips

#### Enable Debug Mode
```bash
# Run with Playwright UI
npx playwright test --ui

# Run with debug
npx playwright test --debug

# Run headed with slow motion
npx playwright test --headed --slowmo=1000
```

#### View Traces
```bash
# Show HTML report
npx playwright show-report reports/playwright-report

# Open trace viewer
npx playwright show-trace trace.zip
```

#### Add Debug Logging
```typescript
// In your test
test('example', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  page.on('pageerror', error => console.error(error));
  
  await page.goto('/');
  // ... test code
});
```

#### Network Inspection
```typescript
test('example', async ({ page }) => {
  // Log all network requests
  page.on('request', request => console.log('>>', request.method(), request.url()));
  page.on('response', response => console.log('<<', response.status(), response.url()));
  
  await page.goto('/');
});
```

### Environment Setup

#### Required Environment Variables
```bash
export E2E_BASE_URL=http://localhost:3000
export WS_URL=ws://localhost:8080/ws
export API_URL=http://localhost:8080
```

#### Verify Setup
```bash
# Check Node version (needs 20+)
node --version

# Check Playwright
npx playwright --version

# Verify browsers
npx playwright install --dry-run
```

### Getting Help

1. **Check logs:** `reports/playwright-report/`
2. **Review screenshots:** Captured on failure
3. **Watch videos:** Recorded for debugging
4. **Check traces:** Detailed execution timeline

### Reporting Bugs

When reporting test failures:
1. Include test name and scenario
2. Attach failure screenshot
3. Include console logs
4. Provide environment details
5. Add trace file if possible

## Quick Fixes

```bash
# Reset everything
rm -rf node_modules package-lock.json
npm install
npx playwright install

# Clear reports
rm -rf reports/

# Run specific failing test
npx playwright test e2e/mobile-to-web-handoff.spec.ts --debug

# Run with verbose output
DEBUG=pw:* npx playwright test
```
