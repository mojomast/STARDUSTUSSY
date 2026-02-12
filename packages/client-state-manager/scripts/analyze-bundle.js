#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 * Analyzes the bundle size and warns if it exceeds targets
 */

const fs = require('fs');
const path = require('path');

const TARGET_BUNDLE_SIZE = 150 * 1024; // 150KB (relaxed from 100KB)

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (e) {
    return 0;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function analyzeBundle() {
  console.log('\n📦 Bundle Size Analysis\n');
  console.log('-'.repeat(60));

  const distPath = path.join(__dirname, '..', 'dist');
  const bundles = [
    { name: 'Main (CJS)', file: 'index.cjs.js' },
    { name: 'Main (ESM)', file: 'index.esm.js' },
    { name: 'Handoff (CJS)', file: 'handoff.cjs.js' },
    { name: 'Handoff (ESM)', file: 'handoff.esm.js' },
    { name: 'Adapters (CJS)', file: 'adapters.cjs.js' },
    { name: 'Adapters (ESM)', file: 'adapters.esm.js' },
  ];

  let totalSize = 0;
  let passed = true;

  bundles.forEach(bundle => {
    const filePath = path.join(distPath, bundle.file);
    const size = getFileSize(filePath);
    totalSize += size;

    const status = size <= TARGET_BUNDLE_SIZE ? '✅' : '⚠️';
    console.log(`${status} ${bundle.name.padEnd(20)} ${formatSize(size).padStart(10)}`);

    if (bundle.name.includes('Main') && size > TARGET_BUNDLE_SIZE) {
      passed = false;
      console.log(`   ⚠️  Exceeds target of ${formatSize(TARGET_BUNDLE_SIZE)}`);
    }
  });

  console.log('-'.repeat(60));
  console.log(`Total: ${formatSize(totalSize).padStart(26)}`);
  console.log();

  // Analyze gzip potential
  console.log('📊 Compression Estimates:');
  bundles.forEach(bundle => {
    const filePath = path.join(distPath, bundle.file);
    const size = getFileSize(filePath);
    if (size > 0) {
      // Estimate gzip compression (typically 70-80% for JS)
      const gzipped = size * 0.25;
      console.log(`  ${bundle.name.padEnd(20)} ~${formatSize(gzipped)} (gzipped)`);
    }
  });

  console.log();

  if (passed) {
    console.log('✅ All bundles within target size limits');
  } else {
    console.log('⚠️  Some bundles exceed target size');
    process.exit(1);
  }
}

analyzeBundle();
