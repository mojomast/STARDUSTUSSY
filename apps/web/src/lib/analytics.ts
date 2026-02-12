interface AnalyticsConfig {
  measurementId: string;
  enabled?: boolean;
  debug?: boolean;
  anonymizeIp?: boolean;
}

interface EventParams {
  category?: string;
  label?: string;
  value?: number;
  nonInteraction?: boolean;
  [key: string]: string | number | boolean | undefined;
}

interface UserProperties {
  userId?: string;
  [key: string]: string | number | boolean | undefined;
}

let isInitialized = false;
let config: AnalyticsConfig | null = null;

declare global {
  interface Window {
    gtag?: (...args: (string | number | boolean | Record<string, unknown>)[]) => void;
    dataLayer?: unknown[];
  }
}

export function initAnalytics(analyticsConfig: AnalyticsConfig): void {
  if (isInitialized) {
    console.warn('Analytics already initialized');
    return;
  }

  config = analyticsConfig;

  if (!analyticsConfig.enabled) {
    console.log('Analytics is disabled');
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  window.dataLayer = window.dataLayer || [];

  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());

  const gtagConfig: Record<string, boolean | string> = {
    'anonymize_ip': analyticsConfig.anonymizeIp ?? true,
    'send_page_view': false
  };

  if (analyticsConfig.debug) {
    gtagConfig.debug_mode = true;
  }

  window.gtag('config', analyticsConfig.measurementId, gtagConfig);

  isInitialized = true;

  if (analyticsConfig.debug) {
    console.log('Analytics initialized with ID:', analyticsConfig.measurementId);
  }
}

export function trackPageView(pagePath: string, pageTitle?: string): void {
  if (!isInitialized || !config?.enabled || typeof window === 'undefined') {
    return;
  }

  window.gtag?.('event', 'page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title
  });
}

export function trackEvent(eventName: GtagEventName, params?: EventParams): void {
  if (!isInitialized || !config?.enabled || typeof window === 'undefined') {
    return;
  }

  if (window.gtag) {
    window.gtag('event', eventName, params);
  }

  if (config.debug) {
    console.log('Analytics event tracked:', eventName, params);
  }
}

export function trackUserInteraction(action: string, category: string, label?: string, value?: number): void {
  trackEvent(action, {
    category,
    label,
    value,
    nonInteraction: false
  });
}

export function trackButtonClick(buttonName: string, location: string, additionalParams?: GtagParams): void {
  trackEvent('button_click', {
    category: 'engagement',
    label: buttonName,
    location,
    ...additionalParams
  });
}

export function trackFormSubmission(formName: string, success: boolean, additionalParams?: GtagParams): void {
  trackEvent('form_submit', {
    category: 'form',
    label: formName,
    success,
    ...additionalParams
  });
}

export function trackSessionCreation(sessionId: string, additionalParams?: GtagParams): void {
  trackEvent('session_created', {
    category: 'session',
    label: sessionId,
    ...additionalParams
  });
}

export function trackDevicePairing(deviceType: string, success: boolean, additionalParams?: GtagParams): void {
  trackEvent('device_pairing', {
    category: 'device',
    label: deviceType,
    success,
    ...additionalParams
  });
}

export function trackHandoff(sessionId: string, fromDevice: string, toDevice: string, success: boolean): void {
  trackEvent('handoff', {
    category: 'handoff',
    label: `${fromDevice} -> ${toDevice}`,
    session_id: sessionId,
    success
  });
}

export function trackError(error: Error, context?: Record<string, unknown>): void {
  trackEvent('error', {
    category: 'error',
    label: error.message,
    error_name: error.name,
    error_stack: error.stack?.substring(0, 500),
    ...context
  });
}

export function trackPerformance(metricName: string, value: number, additionalParams?: GtagParams): void {
  trackEvent('performance_metric', {
    category: 'performance',
    label: metricName,
    value: Math.round(value),
    nonInteraction: true,
    ...additionalParams
  });
}

export function setUserProperties(properties: UserProperties): void {
  if (!isInitialized || !config?.enabled || typeof window === 'undefined') {
    return;
  }

  window.gtag?.('set', 'user_properties', properties);

  if (properties.userId) {
    window.gtag?.('config', config.measurementId, {
      user_id: properties.userId
    });
  }
}

export function setUserId(userId: string): void {
  setUserProperties({ userId });
}

export function disableAnalytics(): void {
  if (config) {
    config.enabled = false;
  }
  window.gtag?.('config', config?.measurementId || '', { 'send_page_view': false });
}

export function enableAnalytics(): void {
  if (config) {
    config.enabled = true;
  }
}

export function isAnalyticsEnabled(): boolean {
  return config?.enabled ?? true;
}

export function getConsent(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  const consent = localStorage.getItem('analytics_consent');
  return consent === 'true';
}

export function setConsent(granted: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem('analytics_consent', String(granted));

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied'
    });
  }
}

export function clearUserId(): void {
  if (!isInitialized || typeof window === 'undefined') {
    return;
  }

  if (config?.measurementId) {
    window.gtag?.('config', config.measurementId, {
      user_id: undefined
    });
  }
}
