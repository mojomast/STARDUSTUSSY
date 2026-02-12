import { PerformanceMetrics } from './types';

export class PerformanceMetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTimer(label: string): void {
    this.startTimes.set(label, performance.now());
  }

  endTimer(label: string): number {
    const startTime = this.startTimes.get(label);
    if (startTime === undefined) {
      throw new Error(`Timer '${label}' was not started`);
    }
    
    const duration = performance.now() - startTime;
    this.recordMetric(label, duration);
    this.startTimes.delete(label);
    
    return duration;
  }

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  getAverage(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  getMin(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    return Math.min(...values);
  }

  getMax(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    return Math.max(...values);
  }

  getPercentile(name: string, percentile: number): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAllMetrics(): Record<string, { avg: number; min: number; max: number; p95: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; p95: number; count: number }> = {};
    
    for (const [name, values] of this.metrics) {
      result[name] = {
        avg: this.getAverage(name),
        min: this.getMin(name),
        max: this.getMax(name),
        p95: this.getPercentile(name, 95),
        count: values.length,
      };
    }
    
    return result;
  }

  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
  }

  async measureMemoryUsage(): Promise<number> {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
      const memory = (window.performance as any).memory;
      return memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  generateReport(): string {
    const allMetrics = this.getAllMetrics();
    let report = '# Performance Metrics Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    for (const [name, stats] of Object.entries(allMetrics)) {
      report += `## ${name}\n`;
      report += `- Average: ${stats.avg.toFixed(2)}ms\n`;
      report += `- Min: ${stats.min.toFixed(2)}ms\n`;
      report += `- Max: ${stats.max.toFixed(2)}ms\n`;
      report += `- P95: ${stats.p95.toFixed(2)}ms\n`;
      report += `- Sample Count: ${stats.count}\n\n`;
    }
    
    return report;
  }

  assertBudget(metricName: string, budget: number): void {
    const avg = this.getAverage(metricName);
    if (avg > budget) {
      throw new Error(
        `Performance budget exceeded for '${metricName}': ${avg.toFixed(2)}ms > ${budget}ms`
      );
    }
  }
}

export const performanceBudgets = {
  handoffLatency: 100,        // 100ms
  stateTransfer: 500,         // 500ms
  syncLatency: 1000,          // 1s
  conflictResolution: 2000,   // 2s
  pageLoad: 3000,             // 3s
  reconnection: 5000,         // 5s
};
