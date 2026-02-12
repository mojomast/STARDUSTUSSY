import { trackPerformance } from './analytics';

interface MetricData {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}



type MetricCallback = (metric: MetricData) => void;

const callbacks: Set<MetricCallback> = new Set();
const metricsData: Map<string, MetricData> = new Map();

const thresholds = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  LCP_LOAD: { good: 2500, poor: 4000 }
};

function getRating(value: number, metricName: keyof typeof thresholds): 'good' | 'needs-improvement' | 'poor' {
  const threshold = thresholds[metricName];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function onMetric(metric: MetricData): void {
  metricsData.set(metric.name, metric);
  trackPerformance(metric.name, metric.value, { rating: metric.rating });

  callbacks.forEach(callback => callback(metric));
}

export function observeLCP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEntry[];
        const lastEntry = entries[entries.length - 1] as { startTime: number };

      onMetric({
        name: 'LCP',
        value: lastEntry.startTime,
        rating: getRating(lastEntry.startTime, 'LCP')
      });
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    console.warn('LCP observation not supported:', e);
  }
}

export function observeFID(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceEntry[];
      for (const entry of entries) {
        const inputEntry = entry as { processingStart: number };
        const fid = inputEntry.processingStart - entry.startTime;
        onMetric({
          name: 'FID',
          value: fid,
          rating: getRating(fid, 'FID')
        });
      }
    });

    observer.observe({ type: 'first-input', buffered: true });
  } catch (e) {
    console.warn('FID observation not supported:', e);
  }
}

export function observeCLS(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  let clsValue = 0;
  let sessionValue = 0;
  let sessionEntries: PerformanceEntry[] = [];

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutEntry = entry as { hadRecentInput?: boolean; value?: number };
        if (!layoutEntry.hadRecentInput) {
          const firstSessionEntry = sessionEntries[0];
          const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

          if (
            sessionValue &&
            entry.startTime - lastSessionEntry.startTime < 1000 &&
            entry.startTime - firstSessionEntry.startTime < 5000
          ) {
            sessionValue += layoutEntry.value ?? 0;
            sessionEntries.push(entry);
          } else {
            sessionValue = layoutEntry.value ?? 0;
            sessionEntries = [entry];
          }

          if (sessionValue > clsValue) {
            clsValue = sessionValue;
            onMetric({
              name: 'CLS',
              value: clsValue,
              rating: getRating(clsValue, 'CLS')
            });
          }
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    console.warn('CLS observation not supported:', e);
  }
}

export function observeFCP(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          onMetric({
            name: 'FCP',
            value: entry.startTime,
            rating: getRating(entry.startTime, 'FCP')
          });
          observer.disconnect();
        }
      }
    });

    observer.observe({ type: 'paint', buffered: true });
  } catch (e) {
    console.warn('FCP observation not supported:', e);
  }
}

export function observeTTFB(): void {
  if (typeof window.performance === 'undefined') return;

  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

  if (navigationEntry) {
    const ttfb = navigationEntry.responseStart - navigationEntry.requestStart;
    onMetric({
      name: 'TTFB',
      value: ttfb,
      rating: getRating(ttfb, 'TTFB')
    });
  }
}

export function observeResourceTiming(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];

      const resourcesByType = entries.reduce((acc, entry) => {
        const type = entry.initiatorType;
        if (!acc[type]) acc[type] = [];
        acc[type].push({
          name: entry.name,
          duration: entry.duration,
          size: entry.transferSize
        });
        return acc;
      }, {} as Record<string, Array<{ name: string; duration: number; size: number }>>);

      Object.entries(resourcesByType).forEach(([type, resources]) => {
        const totalDuration = resources.reduce((sum, r) => sum + r.duration, 0);
        const avgDuration = totalDuration / resources.length;
        const totalSize = resources.reduce((sum, r) => sum + r.size, 0);

        trackPerformance(`resource_${type}`, avgDuration, {
          count: resources.length,
          total_size: totalSize,
          total_duration: totalDuration
        });
      });
    });

    observer.observe({ type: 'resource', buffered: true });
  } catch (e) {
    console.warn('Resource timing observation not supported:', e);
  }
}

export function observeLongTasks(): void {
  if (typeof PerformanceObserver === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          trackPerformance('long_task', entry.duration, {
            start_time: entry.startTime
          });
        }
      });

    observer.observe({ type: 'longtask', buffered: true });
  } catch (e) {
    console.warn('Long tasks observation not supported:', e);
  }
}

export function measureRenderTime(componentName: string): () => void {
  const startTime = performance.now();

  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    trackPerformance('render_time', duration, { component: componentName });
  };
}

export function measureFunctionTime<T extends (...args: unknown[]) => unknown>(
  fn: T,
  name: string
): T {
  return ((...args: Parameters<T>) => {
    const startTime = performance.now();
    const result = fn(...args);
    const endTime = performance.now();

    trackPerformance('function_execution', endTime - startTime, {
      function_name: name
    });

    return result;
  }) as T;
}

export async function measureAsyncTime<T>(
  promise: Promise<T>,
  name: string
): Promise<T> {
  const startTime = performance.now();
  const result = await promise;
  const endTime = performance.now();

  trackPerformance('async_execution', endTime - startTime, {
    operation: name
  });

  return result;
}

export function onMetricUpdate(callback: MetricCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

export function getMetric(name: string): MetricData | undefined {
  return metricsData.get(name);
}

export function getAllMetrics(): Map<string, MetricData> {
  return new Map(metricsData);
}

export function getMetricsSummary(): {
  metrics: Record<string, MetricData>;
  overallRating: 'good' | 'needs-improvement' | 'poor';
} {
  const metrics: Record<string, MetricData> = {};
  const ratings: string[] = [];

  metricsData.forEach((value, key) => {
    metrics[key] = value;
    ratings.push(value.rating);
  });

  const poorCount = ratings.filter(r => r === 'poor').length;
  const needsImprovementCount = ratings.filter(r => r === 'needs-improvement').length;

  let overallRating: 'good' | 'needs-improvement' | 'poor' = 'good';
  if (poorCount > 0) {
    overallRating = 'poor';
  } else if (needsImprovementCount > 0) {
    overallRating = 'needs-improvement';
  }

  return { metrics, overallRating };
}

export function initPerformanceMonitoring(): void {
  if (typeof window === 'undefined') return;

  observeLCP();
  observeFID();
  observeCLS();
  observeFCP();
  observeTTFB();
  observeResourceTiming();
  observeLongTasks();
}

export function trackCustomMetric(name: string, value: number, metadata?: Record<string, string | number | boolean>): void {
  onMetric({
    name,
    value,
    rating: 'good'
  });

  if (metadata) {
    trackPerformance(name, value, metadata);
  }
}

export function measureNetworkRequest(url: string, method: string): {
  end: () => void;
} {
  const startTime = performance.now();

  return {
    end: () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      trackPerformance('network_request', duration, {
        url,
        method
      });
    }
  };
}
