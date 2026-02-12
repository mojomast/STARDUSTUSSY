# HarmonyFlow SyncBridge - Week 4 E2E Test Suite

## Overview
This directory contains the complete end-to-end test suite for HarmonyFlow SyncBridge Phase 1.

## Test Structure

```
e2e/
├── auth/                      # Authentication flow tests
│   ├── user-registration.spec.ts
│   ├── login-flow.spec.ts
│   └── session-management.spec.ts
├── journeys/                  # Complete user journeys
│   ├── new-user-journey.spec.ts
│   ├── device-handoff.spec.ts
│   ├── admin-dashboard.spec.ts
│   └── network-recovery.spec.ts
├── cross-browser/            # Cross-browser compatibility
│   ├── desktop-browsers.spec.ts
│   └── mobile-browsers.spec.ts
├── devices/                  # Device-specific scenarios
│   ├── desktop-mobile.spec.ts
│   ├── mobile-desktop.spec.ts
│   └── tablet-scenarios.spec.ts
├── fixtures/                 # Test data fixtures
│   ├── users.ts
│   ├── sessions.ts
│   └── database.ts
├── utils/                    # Test utilities
│   ├── test-helpers.ts
│   ├── network-utils.ts
│   └── performance-utils.ts
└── config/
    └── playwright.config.ts
```

## Running Tests

### Local Development
```bash
# Install dependencies
npm install

# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test e2e/auth/login-flow.spec.ts

# Run with UI mode for debugging
npm run test:e2e:ui

# Run on specific browser
npx playwright test --project=chromium
```

### CI/CD
Tests run automatically on:
- Pull requests to main/develop
- Nightly builds
- Release candidates

## Test Coverage

- **Total E2E Tests**: 50+
- **User Journeys**: 4 complete flows
- **Browsers**: Chrome, Firefox, Safari, Edge
- **Mobile**: iOS Safari, Chrome Mobile
- **Device Types**: Desktop, Mobile, Tablet

## Performance Budgets

- Page Load: < 3 seconds
- First Paint: < 1.5 seconds
- Time to Interactive: < 3.5 seconds
- Animation FPS: > 55fps

## Reports

- HTML Report: `reports/playwright-report/`
- JSON Results: `reports/playwright-results.json`
- JUnit XML: `reports/playwright-junit.xml`
- Coverage: `reports/coverage/`
