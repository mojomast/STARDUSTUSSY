import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const wsConnectionErrors = new Rate('ws_connection_errors');
const wsLatency = new Trend('ws_latency');
const messageDeliveryRate = new Rate('message_delivery_rate');

export const options = {
  stages: [
    { duration: '1m', target: 100 },    // Ramp up to 100 connections
    { duration: '3m', target: 1000 },   // Ramp up to 1000 connections
    { duration: '5m', target: 10000 },  // Ramp up to 10k connections
    { duration: '5m', target: 10000 },  // Stay at 10k for 5 minutes
    { duration: '2m', target: 0 },      // Ramp down
  ],
  thresholds: {
    ws_connection_errors: ['rate<0.01'],     // Less than 1% connection errors
    ws_latency: ['p(95)<100'],               // 95% of messages under 100ms
    message_delivery_rate: ['rate>0.99'],    // 99% message delivery
    http_req_duration: ['p(95)<50'],         // API response under 50ms
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws';

export default function () {
  group('API Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 50ms': (r) => r.timings.duration < 50,
    });
  });

  group('Snapshot Operations', () => {
    const sessionId = `session-${__VU}-${__ITER}`;
    const payload = JSON.stringify({
      session_id: sessionId,
      state_data: {
        user: `user-${__VU}`,
        data: Array(10).fill(0).map((_, i) => ({ id: i, value: `test-${i}` })),
      },
    });

    // Create snapshot
    const createRes = http.post(`${BASE_URL}/session/snapshot`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    check(createRes, {
      'snapshot created': (r) => r.status === 200 || r.status === 201,
      'snapshot creation time < 50ms': (r) => r.timings.duration < 50,
    });

    // Get snapshot
    const getRes = http.get(`${BASE_URL}/session/${sessionId}`);
    check(getRes, {
      'snapshot retrieved': (r) => r.status === 200,
      'snapshot retrieval time < 30ms': (r) => r.timings.duration < 30,
    });
  });

  sleep(1);
}

// WebSocket load test scenario
export function wsLoadTest() {
  const ws = new WebSocket(WS_URL);
  let connected = false;
  let messagesSent = 0;
  let messagesReceived = 0;

  ws.onopen = () => {
    connected = true;
    
    // Send authentication
    ws.send(JSON.stringify({
      type: 7,
      payload: {
        token: generateTestToken(),
      },
      timestamp: Date.now(),
    }));
  };

  ws.onmessage = (event) => {
    messagesReceived++;
    const data = JSON.parse(event.data);
    
    if (data.type === 8) { // AuthSuccess
      // Send heartbeat
      setInterval(() => {
        const startTime = Date.now();
        ws.send(JSON.stringify({
          type: 1,
          payload: { client_time: startTime },
          timestamp: startTime,
        }));
      }, 30000);

      // Send state updates
      setInterval(() => {
        messagesSent++;
        ws.send(JSON.stringify({
          type: 5,
          payload: {
            key: 'test',
            value: Math.random(),
          },
          timestamp: Date.now(),
        }));
      }, 1000);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    wsConnectionErrors.add(1);
  };

  ws.onclose = () => {
    connected = false;
  };

  // Run for 5 minutes
  sleep(300);

  ws.close();

  // Check message delivery rate
  const deliveryRate = messagesReceived / messagesSent;
  messageDeliveryRate.add(deliveryRate);

  return {
    connected,
    messagesSent,
    messagesReceived,
    deliveryRate,
  };
}

function generateTestToken() {
  // Generate a simple JWT for testing
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    user_id: `user-${__VU}`,
    session_id: `session-${__VU}-${__ITER}`,
    device_id: `device-${__VU}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  const signature = 'test-signature';
  return `${header}.${payload}.${signature}`;
}
