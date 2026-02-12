# HarmonyFlow Mobile - Build Instructions

## Quick Start

### Prerequisites
- Node.js >= 18.x
- React Native CLI: `npm install -g @react-native-community/cli`
- iOS: Xcode >= 15, CocoaPods
- Android: Android Studio, Android SDK

### Installation

```bash
cd /home/mojo/projects/watercooler/apps/mobile
npm install
```

### iOS Build

```bash
# Install CocoaPods dependencies
cd ios
bundle install  # First time only
bundle exec pod install
cd ..

# Build and run on iOS Simulator
npm run ios

# Or run on specific device
npx react-native run-ios --device "iPhone 15"
```

### Android Build

```bash
# Start Android emulator or connect device
# Build and run
npm run android

# Or with specific flags
npx react-native run-android --active-arch-only
```

### Development Server

```bash
# Start Metro bundler
npm start

# Or with cache reset
npm start -- --reset-cache
```

## Project Structure

```
android/               # Android native code
ios/                   # iOS native code
src/
  ├── components/      # Reusable UI components
  ├── constants/       # App constants (API URLs, colors, config)
  ├── context/         # React contexts (SessionContext with WebSocket)
  ├── hooks/           # Custom React hooks
  ├── navigation/      # Navigation setup
  │   ├── AuthNavigator.tsx    # Auth flow
  │   ├── MainNavigator.tsx    # Main app tabs
  │   ├── RootNavigator.tsx    # Root with auth state
  │   └── types.ts             # Navigation types
  ├── screens/
  │   ├── auth/        # Login, Register, ForgotPassword
  │   └── main/        # Home, Devices, Handoff, Profile, QRScanner, SessionDetails
  ├── services/        # API services
  │   ├── api.ts       # Base API utilities
  │   ├── auth.ts      # Authentication
  │   ├── session.ts   # Session management
  │   └── device.ts    # Device management
  ├── store/           # Redux store
  │   ├── index.ts
  │   └── slices/      # auth, session, device, sync
  ├── types/           # TypeScript definitions
  └── utils/           # Utility functions
```

## Features Implemented

### 1. Authentication Screens ✅
- Login screen (email/password)
- Register screen
- Forgot password screen
- Connected to Redux store
- AsyncStorage for token persistence

### 2. Session Connection ✅
- SessionContext with WebSocket integration
- StateManager from @harmonyflow/client-state-manager
- Connection status indicator
- Auto-connect on app start

### 3. QR Scanner ✅
- react-native-vision-camera integration
- Camera permission handling
- QR code scanning
- Session handoff flow

### 4. Navigation ✅
- AuthNavigator (Login, Register, ForgotPassword)
- MainNavigator (Bottom tabs + stack screens)
- RootNavigator (auth state switching)
- Type-safe navigation

## Configuration

### API Endpoints
Edit `src/constants/index.ts`:

```typescript
export const API_BASE_URL = __DEV__
  ? 'https://staging-api.harmonyflow.io'
  : 'https://api.harmonyflow.io';

export const WS_BASE_URL = __DEV__
  ? 'wss://staging-ws.harmonyflow.io'
  : 'wss://ws.harmonyflow.io';
```

### Path Aliases
Configured in:
- `babel.config.js` - Babel module resolver
- `tsconfig.json` - TypeScript paths
- `jest.config.js` - Jest moduleNameMapper

Available aliases: `@/`, `@components/`, `@screens/`, `@services/`, `@store/`, `@types/`, `@utils/`, `@constants/`, `@hooks/`, `@navigation/`, `@context/`

## Dependencies

### Core
- react-native 0.84.0
- react 19.2.3
- TypeScript 5.8.3

### Navigation
- @react-navigation/native 7.1.28
- @react-navigation/native-stack 7.12.0
- @react-navigation/bottom-tabs

### State Management
- @reduxjs/toolkit 2.11.2
- react-redux 9.2.0

### Camera & QR
- react-native-vision-camera 4.7.3
- react-native-worklets-core 1.6.2

### UI
- react-native-vector-icons
- react-native-safe-area-context
- react-native-gesture-handler
- react-native-screens

### Storage & Permissions
- @react-native-async-storage/async-storage
- react-native-permissions
- react-native-device-info

### Internal Package
- @harmonyflow/client-state-manager (linked from packages/)

## Platform Setup

### iOS Permissions (Info.plist)
- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription
- NSMicrophoneUsageDescription
- NSFaceIDUsageDescription

### Android Permissions (AndroidManifest.xml)
- CAMERA
- RECORD_AUDIO
- ACCESS_FINE_LOCATION
- USE_BIOMETRIC
- VIBRATE
- RECEIVE_BOOT_COMPLETED
- POST_NOTIFICATIONS

## Testing

```bash
# Run tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Troubleshooting

### iOS Issues
```bash
cd ios
rm -rf Pods Podfile.lock
bundle exec pod install --repo-update
cd ..
```

### Android Issues
```bash
cd android
./gradlew clean
cd ..
```

### Metro Issues
```bash
# Clear all caches
rm -rf node_modules
rm -rf ios/Pods ios/Podfile.lock
rm -rf android/.gradle android/app/build
npm install
cd ios && bundle exec pod install && cd ..
npm start -- --reset-cache
```

### Package Link Issues
If @harmonyflow/client-state-manager is not found:
```bash
mkdir -p node_modules/@harmonyflow
ln -s /home/mojo/projects/watercooler/packages/client-state-manager node_modules/@harmonyflow/client-state-manager
```

## Next Steps

1. ✅ Project scaffold complete
2. ✅ Dependencies installed
3. ✅ Navigation configured
4. ✅ Auth screens implemented
5. ✅ Session context with WebSocket
6. ✅ QR scanner implemented
7. ⏳ Connect to staging API
8. ⏳ Test iOS build
9. ⏳ Test Android build
10. ⏳ Add push notifications
11. ⏳ Add biometric auth
12. ⏳ Background sync

## Notes

- TypeScript path aliases are configured for clean imports
- Metro config includes monorepo support
- WebSocket integration ready via SessionContext
- QR Scanner uses react-native-vision-camera with worklets
- All auth screens connected to Redux
- Camera permissions handled on both platforms
