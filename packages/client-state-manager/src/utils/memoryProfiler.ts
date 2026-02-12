/**
 * Memory profiling utilities for performance optimization
 * Week 4: Performance Optimization
 */

export interface MemorySnapshot {
  timestamp: number;
  usedHeapSize: number;
  totalHeapSize: number;
  heapSizeLimit: number;
  usagePercentage: number;
}

export interface MemoryLeakReport {
  hasPotentialLeak: boolean;
  growthRate: number;
  snapshots: MemorySnapshot[];
  recommendation: string;
}

/**
 * Check if performance.memory API is available (Chrome/V8 only)
 */
function isMemoryAPIAvailable(): boolean {
  return typeof performance !== 'undefined' && 
         'memory' in performance &&
         performance.memory !== undefined;
}

/**
 * Take a memory snapshot
 */
export function takeMemorySnapshot(): MemorySnapshot | null {
  if (!isMemoryAPIAvailable()) {
    return null;
  }

  const memory = (performance as unknown as { memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  }}).memory;

  return {
    timestamp: Date.now(),
    usedHeapSize: memory.usedJSHeapSize,
    totalHeapSize: memory.totalJSHeapSize,
    heapSizeLimit: memory.jsHeapSizeLimit,
    usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
  };
}

/**
 * Simple memory profiler that tracks heap usage over time
 */
export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots: number;
  private checkInterval: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(options: { maxSnapshots?: number; checkIntervalMs?: number } = {}) {
    this.maxSnapshots = options.maxSnapshots ?? 50;
    this.checkInterval = options.checkIntervalMs ?? 5000;
  }

  /**
   * Start monitoring memory usage
   */
  start(): void {
    if (this.intervalId || !isMemoryAPIAvailable()) return;

    this.intervalId = setInterval(() => {
      const snapshot = takeMemorySnapshot();
      if (snapshot) {
        this.addSnapshot(snapshot);
      }
    }, this.checkInterval);
  }

  /**
   * Stop monitoring memory usage
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Add a snapshot to the history
   */
  private addSnapshot(snapshot: MemorySnapshot): void {
    this.snapshots.push(snapshot);
    
    // Keep only the most recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Get all recorded snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Analyze snapshots for potential memory leaks
   */
  analyzeForLeaks(): MemoryLeakReport {
    if (this.snapshots.length < 2) {
      return {
        hasPotentialLeak: false,
        growthRate: 0,
        snapshots: this.snapshots,
        recommendation: 'Need more snapshots to analyze',
      };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const timeDiff = last.timestamp - first.timestamp;
    const sizeDiff = last.usedHeapSize - first.usedHeapSize;
    
    // Calculate growth rate in bytes per minute
    const growthRate = timeDiff > 0 ? (sizeDiff / timeDiff) * 60000 : 0;
    
    // Flag as potential leak if growing more than 1MB per minute
    const hasPotentialLeak = growthRate > 1024 * 1024;

    let recommendation = 'Memory usage appears stable';
    if (hasPotentialLeak) {
      recommendation = `Potential memory leak detected: growing at ${formatBytes(growthRate)}/min. Check for uncleared event listeners or caches.`;
    } else if (growthRate > 0) {
      recommendation = `Memory growing slowly at ${formatBytes(growthRate)}/min. Monitor for patterns.`;
    }

    return {
      hasPotentialLeak,
      growthRate,
      snapshots: this.snapshots,
      recommendation,
    };
  }

  /**
   * Get current memory status
   */
  getCurrentStatus(): MemorySnapshot | null {
    return takeMemorySnapshot();
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots = [];
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.clear();
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Check for common memory leak patterns
 */
export function checkMemoryLeakPatterns(): { warnings: string[] } {
  const warnings: string[] = [];

  if (!isMemoryAPIAvailable()) {
    warnings.push('Memory API not available - cannot perform detailed leak detection');
    return { warnings };
  }

  const snapshot = takeMemorySnapshot();
  if (!snapshot) {
    return { warnings };
  }

  // Check heap usage
  if (snapshot.usagePercentage > 90) {
    warnings.push(`High memory usage: ${snapshot.usagePercentage.toFixed(1)}% of heap limit`);
  } else if (snapshot.usagePercentage > 70) {
    warnings.push(`Elevated memory usage: ${snapshot.usagePercentage.toFixed(1)}% of heap limit`);
  }

  return { warnings };
}
