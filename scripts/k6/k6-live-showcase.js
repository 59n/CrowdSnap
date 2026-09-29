/**
 * Live Wedding Guest Load Test for k6
 * Simulates real wedding guests arriving, viewing the gallery, uploading photos,
 * and fetching thumbnails simultaneously.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const EVENT_ID = __ENV.EVENT_ID || 'demo-event-id';

const uploadBytes = open('./test-photo.jpg', 'b');

export const options = {
  scenarios: {
    wedding_guests: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '5s',
      stages: [
        { duration: '10s', target: 10 }, // 10 guests arrive
        { duration: '15s', target: 30 }, // 30 guests uploading
        { duration: '20s', target: 50 }, // 50 concurrent guests snapping photos
        { duration: '10s', target: 15 }, // tapering off
        { duration: '5s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'], // >98% success rate
    'http_req_duration{name:guest_page}': ['p(95)<1500'],
    'http_req_duration{name:gallery}': ['p(95)<1000'],
    'http_req_duration{name:upload}': ['p(95)<4000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function guestFlow() {
  const deviceId = `guest-vu-${__VU}`;
  
  // 1. Visit wedding guest page
  const page = http.get(`${BASE_URL}/p/sm`, {
    tags: { name: 'guest_page' },
  });
  check(page, { 'page loaded (200)': (r) => r.status === 200 });

  sleep(0.5);

  // 2. Fetch gallery
  const gallery = http.get(`${BASE_URL}/api/p/${EVENT_ID}/uploads`, {
    headers: { 'x-device-id': deviceId },
    tags: { name: 'gallery' },
  });
  check(gallery, { 'gallery fetched (200)': (r) => r.status === 200 });

  // 3. Upload photo (1.2 MB realistic photo)
  const upload = http.post(
    `${BASE_URL}/api/upload/${EVENT_ID}`,
    {
      file: http.file(
        uploadBytes,
        `photo-${__VU}-${Date.now()}.jpg`,
        'image/jpeg'
      ),
    },
    {
      headers: { 'x-device-id': deviceId },
      tags: { name: 'upload' },
    }
  );
  check(upload, {
    'upload successful (200)': (r) => r.status === 200,
  });

  sleep(1);
}
