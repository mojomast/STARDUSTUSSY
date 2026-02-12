import { chromium, Browser } from '@playwright/test';

async function globalSetup() {
  console.log('\n🔧 Week 3 Test Suite Setup\n');
  
  // Verify staging environment is accessible
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
  
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    console.log(`Checking environment: ${baseUrl}`);
    const response = await page.goto(baseUrl, { timeout: 30000 });
    
    if (response?.status() === 200) {
      console.log('✅ Staging environment is ready\n');
    } else {
      console.warn(`⚠️  Environment returned status: ${response?.status()}`);
    }
    
    await browser.close();
  } catch (error) {
    console.error('❌ Failed to connect to staging environment:', error);
    console.log('Continuing with tests...\n');
  }
  
  // Ensure reports directory exists
  const fs = require('fs');
  const path = require('path');
  const reportsDir = path.join(process.cwd(), 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  console.log('✅ Setup complete\n');
}

export default globalSetup;
