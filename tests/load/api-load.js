import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const apiErrorRate = new Rate('api_errors');
const snapshotLatency = new Trend('snapshot_latency');
const concurrentRequests = new Counter('concurrent_requests');

export const options = {
  stages: [
    { duration: '2m', target: 100 },     // Ramp up
    { duration: '5m', target: 500 },     // Normal load
    { duration: '5m', target: 2000 },    // High load
    { duration: '5m', target: 5000 },    // Stress test
    { duration: '2m', target: 0 },       // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(50)<30', 'p(95)<50', 'p(99)<100'],
    http_req_failed: ['rate<0.001'],
    api_errors: ['rate<0.01'],
    snapshot_latency: ['p(95)<50'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';

export default function () {
  const vu = __VU;
  const iter = __ITER;

  group('Health Endpoint', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`);
    const duration = Date.now() - start;
    
    check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response time < 50ms': (r) => duration < 50,
    });

    if (res.status !== 200) {
      apiErrorRate.add(1);
    }
  });

  group('Create Snapshot - Small Payload', () => {
    const sessionId = `session-small-${vu}-${iter}`;
    const payload = JSON.stringify({
      session_id: sessionId,
      state_data: {
        counter: iter,
        user: `user-${vu}`,
      },
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    const duration = Date.now() - start;
    snapshotLatency.add(duration);

    check(res, {
      'small snapshot created': (r) => r.status === 200 || r.status === 201,
      'small snapshot time < 50ms': (r) => duration < 50,
    });

    if (res.status >= 400) {
      apiErrorRate.add(1);
    }
  });

  group('Create Snapshot - Medium Payload', () => {
    const sessionId = `session-medium-${vu}-${iter}`;
    const payload = JSON.stringify({
      session_id: sessionId,
      state_data: {
        user: {
          id: vu,
          name: `User ${vu}`,
          email: `user${vu}@test.com`,
          preferences: {
            theme: 'dark',
            language: 'en',
            notifications: true,
          },
        },
        items: Array(50).fill(0).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          value: Math.random() * 1000,
        })),
      },
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    const duration = Date.now() - start;
    snapshotLatency.add(duration);

    check(res, {
      'medium snapshot created': (r) => r.status === 200 || r.status === 201,
      'medium snapshot time < 50ms': (r) => duration < 50,
    });

    if (res.status >= 400) {
      apiErrorRate.add(1);
    }
  });

  group('Create Snapshot - Large Payload', () => {
    const sessionId = `session-large-${vu}-${iter}`;
    const payload = JSON.stringify({
      session_id: sessionId,
      state_data: {
        user: {
          id: vu,
          profile: {
            name: `User ${vu}`,
            bio: 'A'.repeat(1000),
            avatar: 'https://example.com/avatar.png',
          },
          settings: {
            theme: 'dark',
            notifications: {
              email: true,
              push: true,
              sms: false,
            },
            privacy: {
              publicProfile: false,
              showActivity: true,
            },
          },
        },
        data: Array(500).fill(0).map((_, i) => ({
          id: i,
          title: `Item ${i}`,
          description: 'Description '.repeat(50),
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            tags: ['tag1', 'tag2', 'tag3'],
          },
        })),
      },
    });

    const start = Date.now();
    const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    const duration = Date.now() - start;
    snapshotLatency.add(duration);

    check(res, {
      'large snapshot created': (r) => r.status === 200 || r.status === 201,
      'large snapshot time < 100ms': (r) => duration < 100,
    });

    if (res.status >= 400) {
      apiErrorRate.add(1);
    }
  });

  group('Get Snapshot', () => {
    const sessionId = `session-small-${vu}-${Math.max(0, iter - 1)}`;
    
    const start = Date.now();
    const res = http.get(`${BASE_URL}/session/${sessionId}`);
    const duration = Date.now() - start;

    check(res, {
      'snapshot retrieved or 404': (r) => r.status === 200 || r.status === 404,
      'get snapshot time < 30ms': (r) => duration < 30,
    });

    if (res.status >= 500) {
      apiErrorRate.add(1);
    }
  });

  group('Concurrent Snapshot Updates', () => {
    const sessionId = `session-concurrent-${vu}`;
    const requests = [];

    // Simulate 5 concurrent updates to same session
    for (let i = 0; i < 5; i++) {
      const payload = JSON.stringify({
        session_id: sessionId,
        state_data: {
          updateIndex: i,
          timestamp: Date.now(),
          vu: vu,
        },
      });

      requests.push(http.post(`${BASE_URL}/session/snapshot`, payload, {
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    concurrentRequests.add(5);

    // Check all requests completed
    const allCompleted = requests.every(r => r.status === 200 || r.status === 201);
    check(null, {
      'all concurrent updates completed': () => allCompleted,
    });

    if (!allCompleted) {
      apiErrorRate.add(1);
    }
  });

  sleep(Math.random() * 2); // Random sleep between 0-2 seconds
}

// Stress test with burst traffic
export function burstTest() {
  const sessionId = `burst-session-${__VU}-${Date.now()}`;
  
  // Rapid-fire requests
  for (let i = 0; i < 20; i++) {
    const payload = JSON.stringify({
      session_id: `${sessionId}-${i}`,
      state_data: { burst: true, index: i },
    });

    const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status >= 400) {
      apiErrorRate.add(1);
    }
  }

  sleep(0.1);
}
