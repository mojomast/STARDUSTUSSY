# HarmonyFlow SyncBridge - Web PWA

A Progressive Web App for seamless cross-device session synchronization.

## Features

- **PWA Support**: Installable app with offline capabilities
- **Real-time Sync**: WebSocket-based state synchronization
- **Redux State Management**: Centralized state with persistence
- **Authentication**: JWT-based auth with protected routes
- **Responsive Design**: Works on desktop and mobile devices
- **Docker Support**: Containerized for easy deployment

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **State Management**: Redux Toolkit
- **Routing**: React Router
- **Testing**: Vitest + Playwright
- **PWA**: vite-plugin-pwa + Workbox

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Development

### Environment Variables

Create `.env.local` file:

```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8081
```

### Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# E2E tests with UI
npm run test:e2e:ui
```

### Docker

```bash
# Build image
docker build -t syncbridge-web .

# Run container
docker run -p 80:80 syncbridge-web
```

## Project Structure

```
src/
  ├── components/     # Reusable UI components
  ├── pages/         # Page components
  ├── store/         # Redux store and slices
  ├── hooks/         # Custom React hooks
  ├── types/         # TypeScript types
  ├── services/      # API and WebSocket services
  └── utils/         # Utility functions

public/              # Static assets
  ├── offline.html   # Offline fallback page
  └── icon-*.svg     # PWA icons

e2e/                 # End-to-end tests
```

## PWA Configuration

The PWA is configured via `vite.config.ts` with:

- Auto-updating service worker
- Offline page support
- Runtime caching for API calls
- App manifest for installability

## License

MIT
