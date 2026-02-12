// Production Deployment Configuration for HarmonyFlow Web PWA
// Environment: Production

module.exports = {
  production: {
    // API Configuration
    api: {
      baseUrl: 'https://api.harmonyflow.io',
      websocketUrl: 'wss://ws.harmonyflow.io',
      timeout: 30000,
      retries: 3
    },
    
    // Environment
    env: {
      name: 'production',
      debug: false,
      analytics: true,
      monitoring: true
    },
    
    // CDN Configuration
    cdn: {
      enabled: true,
      baseUrl: 'https://cdn.harmonyflow.io',
      assetsPath: '/assets/v1.0.0',
      cacheDuration: 31536000
    },
    
    // Authentication
    auth: {
      tokenRefreshInterval: 300000, // 5 minutes
      tokenLeeway: 10,
      maxRetries: 3
    },
    
    // Session Management
    session: {
      ttl: 604800000, // 7 days in milliseconds
      checkpointInterval: 30000, // 30 seconds
      maxRetries: 3
    },
    
    // WebSocket Configuration
    websocket: {
      pingInterval: 30000,
      pongTimeout: 60000,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    },
    
    // Feature Flags
    features: {
      offlineMode: true,
      pushNotifications: true,
      biometrics: true,
      multiDevice: true,
      collaboration: true
    },
    
    // Performance
    performance: {
      lazyLoadComponents: true,
      prefetchRoutes: true,
      cacheStrategies: 'aggressive',
      imageOptimization: true
    },
    
    // Monitoring
    monitoring: {
      sentryDsn: process.env.SENTRY_DSN || '',
      datadogApiKey: process.env.DATADOG_API_KEY || '',
      errorReporting: true,
      performanceTracking: true
    },
    
    // Service Worker Configuration
    serviceWorker: {
      enabled: true,
      updateInterval: 3600000, // 1 hour
      maxCacheSize: 52428800, // 50MB
      cacheStrategy: 'networkFirst'
    },
    
    // PWA Configuration
    pwa: {
      name: 'HarmonyFlow',
      shortName: 'HarmonyFlow',
      themeColor: '#6366f1',
      backgroundColor: '#ffffff',
      display: 'standalone',
      orientation: 'portrait-primary',
      categories: ['productivity', 'business'],
      screenshots: [
        '/assets/screenshots/screenshot-1.png',
        '/assets/screenshots/screenshot-2.png',
        '/assets/screenshots/screenshot-3.png'
      ]
    },
    
    // Build Configuration
    build: {
      sourceMap: false,
      minify: true,
      treeshake: true,
      chunkSplitting: true,
      extractCSS: true,
      compression: true
    }
  }
};
