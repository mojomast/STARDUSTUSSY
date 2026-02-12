# Test Scenarios Documentation

## Overview

This document provides detailed documentation for all Week 3 multi-device test scenarios.

## Test Case 1: Mobile to Web Handoff

### Objective
Validate the seamless transfer of a user session from a mobile device to a web browser.

### Test Steps

1. **Create Session on Mobile**
   - Open application on mobile device
   - Create new session
   - Verify session ID generated
   - Add initial state data

2. **Generate Handoff Token**
   - Click handoff button
   - Verify QR code generated
   - Copy handoff token
   - Verify token expiration time displayed

3. **Resume on Web Browser**
   - Open web browser
   - Enter handoff token or scan QR
   - Wait for session connection
   - Verify session loaded

4. **Verify State Transfer**
   - Check session ID matches
   - Verify state data transferred correctly
   - Test bidirectional sync
   - Validate no data loss

### Expected Results
- Handoff latency < 100ms
- 100% state preservation
- QR code scannable within 2 seconds
- Token expires after 5 minutes

### Edge Cases
- Invalid/expired token handling
- Network interruption during handoff
- Session expiration mid-handoff
- Complex nested state objects

---

## Test Case 2: Simultaneous Multi-Device Usage

### Objective
Ensure multiple devices can simultaneously use the same session with proper conflict resolution.

### Test Steps

1. **Connect Multiple Devices**
   - Create session on device 1
   - Generate handoff token
   - Connect devices 2-5 (or more)
   - Verify all show connected

2. **Concurrent Edits**
   - Edit state on all devices simultaneously
   - Save changes concurrently
   - Verify conflict resolution
   - Check all devices converge

3. **Rapid Sequential Edits**
   - Make 20+ rapid edits on one device
   - Verify sync on other devices
   - Check for race conditions
   - Validate no data loss

4. **Device Presence**
   - Verify device count accurate
   - Check device list displays correctly
   - Test device disconnect detection
   - Validate ownership transfer

### Expected Results
- Support for 5+ concurrent devices
- Conflict resolution < 2s
- All devices sync within 1s
- No data loss during conflicts

### Edge Cases
- 10+ devices connected
- All devices edit simultaneously
- Rapid connect/disconnect cycles
- Primary device disconnects

---

## Test Case 3: Network Interruption Recovery

### Objective
Validate application resilience to network failures and proper recovery mechanisms.

### Test Steps

1. **Single Device Disconnection**
   - Connect 2 devices to session
   - Disconnect device 2 (set offline)
   - Edit on device 1
   - Reconnect device 2
   - Verify state synced

2. **Offline Changes Queue**
   - Go offline
   - Make multiple changes
   - Verify queue indicator
   - Reconnect
   - Verify all changes synced

3. **Intermittent Connectivity**
   - Rapid disconnect/reconnect cycles
   - Make changes during each cycle
   - Verify consistency
   - Check for duplicate operations

4. **Extended Offline Period**
   - Disconnect for 30+ seconds
   - Make changes while offline
   - Reconnect
   - Verify session persistence

### Expected Results
- Reconnection within 5s
- Offline change queue (50+ items)
- 100% state recovery
- WebSocket fallback to polling

### Edge Cases
- WiFi to cellular transition
- Airplane mode toggling
- WebSocket failure
- Browser sleep/wake

---

## Test Case 4: Session Expiration Edge Cases

### Objective
Test session lifecycle management including expiration warnings and graceful handling.

### Test Steps

1. **Expiration Warning**
   - Create session
   - Wait for expiration warning (5 min before)
   - Verify warning displayed
   - Check countdown timer

2. **Session Extension**
   - Receive expiration warning
   - Click extend session
   - Verify extension success
   - Confirm warning dismissed

3. **Session Expiration**
   - Let session expire
   - Verify expired error message
   - Check state preservation
   - Validate reconnection blocked

4. **Handoff with Expired Session**
   - Create session
   - Generate handoff token
   - Expire session
   - Attempt handoff
   - Verify proper error

### Expected Results
- Warning shown 5 min before expiration
- Extension increases TTL by 1 hour
- Graceful error on expiration
- Data preservation options shown

### Edge Cases
- Extension during handoff
- Expiration while offline
- Concurrent devices with different TTLs
- Unsaved data warning

---

## Test Case 5: Device Disconnection

### Objective
Validate device management including intentional logout and unexpected disconnects.

### Test Steps

1. **Intentional Logout**
   - Connect 2 devices
   - Logout from device 2
   - Confirm logout dialog
   - Verify device 1 updates count
   - Check device 2 disconnected

2. **Unexpected Disconnect**
   - Connect 2 devices
   - Close browser (no logout)
   - Verify device 1 shows notification
   - Check device count updated
   - Validate session persists

3. **Primary Device Disconnect**
   - Create session (device 1 primary)
   - Connect devices 2-3
   - Disconnect device 1
   - Verify ownership transferred
   - Check session continues

4. **Device Kick**
   - Create session (device 1)
   - Device 2 joins
   - Device 1 kicks device 2
   - Verify device 2 disconnected
   - Check notification shown

### Expected Results
- Disconnect detection < 2s
- Automatic primary transfer
- Session persists after all disconnect
- Clear disconnect notifications

### Edge Cases
- Multiple simultaneous disconnects
- Kick during handoff
- Logout during sync operation
- Reconnect with same device

---

## Test Data Requirements

### Session Data
- Simple string state
- Complex nested objects
- Large payloads (up to 1MB)
- Binary data (if supported)

### Device Configurations
- iPhone (375x667)
- iPad (1024x1366)
- Android (412x915)
- Desktop (1280x720, 1920x1080)

### Network Conditions
- Excellent (>10 Mbps)
- Good (2-10 Mbps)
- Poor (<2 Mbps)
- Offline (0 Mbps)

## Success Criteria

| Criteria | Requirement |
|----------|-------------|
| Handoff latency | <100ms |
| Concurrent devices | 5+ |
| Conflict resolution | <2s |
| Reconnection time | <5s |
| Sync latency | <1s |
| Memory per device | <20MB |
| Data loss | 0 incidents |

## Troubleshooting

### Common Issues

1. **Test timeouts**
   - Increase timeout in playwright.config.ts
   - Check staging environment performance

2. **Browser launch failures**
   - Run `npx playwright install`
   - Check system dependencies

3. **Mobile emulation issues**
   - Verify device profiles
   - Check viewport settings

4. **Sync delays**
   - Check WebSocket connection
   - Verify server performance

## References

- [Playwright Documentation](https://playwright.dev/)
- [WebSocket Protocol Spec](../contracts/websocket-protocol-v1.0-frozen.md)
- [API Contract](../contracts/openapi-v1.0-frozen.yaml)
