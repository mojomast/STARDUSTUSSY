async function globalTeardown() {
  console.log('\n🧹 Test Suite Teardown\n');
  
  // Generate summary report
  const fs = require('fs');
  const path = require('path');
  
  const reportsDir = path.join(process.cwd(), 'reports');
  const summaryFile = path.join(reportsDir, 'test-summary.json');
  
  if (fs.existsSync(summaryFile)) {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
    
    console.log('Test Run Summary:');
    console.log(`  Total: ${summary.total}`);
    console.log(`  Passed: ${summary.passed}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Duration: ${(summary.duration / 1000).toFixed(2)}s\n`);
  }
  
  console.log('✅ Teardown complete\n');
}

export default globalTeardown;
