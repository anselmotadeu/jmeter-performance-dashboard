/**
 * Gera fixtures de performance (JMeter e k6) em vários cenários e durações.
 *
 * Cenários: calm, mid, chaos, spike
 * Durações: 1h, 2h, 4h, 6h
 * Formatos : k6 (ndjson e csv) e JMeter (.jtl)
 *
 * Uso: node scripts/generate-performance-fixtures.mjs [formato ...]
 * Ex.: node scripts/generate-performance-fixtures.mjs k6-csv jmeter
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'Tests', 'fixtures');

const ENDPOINTS = [
  { name: '/api/orders', weight: 0.22 },
  { name: '/api/cart', weight: 0.18 },
  { name: '/api/catalog', weight: 0.24 },
  { name: '/api/login', weight: 0.14 },
  { name: '/api/checkout', weight: 0.12 },
  { name: '/api/status', weight: 0.1 },
];

// Seedable RNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0xc0ffee);
const pickEndpoint = () => {
  const r = rand();
  let acc = 0;
  for (const ep of ENDPOINTS) {
    acc += ep.weight;
    if (r <= acc) return ep.name;
  }
  return ENDPOINTS[0].name;
};

// Models time in [0,1] -> { dur(ms), err(0..1), spike }
function scenarioProfile(scenario, t) {
  switch (scenario) {
    case 'calm':
      return {
        baseDur: 80 + rand() * 120,            // 80-200ms
        err: 0.002,
        vusFactor: Math.sin(Math.PI * t),       // ramp up e down suave
        spike: 0,
      };
    case 'mid':
      return {
        baseDur: 200 + rand() * 500 + 150 * Math.sin(t * Math.PI * 6), // 200-700ms com ondulação
        err: 0.03 + 0.02 * Math.sin(t * Math.PI * 4),
        vusFactor: 0.6 + 0.4 * Math.sin(Math.PI * t) + 0.1 * Math.sin(t * Math.PI * 3),
        spike: 0,
      };
    case 'chaos':
      return {
        baseDur: rand() < 0.25 ? 500 + rand() * 15000 : 100 + rand() * 400, // rajadas até segundos
        err: 0.08 + rand() * 0.2,
        vusFactor: 0.3 + rand() * 0.9,
        spike: 0,
      };
    case 'spike':
      return {
        baseDur: 120 + rand() * 80,            // geralmente calmo
        err: 0.005,
        vusFactor: Math.sin(Math.PI * t),
        spike: t => (Math.abs((t * 6) % 1 - 0.5) < 0.06 ? 1 : 0), // picos periódicos
      };
    default:
      return { baseDur: 200, err: 0.05, vusFactor: 0.6, spike: 0 };
  }
}

function pickEndpointError(rand) {
  const status = rand() < 0.6 ? '500' : rand() < 0.5 ? '503' : '404';
  const message = status === '500' ? 'Internal Server Error'
    : status === '503' ? 'Service Unavailable' : 'Not Found';
  return { status, message };
}

function phaseBreakdown(total, rand) {
  const blocked = total * (0.001 + rand() * 0.02);
  const connecting = total * (0.005 + rand() * 0.03);
  const sending = total * (0.02 + rand() * 0.08);
  const waiting = total * (0.5 + rand() * 0.3);
  const receiving = Math.max(0, total - blocked - connecting - sending - waiting);
  return { blocked, connecting, sending, waiting, receiving };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function iso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, '0')}Z`;
}

function buildTimeline(scenario, hours, maxRequests, rand, minReq = 1) {
  const startMs = Date.parse('2025-10-09T08:00:00Z');
  const durationSec = hours * 3600;
  const seconds = [];
  const peakVus = scenario === 'calm' ? 400 : scenario === 'mid' ? 800 : scenario === 'chaos' ? 1200 : 900;

  for (let s = 0; s < durationSec; s++) {
    const t = s / durationSec;
    const prof = scenarioProfile(scenario, t);
    const spike = prof.spike === 0 ? 0 : prof.spike(t);
    const vus = Math.round(peakVus * prof.vusFactor * (spike ? 1.2 : 1));
    seconds.push({ startMs: startMs + s * 1000, vus, prof, spike, raw: 0 });
  }
  let totalRaw = 0;
  for (const sec of seconds) {
    sec.raw = sec.spike ? sec.vus * 0.08 : sec.vus * 0.02;
    totalRaw += sec.raw;
  }
  const floorTotal = minReq * seconds.length;
  const scale = totalRaw > 0 ? Math.max(0, Math.min(1, (maxRequests - floorTotal) / totalRaw)) : 0;
  for (const sec of seconds) {
    sec.requests = minReq + Math.floor(sec.raw * scale);
  }
  return { seconds, startMs, durationSec };
}

function emitRequest(rand, sec, endpoint) {
  const prof = sec.prof;
  const error = rand() < prof.err || (sec.spike && rand() < 0.2);
  let total = Math.max(1, prof.baseDur * (sec.spike ? 4 + rand() * 10 : 1));
  const phases = phaseBreakdown(total, rand);
  const status = error ? pickEndpointError(rand) : { status: '200', message: 'OK' };
  const method = endpoint.includes('login') || endpoint.includes('checkout') ? 'POST' : 'GET';
  const timestamp = sec.startMs;
  return {
    timestamp,
    endpoint,
    method,
    total: Math.round(total),
    ...phases,
    success: !error,
    status: status.status,
    message: status.message,
    expected: error ? 'false' : 'true',
    errorText: error ? status.message : undefined,
  };
}

function writeLines(file, header, lines) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(file, header + lines.join('\n'), 'utf8');
  const size = fs.statSync(file).size;
  console.log(`  ${path.basename(file)}  ${(size / 1024 / 1024).toFixed(2)} MB`);
  return size;
}

const tagStr = (req) =>
  `{"name":"${req.endpoint}","method":"${req.method}","status":"${req.status}","expected_response":"${req.expected}"}`;

function generateK6Ndjson(scenario, hours) {
  const rand = rng(Math.abs(hash(`${scenario}-${hours}-nd`)));
  const maxRequests = 2500;
  const { seconds } = buildTimeline(scenario, hours, maxRequests, rand, 0);
  const lines = [];
  for (const sec of seconds) {
    lines.push(`{"type":"Point","metric":"vus","data":{"time":"${iso(sec.startMs)}","value":${sec.vus},"tags":{}}}`);
    for (let i = 0; i < sec.requests; i++) {
      const req = emitRequest(rand, sec, pickEndpoint());
      const tags = tagStr(req);
      const metric = (m, v) => `{"type":"Point","metric":"${m}","data":{"time":"${iso(req.timestamp)}","value":${v},"tags":${tags}}}`;
      lines.push(metric('http_req_duration', req.total));
      lines.push(metric('http_req_blocked', req.blocked));
      lines.push(metric('http_req_connecting', req.connecting));
      lines.push(metric('http_req_sending', req.sending));
      lines.push(metric('http_req_waiting', req.waiting));
      lines.push(metric('http_req_receiving', req.receiving));
      lines.push(metric('http_req_failed', req.success ? 0 : 1));
    }
  }
  const file = path.join(OUT_DIR, `k6-${scenario}-${hours}h.ndjson`);
  return writeLines(file, '', lines);
}

function generateK6Csv(scenario, hours) {
  const rand = rng(Math.abs(hash(`${scenario}-${hours}-csv`)));
  const maxRequests = 6000;
  const { seconds } = buildTimeline(scenario, hours, maxRequests, rand, 0);
  const rows = [];
  const header = 'metric_name,metric_value,timestamp,name,method,status,expected_response,error,error_code,check\n';
  for (const sec of seconds) {
    rows.push(`vus,${sec.vus},${sec.startMs},,,,,,,`);
    for (let i = 0; i < sec.requests; i++) {
      const req = emitRequest(rand, sec, pickEndpoint());
      const meta = [req.endpoint, req.method, req.status, req.expected, req.errorText ?? '', req.success ? '' : req.status].join(',');
      const ref = (m, v, ok) => `${m},${Number(v.toFixed(3))},${req.timestamp},${meta},${ok}`;
      rows.push(`http_req_duration,${req.total},${req.timestamp},${meta},success`);
      rows.push(`http_req_blocked,${req.blocked},${req.timestamp},${meta},success`);
      rows.push(`http_req_connecting,${req.connecting},${req.timestamp},${meta},success`);
      rows.push(`http_req_sending,${req.sending},${req.timestamp},${meta},success`);
      rows.push(`http_req_waiting,${req.waiting},${req.timestamp},${meta},success`);
      rows.push(`http_req_receiving,${req.receiving},${req.timestamp},${meta},success`);
      rows.push(`http_req_failed,${req.success ? 0 : 1},${req.timestamp},${meta},success`);
      rows.push(`checks,${req.success ? 1 : 0},${req.timestamp},${req.endpoint},GET,200,true,,,HTTP status is 200`);
    }
  }
  const file = path.join(OUT_DIR, `k6-${scenario}-${hours}h.csv`);
  return writeLines(file, header, rows);
}

function generateJmeter(scenario, hours) {
  const rand = rng(Math.abs(hash(`${scenario}-${hours}-jtl`)));
  const maxRequests = 26000;
  const { seconds } = buildTimeline(scenario, hours, maxRequests, rand, 1);
  const header =
    'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect\n';
  const rows = [];
  for (const sec of seconds) {
    for (let i = 0; i < sec.requests; i++) {
      const req = emitRequest(rand, sec, pickEndpoint());
      const success = req.success ? 'true' : 'false';
      const ecode = req.success ? '200' : req.status;
      const emsg = req.success ? '' : req.message;
      rows.push(
        `${req.timestamp},${req.total},${req.endpoint},${ecode},${emsg},thread-${(i % 50) + 1},text,${success},${emsg},0,0,${sec.vus},${sec.vus},http://api.example.com${req.endpoint},${Math.round(req.waiting)},0,${Math.round(req.connecting)}`,
      );
    }
  }
  const file = path.join(OUT_DIR, `jmeter-${scenario}-${hours}h.jtl`);
  return writeLines(file, header, rows);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const formats = process.argv.slice(2).length ? process.argv.slice(2) : ['k6-csv', 'k6-ndjson', 'jmeter'];

const jobs = {
  'k6-csv': [['calm', 1], ['calm', 6], ['mid', 2], ['chaos', 1], ['chaos', 6], ['spike', 2], ['spike', 4]],
  'k6-ndjson': [['calm', 1], ['chaos', 1], ['spike', 1]],
  jmeter: [['calm', 1], ['calm', 4], ['mid', 2], ['chaos', 1], ['chaos', 6], ['spike', 2]],
};

console.log(`Gerando fixtures em ${OUT_DIR}`);
let totalBytes = 0;
for (const format of formats) {
  const list = jobs[format] ?? [];
  for (const [scenario, hours] of list) {
    const size = format === 'k6-csv'
      ? generateK6Csv(scenario, hours)
      : format === 'k6-ndjson'
        ? generateK6Ndjson(scenario, hours)
        : generateJmeter(scenario, hours);
    totalBytes += size;
  }
}
console.log(`Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);