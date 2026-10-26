// Mini-Gateway (ersetzt Kong lokal): /rest/v1 → PostgREST, /storage/v1 → Storage, /functions/v1 → Edge Runtime.
import http from 'node:http';
const routes = [
  ['/rest/v1', 'http://127.0.0.1:53000', true],
  ['/storage/v1', 'http://127.0.0.1:55000', true],
  ['/functions/v1/vienna-media', 'http://127.0.0.1:59000', false],
];
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-upsert, cache-control, prefer, accept-profile, content-profile, range, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers': 'content-range, content-length, content-type',
};
http.createServer((req, res) => {
  const route = routes.find(([p]) => req.url.startsWith(p));
  if (!route) { res.writeHead(404); return res.end(); }
  const [prefix, target, addCors] = route;
  if (addCors && req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(target + (req.url.slice(prefix.length) || '/'));
  const headers = { ...req.headers, host: url.host };
  if (prefix === '/functions/v1/vienna-media') headers['x-forwarded-for'] = req.socket.remoteAddress;
  const up = http.request(url, { method: req.method, headers }, (r) => {
    const h = { ...r.headers };
    if (addCors) Object.assign(h, cors);
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, addCors ? cors : {}); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, () => console.log('gateway :54321'));
