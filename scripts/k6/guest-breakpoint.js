/**
 * Guest breakpoint test, shaped like the k6 ramp in
 * "How Many Users Can a $12 Server Handle?".
 *
 * One virtual user is one guest:
 *   open the event page, check their gallery, upload one photo, pause.
 *
 * The run ramps concurrency until a threshold fails, then stops.
 * Point it at a throwaway event with relaxSecurity on, not a real wedding.
 *
 *   k6 run scripts/k6/guest-breakpoint.js
 *   BASE_URL=https://foto.thenas.us EVENT_ID=k6guestload01 k6 run scripts/k6/guest-breakpoint.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const EVENT_ID = __ENV.EVENT_ID || 'k6guestload01';

const uploadPath = __ENV.UPLOAD_FILE || './pixel.png';
const uploadBytes = open(uploadPath, 'b');
const uploadIsJpeg = uploadPath.endsWith('.jpg') || uploadPath.endsWith('.jpeg');

export const options = {
  scenarios: {
    guests: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '10s',
      stages: [
        { duration: '15s', target: 25 },
        { duration: '15s', target: 50 },
        { duration: '20s', target: 100 },
        { duration: '25s', target: 100 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '15s' },
    ],
    'http_req_duration{name:guest_page}': [
      { threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '20s' },
    ],
    'http_req_duration{name:gallery}': [
      { threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '20s' },
    ],
    'http_req_duration{name:upload}': [
      { threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '20s' },
    ],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function guestFlow() {
  const deviceId = `k6-vu-${__VU}`;
  const page = http.get(`${BASE_URL}/p/${EVENT_ID}`, {
    tags: { name: 'guest_page' },
  });
  check(page, { 'page 200': (r) => r.status === 200 });

  sleep(1);

  const gallery = http.get(`${BASE_URL}/api/p/${EVENT_ID}/uploads`, {
    headers: { 'x-device-id': deviceId },
    tags: { name: 'gallery' },
  });
  check(gallery, { 'gallery 200': (r) => r.status === 200 });

  const upload = http.post(
    `${BASE_URL}/api/upload/${EVENT_ID}`,
    {
      file: http.file(
        uploadBytes,
        `k6-${__VU}-${__ITER}.${uploadIsJpeg ? 'jpg' : 'png'}`,
        uploadIsJpeg ? 'image/jpeg' : 'image/png'
      ),
    },
    {
      headers: { 'x-device-id': deviceId },
      tags: { name: 'upload' },
      timeout: '30s',
    }
  );
  check(upload, { 'upload 200': (r) => r.status === 200 });

  sleep(2);
}
