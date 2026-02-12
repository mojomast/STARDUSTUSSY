import { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface TestMetrics {
  scenario: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
}

class PerformanceReporter implements Reporter {
  private metrics: TestMetrics[] = [];
  private startTime: number = 0;

  onBegin(config: FullConfig, suite: Suite) {
    this.startTime = Date.now();
    console.log('\n🚀 Starting Week 3 Multi-Device Test Suite\n');
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const scenario = test.titlePath()[0] || 'Unknown';
    this.metrics.push({
      scenario,
      duration: result.duration,
      status: result.status,
    });
  }

  onEnd(result: FullResult) {
    const totalDuration = Date.now() - this.startTime;
    
    // Calculate statistics
    const passed = this.metrics.filter(m => m.status === 'passed').length;
    const failed = this.metrics.filter(m => m.status === 'failed').length;
    const skipped = this.metrics.filter(m => m.status === 'skipped').length;
    const avgDuration = this.metrics.reduce((a, b) => a + b.duration, 0) / this.metrics.length;
    
    // Group by scenario
    const scenarios = this.metrics.reduce((acc, m) => {
      if (!acc[m.scenario]) {
        acc[m.scenario] = { passed: 0, failed: 0, total: 0 };
      }
      acc[m.scenario].total++;
      if (m.status === 'passed') acc[m.scenario].passed++;
      if (m.status === 'failed') acc[m.scenario].failed++;
      return acc;
    }, {} as Record<string, { passed: number; failed: number; total: number }>);
    
    // Print summary
    console.log('\n📊 Test Results Summary');
    console.log('======================\n');
    
    console.log(`Total Tests: ${this.metrics.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`\nAverage Duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);
    
    console.log('By Scenario:');
    console.log('-'.repeat(60));
    for (const [scenario, stats] of Object.entries(scenarios)) {
      const status = stats.failed === 0 ? '✅' : '❌';
      console.log(`${status} ${scenario.padEnd(40)} ${stats.passed}/${stats.total}`);
    }
    console.log();
    
    // Save to file
    const reportDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.metrics.length,
        passed,
        failed,
        skipped,
        avgDuration,
        totalDuration,
      },
      scenarios,
      metrics: this.metrics,
    };
    
    fs.writeFileSync(
      path.join(reportDir, 'performance-metrics.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`📄 Performance metrics saved to: reports/performance-metrics.json\n`);
    
    if (failed === 0) {
      console.log('✨ All tests passed!\n');
    } else {
      console.log(`⚠️  ${failed} test(s) failed\n`);
    }
  }
}

export default PerformanceReporter;
