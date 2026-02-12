import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Gauge } from 'k6/metrics';

// Performance benchmark metrics
const wsLatency = new Trend('websocket_latency_ms');
const apiLatency = new Trend('api_latency_ms');
const memoryUsage = new Gauge('memory_usage_mb');
const connectionPoolUsage = new Gauge('connection_pool_usage');
const throughput = new Rate('requests_per_second');

export const options = {
  scenarios: {
    websocket_benchmark: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      exec: 'websocketBenchmark',
    },
    api_benchmark: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'apiBenchmark',
    },
    memory_profile: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '5m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
      exec: 'memoryProfile',
    },
  },
  thresholds: {
    websocket_latency_ms: ['p(50)<10', 'p(95)<50', 'p(99)<100'],
    api_latency_ms: ['p(50)<20', 'p(95)<50', 'p(99)<100'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';

// WebSocket Latency Benchmark
export function websocketBenchmark() {
  const ws = new WebSocket(WS_URL);
  let latencyMeasurements = [];

  ws.onopen = () => {
    // Authenticate
    ws.send(JSON.stringify({
      type: 7,
      payload: { token: generateTestToken() },
      timestamp: Date.now(),
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const now = Date.now();

    if (data.type === 2) { // HeartbeatAck
      const latency = now - data.payload.client_time;
      latencyMeasurements.push(latency);
      wsLatency.add(latency);
    }

    if (data.type === 8) { // AuthSuccess
      // Start sending heartbeats for latency measurement
      setInterval(() => {
        ws.send(JSON.stringify({
          type: 1,
          payload: { client_time: Date.now() },
          timestamp: Date.now(),
        }));
      }, 1000);
    }
  };

  // Run for 60 seconds
  sleep(60);
  
  ws.close();

  // Report statistics
  const avgLatency = latencyMeasurements.reduce((a, b) => a + b, 0) / latencyMeasurements.length;
  console.log(`WebSocket Avg Latency: ${avgLatency.toFixed(2)}ms`);
}

// API Response Time Benchmark
export function apiBenchmark() {
  group('Snapshot Creation Benchmark', () => {
    const sizes = ['small', 'medium', 'large'];
    
    for (const size of sizes) {
      const sessionId = `bench-${size}-${__VU}-${Date.now()}`;
      const payload = generatePayload(size);
      
      const start = Date.now();
      const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      const latency = Date.now() - start;
      
      apiLatency.add(latency);
      throughput.add(1);
      
      check(res, {
        [`${size} snapshot created`]: (r) => r.status === 200 || r.status === 201,
        [`${size} latency < 50ms`]: (r) => latency < 50,
      });
    }
  });

  group('Health Check Benchmark', () => {
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/health`);
      const latency = Date.now() - start;
      
      apiLatency.add(latency);
      
      check(res, {
        'health check fast': (r) => latency < 20,
      });
    }
  });

  group('Snapshot Retrieval Benchmark', () => {
    const sessionId = `bench-retrieve-${__VU}`;
    
    // Create snapshot first
    http.post(`${BASE_URL}/session/snapshot`, JSON.stringify({
      session_id: sessionId,
      state_data: { test: true },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    // Benchmark retrievals
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      const res = http.get(`${BASE_URL}/session/${sessionId}`);
      const latency = Date.now() - start;
      
      apiLatency.add(latency);
      
      check(res, {
        'retrieval fast': (r) => latency < 30,
      });
    }
  });

  sleep(1);
}

// Memory Usage Profile
export function memoryProfile() {
  const connections = [];
  const maxConnections = 10;

  group('Connection Pool Test', () => {
    // Create multiple connections
    for (let i = 0; i < maxConnections; i++) {
      const ws = new WebSocket(WS_URL);
      connections.push(ws);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 7,
          payload: { token: generateTestToken() },
          timestamp: Date.now(),
        }));
      };
    }

    connectionPoolUsage.add(connections.length);
    
    // Hold connections
    sleep(30);
    
    // Close all
    connections.forEach(ws => ws.close());
  });

  group('Memory Growth Test', () => {
    const sessionIds = [];
    
    // Create many snapshots to test memory usage
    for (let i = 0; i < 100; i++) {
      const sessionId = `mem-test-${__VU}-${i}`;
      sessionIds.push(sessionId);
      
      const payload = JSON.stringify({
        session_id: sessionId,
        state_data: {
          data: Array(100).fill(0).map((_, j) => ({
            id: j,
            value: 'x'.repeat(100),
          })),
        },
      });

      const res = http.post(`${BASE_URL}/session/snapshot`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      check(res, {
        'snapshot created': (r) => r.status === 200 || r.status === 201,
      });

      if (i % 10 === 0) {
        memoryUsage.add((i + 1) * 0.1); // Estimate memory growth
      }
    }

    sleep(5);
  });
}

function generatePayload(size) {
  const payloads = {
    small: {
      session_id: `bench-small-${__VU}`,
      state_data: { counter: __ITER },
    },
    medium: {
      session_id: `bench-medium-${__VU}`,
      state_data: {
        user: { id: __VU, name: `User ${__VU}` },
        items: Array(50).fill(0).map((_, i) => ({ id: i, value: i * 10 })),
      },
    },
    large: {
      session_id: `bench-large-${__VU}`,
      state_data: {
        user: {
          id: __VU,
          profile: { bio: 'A'.repeat(500) },
        },
        data: Array(200).fill(0).map((_, i) => ({
          id: i,
          content: 'Content '.repeat(20),
          metadata: { tags: ['a', 'b', 'c'] },
        })),
      },
    },
  };

  return JSON.stringify(payloads[size]);
}

function generateTestToken() {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    user_id: `user-${__VU}`,
    session_id: `session-${__VU}-${__ITER}`,
    device_id: `device-${__VU}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  return `${header}.${payload}.signature`;
}
