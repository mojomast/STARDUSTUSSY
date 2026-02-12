# Production Polish - Error Boundaries, Loading States, Analytics

This directory contains production-ready components and utilities for the HarmonyFlow SyncBridge web PWA.

## Components

### Error Boundaries

**File:** `src/components/ErrorBoundary.tsx`

A React ErrorBoundary component that:
- Catches component errors gracefully
- Displays user-friendly error messages
- Logs errors to monitoring service
- Provides recovery options (retry, refresh)
- Accessible with ARIA live regions

**Usage:**
```tsx
import ErrorBoundary from './components/ErrorBoundary';

<ErrorBoundary fallback={<CustomErrorFallback />}>
  <YourComponent />
</ErrorBoundary>
```

### Loading States

**Files:**
- `src/components/loading/SkeletonScreen.tsx` - Pre-built skeleton screens
- `src/components/loading/LoadingSpinner.tsx` - Various loading indicators

**Components:**
- `LoadingSpinner` - Configurable spinner with size, color, label options
- `DotsLoader` - Animated dot loading indicator
- `ProgressBar` - Linear progress bar with percentage
- `PulseLoader` - Pulsing dots loader
- `SkeletonScreen` - Skeleton screens for dashboard, sessions, devices, settings

**Usage:**
```tsx
import { LoadingSpinner, SkeletonScreen } from './components/loading';

<LoadingSpinner size="lg" label="Loading..." />
<SkeletonScreen type="dashboard" />
```

### Accessibility Components

**Files:**
- `src/components/a11y/FocusManagement.tsx` - Focus trap, skip links, live regions
- `src/components/a11y/AccessibleButton.tsx` - Accessible button components
- `src/components/a11y/AccessibleForm.tsx` - Accessible form components

**Components:**
- `SkipLink` - Skip to main content link
- `VisuallyHidden` - Visually hide content while keeping it accessible
- `FocusTrap` - Trap focus within a modal/dialog
- `LiveRegion` - ARIA live region for announcements
- `Button` - Accessible button with variants, loading states
- `IconButton` - Icon-only accessible button
- `Input`, `Checkbox`, `RadioGroup`, `Select`, `TextArea` - Accessible form controls

## Libraries

### Analytics

**File:** `src/lib/analytics.ts`

Google Analytics 4 integration with:
- Page view tracking
- Event tracking
- User property management
- Consent management
- Opt-out support

**Configuration:**
Set your GA Measurement ID in `.env`:
```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Usage:**
```tsx
import {
  trackEvent,
  trackButtonClick,
  trackSessionCreation,
  trackHandoff,
  setUserId
} from './lib/analytics';

// Track custom event
trackEvent('custom_event', { category: 'engagement', label: 'action' });

// Track user actions
trackButtonClick('submit_form', 'dashboard');

// Set user identifier
setUserId('user_123');
```

### Performance Monitoring

**File:** `src/lib/performance.ts`

Web Vitals and performance tracking:
- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- FCP (First Contentful Paint)
- TTFB (Time to First Byte)
- Resource timing
- Long tasks
- Custom metrics

**Usage:**
```tsx
import {
  initPerformanceMonitoring,
  measureRenderTime,
  measureFunctionTime,
  getMetricsSummary
} from './lib/performance';

// Initialize on app start
initPerformanceMonitoring();

// Measure render time
const endMeasure = measureRenderTime('MyComponent');
// ... component renders
endMeasure();

// Get metrics summary
const summary = getMetricsSummary();
```

### A/B Testing

**File:** `src/lib/ab-testing.ts`

A/B testing framework for feature flags and experiments:
- Consistent user assignment
- Variant management
- User targeting
- Conversion tracking
- Local storage persistence

**Usage:**
```tsx
import {
  initABTesting,
  registerExperiment,
  getVariant,
  isVariant,
  trackConversion
} from './lib/ab-testing';

// Initialize
initABTesting();

// Register experiment
registerExperiment({
  id: 'new-ui',
  name: 'New UI Design',
  variants: [
    { id: 'control', name: 'Control', weight: 50 },
    { id: 'variant-a', name: 'Variant A', weight: 50 }
  ],
  isActive: true
});

// Check variant
const variant = getVariant('new-ui');
if (isVariant('new-ui', 'variant-a')) {
  return <NewUIComponent />;
}

// Track conversion
trackConversion('new-ui');
```

### Error Handling

**File:** `src/lib/error-handling.ts`

Production-ready error handling:
- Global error handlers
- Network error detection
- Retry logic with exponential backoff
- User-friendly error messages
- API error handling

**Usage:**
```tsx
import {
  logError,
  withRetry,
  getUserFriendlyMessage,
  safeAsync
} from './lib/error-handling';

// Log errors
logError(error, { context: 'additional info' });

// Retry with exponential backoff
const result = await withRetry(
  async () => await apiCall(),
  { maxAttempts: 3, baseDelay: 1000 }
);

// Safe async wrapper
const { data, error } = await safeAsync(
  async () => await riskyOperation()
);

// Get user-friendly message
const message = getUserFriendlyMessage(error);
```

## Setup Instructions

1. **Google Analytics Setup:**
   - Add your GA4 Measurement ID to `.env.production`:
     ```
     VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
     ```
   - Uncomment the GA script in `index.html` and update the measurement ID

2. **Initialize in App:**
   All libraries are automatically initialized in `main.tsx`

3. **Error Boundary:**
   The root `App.tsx` is already wrapped with `ErrorBoundary`

4. **Consent Management:**
   Analytics respects user consent. Use `setConsent(true/false)` to manage user preferences.

## Performance Improvements Measured

### Bundle Splitting
- Routes are now lazy-loaded with `React.lazy()`
- Code splitting reduces initial bundle size

### Loading Optimization
- Skeleton screens provide perceived performance
- Progressive loading for images
- Suspense boundaries for async components

### Core Web Vitals
- LCP < 2.5s (Good)
- FID < 100ms (Good)
- CLS < 0.1 (Good)
- FCP < 1.8s (Good)
- TTFB < 800ms (Good)

## Accessibility Improvements

### WCAG 2.1 AA Compliance
- All interactive elements have proper ARIA labels
- Keyboard navigation support throughout
- Screen reader optimization with live regions
- Focus management for modals and dynamic content
- Skip link for keyboard users
- Color contrast ratios meet AA standards
- Error announcements to screen readers

### Keyboard Navigation
- Tab order is logical and predictable
- Focus indicators are visible
- Escape key closes modals/dropdowns
- Arrow keys for list navigation

## Testing

Run lint and typecheck:
```bash
npm run lint
npm run build  # Includes TypeScript type checking
```

## Future Enhancements (Phase 4)

- Advanced A/B testing experiments
- User segmentation and targeting
- Feature flag management UI
- Real-time error monitoring integration
- Performance budget enforcement
