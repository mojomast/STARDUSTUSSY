# HarmonyFlow Mobile App

React Native TypeScript mobile application for HarmonyFlow SyncBridge.

## Project Structure

```
├── android/              # Android native code
├── ios/                  # iOS native code
├── src/
│   ├── components/       # Reusable UI components
│   ├── constants/        # App constants (colors, config, API URLs)
│   ├── context/          # React context providers
│   ├── hooks/            # Custom React hooks
│   ├── navigation/       # Navigation configuration
│   │   ├── AuthNavigator.tsx
│   │   ├── MainNavigator.tsx
│   │   ├── RootNavigator.tsx
│   │   └── types.ts
│   ├── screens/          # Screen components
│   │   ├── auth/         # Auth screens (Login, Register, ForgotPassword)
│   │   └── main/         # Main screens (Home, Devices, Handoff, Profile, QRScanner, SessionDetails)
│   ├── services/         # API services
│   │   ├── api.ts        # Base API utilities
│   │   ├── auth.ts       # Authentication service
│   │   ├── session.ts    # Session management
│   │   └── device.ts     # Device management
│   ├── store/            # Redux store
│   │   ├── index.ts      # Store configuration
│   │   └── slices/       # Redux slices (auth, session, device, sync)
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── App.tsx               # Root component
├── babel.config.js       # Babel configuration with path aliases
├── metro.config.js       # Metro bundler configuration
└── tsconfig.json         # TypeScript configuration

```

## Features

- **Authentication**: Login, Register, Forgot Password with email/password
- **Session Management**: Connect to WebSocket for real-time session sync
- **QR Code Scanner**: Scan QR codes for session handoff between devices
- **Connection Status**: Visual indicator for WebSocket connection state
- **Biometric Authentication**: Face ID/Touch ID support (iOS) / Fingerprint (Android)

## Prerequisites

- Node.js >= 18.x
- React Native development environment setup
- iOS: Xcode >= 15, CocoaPods
- Android: Android Studio, Android SDK

## Build Instructions

### 1. Install Dependencies

```bash
cd /home/mojo/projects/watercooler/apps/mobile
npm install
```

### 2. iOS Setup

```bash
# Install CocoaPods dependencies
cd ios
bundle install  # First time only
bundle exec pod install

# Build and run
cd ..
npm run ios
# OR
npx react-native run-ios
```

### 3. Android Setup

```bash
# Build and run
npm run android
# OR
npx react-native run-android
```

### 4. Start Metro (Development Server)

```bash
npm start
```

## Development

### Path Aliases

The project uses path aliases configured in:
- `babel.config.js` - Module resolution
- `tsconfig.json` - TypeScript path mapping

Available aliases:
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@screens/*` → `src/screens/*`
- `@services/*` → `src/services/*`
- `@store/*` → `src/store/*`
- `@types/*` → `src/types/*`
- `@utils/*` → `src/utils/*`
- `@constants/*` → `src/constants/*`
- `@hooks/*` → `src/hooks/*`
- `@navigation/*` → `src/navigation/*`
- `@context/*` → `src/context/*`

### API Configuration

Update API endpoints in `src/constants/index.ts`:

```typescript
export const API_BASE_URL = __DEV__
  ? 'https://staging-api.harmonyflow.io'
  : 'https://api.harmonyflow.io';

export const WS_BASE_URL = __DEV__
  ? 'wss://staging-ws.harmonyflow.io'
  : 'wss://ws.harmonyflow.io';
```

### Environment Variables

Create `.env` file for environment-specific configuration (requires `react-native-config` setup).

## Key Dependencies

- **react-native-vision-camera**: Camera and QR code scanning
- **react-native-permissions**: Permission management
- **@react-navigation/native**: Navigation
- **@reduxjs/toolkit**: State management
- **react-redux**: Redux bindings
- **@react-native-async-storage/async-storage**: Local storage
- **react-native-vector-icons**: Icons

## Permissions

### iOS (Info.plist)

- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription
- NSMicrophoneUsageDescription
- NSFaceIDUsageDescription

### Android (AndroidManifest.xml)

- CAMERA
- RECORD_AUDIO
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- USE_BIOMETRIC
- USE_FINGERPRINT
- VIBRATE
- RECEIVE_BOOT_COMPLETED
- POST_NOTIFICATIONS

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linting
npm run lint
```

## Troubleshooting

### iOS Build Issues

```bash
# Clean build
cd ios
rm -rf Pods Podfile.lock
bundle exec pod install --repo-update
cd ..
```

### Android Build Issues

```bash
# Clean build
cd android
./gradlew clean
cd ..
```

### Metro Bundler Issues

```bash
# Clear Metro cache
npx react-native start --reset-cache

# Clear all caches
npm start -- --reset-cache
```

## Next Steps

1. Connect to staging API for testing
2. Implement WebSocket connection manager
3. Add push notification support
4. Implement background sync
5. Add offline support
6. UI/UX polish

## License

MIT
