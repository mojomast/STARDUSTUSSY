import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics, getConsent } from './lib/analytics'
import { initPerformanceMonitoring } from './lib/performance'
import { initABTesting } from './lib/ab-testing'

const consent = getConsent()

if (consent) {
  initAnalytics({
    measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX',
    enabled: true,
    debug: import.meta.env.DEV,
    anonymizeIp: true
  })
}

initPerformanceMonitoring()

initABTesting({
  debug: import.meta.env.DEV
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
