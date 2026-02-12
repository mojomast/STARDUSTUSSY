# HarmonyFlow SyncBridge - API Contracts

This directory contains all API contracts, protocol specifications, and type definitions for the HarmonyFlow SyncBridge wellness platform.

## Structure

```
contracts/
├── websocket/              # WebSocket protocol specification
│   └── websocket-protocol.md
├── openapi/                # OpenAPI 3.0 specifications
│   └── harmonyflow-api.yaml
├── protobuf/               # Protocol Buffer definitions
│   ├── session.proto
│   └── common.proto
├── typescript/             # TypeScript type definitions
│   ├── types.ts
│   ├── websocket.ts
│   ├── api-client.ts
│   ├── index.ts
│   ├── package.json
│   └── tsconfig.json
└── docs/                   # Documentation
    └── api-versioning-strategy.md
```

## Quick Start

### For REST API Consumers

View the OpenAPI specification at `openapi/harmonyflow-api.yaml`. You can:
- Import into Postman, Swagger UI, or other OpenAPI tools
- Generate client SDKs using OpenAPI Generator
- View interactive documentation

### For WebSocket Consumers

Read the WebSocket protocol specification at `websocket/websocket-protocol.md` for:
- Message format and types
- Connection lifecycle
- Error handling
- Reconnection protocol

### For TypeScript Developers

Install the types package:

```bash
npm install @harmonyflow/syncbridge-types
```

Or use directly from the `typescript/` directory.

### For gRPC Consumers

Generate code from protobuf definitions in `protobuf/`:

```bash
# Go
protoc --go_out=. --go_opt=paths=source_relative session.proto

# TypeScript
protoc --ts_out=. session.proto

# Java
protoc --java_out=. session.proto
```

## Version Information

- **API Version**: v1
- **Protocol Version**: 1.0.0
- **Release Date**: 2026-02-11

## Validation

### OpenAPI Spec

Validate using Swagger CLI:

```bash
swagger-cli validate openapi/harmonyflow-api.yaml
```

### Protocol Buffers

Validate using protoc:

```bash
protoc --proto_path=. --descriptor_set_out=/dev/null protobuf/*.proto
```

### TypeScript Types

Check types:

```bash
cd typescript
npm install
npm run typecheck
```

## Contributing

When updating contracts:

1. Update the relevant specification file
2. Increment version numbers for breaking changes
3. Update documentation
4. Validate all specifications
5. Update the changelog

## Support

For questions or issues:
- Email: api@harmonyflow.io
- Documentation: https://docs.harmonyflow.io
- Issues: https://github.com/harmonyflow/syncbridge/issues
