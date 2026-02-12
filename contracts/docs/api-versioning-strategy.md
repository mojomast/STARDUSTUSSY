# HarmonyFlow SyncBridge - API Versioning Strategy
## Version 1.0.0

### Overview

This document defines the API versioning strategy for the HarmonyFlow SyncBridge platform. Versioning ensures backward compatibility while allowing the platform to evolve.

### Versioning Principles

1. **Backward Compatibility**: Existing clients should continue to work without modification
2. **Predictability**: Version changes follow semantic meaning
3. **Transparency**: All changes are documented and communicated
4. **Deprecation**: Old versions are supported for a reasonable transition period
5. **Simplicity**: Versioning is easy to understand and implement

### Versioning Scheme

We use **URL-based versioning** with semantic version numbers:

```
https://api.harmonyflow.io/{version}/
```

#### Current Version

- **API Version**: `v1`
- **Protocol Version**: `1.0.0`
- **Release Date**: 2026-02-11

### Breaking vs Non-Breaking Changes

#### Breaking Changes (Requires New Version)

Breaking changes require incrementing the major version number:

- Removing or renaming endpoints
- Removing or renaming request/response fields
- Changing field data types
- Changing authentication mechanisms
- Modifying error response formats
- Changing pagination behavior
- Removing enum values

#### Non-Breaking Changes (Same Version)

Non-breaking changes can be added to existing versions:

- Adding new endpoints
- Adding new optional request/response fields
- Adding new enum values
- Adding new error codes
- Improving error messages
- Performance improvements
- Bug fixes

### Version Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Active    │────▶│ Deprecated  │────▶│  Sunset     │────▶│  Retired    │
│             │     │             │     │             │     │             │
│ Supported   │     │ Supported   │     │ Limited     │     │ Not         │
│ New Features│     │ No Features │     │ Support     │     │ Available   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │
       │ New Major Version
       ▼
┌─────────────┐
│   Active    │
│   (v2)      │
└─────────────┘
```

#### Phase Durations

| Phase | Duration | Description |
|-------|----------|-------------|
| Active | Indefinite | Full support, new features added |
| Deprecated | 12 months | Supported but no new features; migration encouraged |
| Sunset | 3 months | Limited support; only critical bug fixes |
| Retired | - | Not available |

### REST API Versioning

#### URL Structure

```
https://api.harmonyflow.io/v1/sessions
https://api.harmonyflow.io/v2/sessions  (future)
```

#### Version Header (Alternative)

Clients may also specify version via header:

```http
Accept: application/vnd.harmonyflow.v1+json
```

The URL version takes precedence if both are provided.

#### Version Response Header

All responses include the API version:

```http
X-API-Version: v1
X-Protocol-Version: 1.0.0
```

### WebSocket Protocol Versioning

#### Connection URL

```
wss://api.harmonyflow.io/v1/ws/sessions/{sessionId}
wss://api.harmonyflow.io/v2/ws/sessions/{sessionId}  (future)
```

#### Protocol Version Negotiation

During connection establishment:

1. Client connects with supported version in URL
2. Server accepts or rejects based on supported versions
3. Server responds with `connected` message containing:
   - `protocolVersion`: Negotiated protocol version
   - `serverTime`: Server timestamp

#### Breaking Protocol Changes

Protocol breaking changes include:

- Changing message envelope structure
- Removing message types
- Changing binary encoding
- Modifying connection handshake
- Changing heartbeat protocol

### Protobuf Versioning

#### Package Structure

```protobuf
package harmonyflow.session.v1;
//                          ^^ version
```

#### Version Management

- Each major API version gets its own protobuf package
- Minor versions are backward compatible within the same package
- Deprecation annotations mark fields scheduled for removal:

```protobuf
message Session {
  string id = 1;
  string name = 2;
  string title = 3 [deprecated = true];  // Use 'name' instead
}
```

### TypeScript Types Versioning

#### Package Version

```json
{
  "name": "@harmonyflow/syncbridge-types",
  "version": "1.0.0"
}
```

#### Semantic Versioning

- **MAJOR**: Breaking changes (e.g., v1.0.0 → v2.0.0)
- **MINOR**: New features, backward compatible (e.g., v1.0.0 → v1.1.0)
- **PATCH**: Bug fixes (e.g., v1.0.0 → v1.0.1)

### Deprecation Process

1. **Announcement**: 6 months before deprecation
2. **Documentation**: Mark deprecated features in all specs
3. **Headers**: Add deprecation warnings in responses:
   ```http
   Deprecation: true
   Sunset: Sat, 11 Feb 2027 00:00:00 GMT
   Link: </docs/migration/v2>; rel="successor-version"
   ```
4. **Logging**: Track deprecated endpoint usage
5. **Migration Guide**: Provide detailed migration documentation

### Version Compatibility Matrix

| Client Version | API v1 | API v2 | Protocol v1 | Protocol v2 |
|----------------|--------|--------|-------------|-------------|
| SDK 1.x        | ✅ Full | ❌ No | ✅ Full | ❌ No |
| SDK 2.x        | ✅ Backward | ✅ Full | ✅ Backward | ✅ Full |

### Migration Guidelines

#### For API Consumers

1. Subscribe to API change notifications
2. Test applications against new versions in staging
3. Update client SDKs promptly
4. Handle deprecation warnings gracefully
5. Plan migrations before sunset dates

#### For API Providers

1. Maintain backward compatibility within major versions
2. Provide clear migration documentation
3. Offer SDKs for easy upgrades
4. Monitor deprecated endpoint usage
5. Communicate timelines clearly

### Changelog Format

All version changes are documented in `CHANGELOG.md`:

```markdown
## [1.1.0] - 2026-03-15

### Added
- New `/sessions/bulk` endpoint for batch operations
- `hapticFeedback` field to SessionSettings

### Changed
- Improved error messages for validation errors

### Deprecated
- `title` field in Session (use `name` instead)

### Fixed
- Race condition in state synchronization

## [2.0.0] - 2026-06-01

### Breaking Changes
- Authentication now requires OAuth 2.0 PKCE
- WebSocket message format changed to binary protobuf
- Removed deprecated `/legacy/sessions` endpoint
```

### Communication Channels

Version changes are communicated through:

1. **Developer Newsletter**: Monthly updates
2. **API Documentation**: Always current
3. **Status Page**: https://status.harmonyflow.io
4. **GitHub Releases**: Detailed changelogs
5. **SDK Release Notes**: Migration guides

### Version Support Policy

| Version | Status | Support End Date |
|---------|--------|------------------|
| v1 | Active | TBD |

### Emergency Changes

In exceptional circumstances (security vulnerabilities), breaking changes may be introduced with minimal notice:

1. Immediate security patch
2. 24-hour advance notice for non-critical fixes
3. Detailed post-incident report
4. Accelerated migration support

### Questions?

Contact the API team:
- Email: api@harmonyflow.io
- Slack: #api-support
- Documentation: https://docs.harmonyflow.io/api
