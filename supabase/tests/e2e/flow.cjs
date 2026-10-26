// E2E gegen den lokalen Supabase-Stack aus stack.sh (Postgres + PostgREST + Storage + Edge Runtime).
// Option B: Eltern ohne jede Supabase-Session. Start: supabase/tests/e2e/stack.sh up && … run
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const BASE = 'http://localhost:4173';
const STACK = process.env.STACK_DIR;
const ANON = fs.readFileSync(`${STACK}/keys.env`, 'utf8').match(/ANON=(.*)/)[1].trim();
const TA = 'E2eTripTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TB = 'E2eForeignTripBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const SHOTS = `${STACK}/shots`;
fs.mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execSync(`psql -h localhost -p 55432 -U postgres -d postgres -tAX -c "${q.replace(/"/g, '\\"')}"`, { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim();
const results = [];
const check = (cond, label) => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${label}`); console.log(results.at(-1)); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, name, errors, net) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
  page.on('request', (r) => { if (r.url().includes(':54321')) net.push(`[${name}] ${r.method()} ${r.url().replace(/\?.*/, '')} ${r.headers()['authorization'] ? 'AUTH:' + JSON.parse(Buffer.from(r.headers()['authorization'].split('.')[1] || 'e30', 'base64url')).role : ''}`); });
}
async function clickBtn(page, re, timeout = 15000) {
  const loc = page.locator('button:visible', { hasText: re }).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
}
async function makePhoto(page, hue) {
  const b64 = await page.evaluate((hue) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
    const g = c.getContext('2d'); g.fillStyle = `hsl(${hue},40%,55%)`; g.fillRect(0, 0, 1200, 1600);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(600, 700, 260, 0, 7); g.fill();
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, hue);
  return { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
async function toFirstChapter(page) {
  await clickBtn(page, /^Почнимо\.?$/, 20000);
  for (let i = 0; i < 12; i++) {
    await sleep(1200);
    if (await page.locator('input[type=file]').count()) return;
    const btn = page.locator('button:visible', { hasText: /Поглавље I\b|Окрените|Даље|Крените/ }).first();
    if (await btn.count()) await btn.click();
  }
  throw new Error('Kapitel 1 nicht erreicht');
}

(async () => {
  const errors = [], net = [];
  const browser = await chromium.launch();
  const iphone = devices['iPhone 14 Pro'];

  // ---------- Gerät A: Start, offline Foto aufnehmen
  const ctxA = await browser.newContext({ ...iphone });
  let a = await ctxA.newPage(); watch(a, 'A', errors, net);
  await a.goto(`${BASE}/trip/${TA}`);
  await toFirstChapter(a);
  await a.screenshot({ path: `${SHOTS}/e2e-01-chapter1.png` });
  check(sql("select count(*) from vienna.devices d join vienna.trips t on t.id=d.trip_id where t.label like 'Mama%'") === '1', 'Gerät A registriert (vienna.devices)');

  await ctxA.setOffline(true);
  await a.locator('input[type=file]').first().setInputFiles(await makePhoto(a, 30));
  await clickBtn(a, /Користи ову фотографију/);
  await sleep(2500);
  await a.screenshot({ path: `${SHOTS}/e2e-02-offline-photo.png` });
  check(sql("select count(*) from vienna.uploads") === '0', 'offline: noch kein Upload am Server');
  const queued = await a.evaluate(() => new Promise((res) => { const r = indexedDB.open('vienna-gift'); r.onsuccess = () => { try { const tx = r.result.transaction('photos'); const q = tx.objectStore('photos').getAllKeys(); q.onsuccess = () => res(q.result.map(String)); } catch { res([]); } }; r.onerror = () => res([]); }));
  check(queued.some((k) => k.includes('morning')), `Foto in IndexedDB-Queue (${queued.join(',')})`);

  // Safari schließen (Seite zu), später wieder online öffnen
  await a.close();
  await ctxA.setOffline(false);
  a = await ctxA.newPage(); watch(a, 'A2', errors, net);
  await a.goto(`${BASE}/trip/${TA}`);
  let uploaded = '0';
  for (let i = 0; i < 20 && uploaded === '0'; i++) { await sleep(1000); uploaded = sql("select count(*) from vienna.uploads where chapter_id='morning'"); }
  check(uploaded === '1', 'nach Wiederöffnen online: Foto hochgeladen und bestätigt');
  const path = sql("select storage_path from vienna.uploads where chapter_id='morning'");
  check(/^trips\/[0-9a-f-]{36}\/day\/morning-[0-9a-f]{32}\.jpg$/.test(path), `serverseitig erzeugter Pfad: ${path}`);
  check(sql(`select count(*) from storage.objects where bucket_id='vienna-day' and name='${path}'`) === '1', 'Datei liegt im privaten Bucket vienna-day');
  check(sql("select count(*) from vienna.upload_tickets where used_at is not null") === '1', 'Upload-Ticket eingelöst');
  await sleep(1500);
  await a.screenshot({ path: `${SHOTS}/e2e-03-after-reopen.png`, fullPage: false });

  // ---------- Gerät B: gleicher Trip, sieht Fortschritt + Foto
  const ctxB = await browser.newContext({ ...iphone });
  const b = await ctxB.newPage(); watch(b, 'B', errors, net);
  await b.goto(`${BASE}/trip/${TA}`);
  await sleep(4000);
  check(sql("select count(*) from vienna.devices d join vienna.trips t on t.id=d.trip_id where t.label like 'Mama%'") === '2', 'zweites Gerät registriert');
  check(sql("select array_to_string(completed_chapters, ',') from vienna.trips where label like 'Mama%'") === 'morning', 'Kapitel 1 am Server abgeschlossen');
  const bText = await b.locator('body').innerText();
  check(!/Почнимо\./.test(bText) || (await b.locator('button:visible', { hasText: /^Почнимо\.?$/ }).count()) === 0, 'Gerät B startet nicht bei null');
  await b.screenshot({ path: `${SHOTS}/e2e-04-device-b.png` });

  // ---------- Admin: Login-Session (E-Mail-User), Fotos sehen, Asset hochladen, Nachricht senden
  const token = execSync(`node ${__dirname}/jwt.mjs '${JSON.stringify({ sub: '99999999-9999-9999-9999-999999999999', email: 'admin@example.com', role: 'authenticated', aud: 'authenticated', is_anonymous: false })}'`).toString().trim();
  const ctxAdmin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxAdmin.addInitScript((tok) => {
    const session = { access_token: tok, refresh_token: 'x', token_type: 'bearer', expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000,
      user: { id: '99999999-9999-9999-9999-999999999999', email: 'admin@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
    localStorage.setItem('vienna:admin-auth', JSON.stringify(session));
  }, token);
  const ad = await ctxAdmin.newPage(); watch(ad, 'ADMIN', errors, net);
  await ad.goto(`${BASE}/admin`);
  await ad.getByText('Mama & Tata · Wien').first().waitFor({ timeout: 15000 });
  await sleep(2500);
  const imgs = await ad.locator('img[src*="vienna-day"]').count();
  check(imgs >= 1, `Admin sieht Tagesfoto (signierte URL aus vienna-day): ${imgs}`);
  const imgOk = await ad.locator('img[src*="vienna-day"]').first().evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false);
  check(imgOk, 'Tagesfoto im Admin lädt wirklich');
  check((await ad.locator('body').innerText()).includes('iPhone · Safari'), 'Admin sieht Geräte');
  // familyCurrent hochladen
  const tripA = ad.locator('section.admin__trip').filter({ has: ad.locator('h2', { hasText: 'Mama & Tata · Wien' }) });
  const famInput = tripA.locator('li.asset').filter({ hasText: /Heute|heute|familyCurrent|Familie/ }).first().locator('input[type=file]');
  const famPhoto = await makePhoto(ad, 140);
  await famInput.setInputFiles({ ...famPhoto, name: 'family.jpg' });
  let famPath = '';
  for (let i = 0; i < 15 && !famPath; i++) { await sleep(700); famPath = sql("select coalesce(storage_path,'') from vienna.assets where slot='familyCurrent'"); }
  check(famPath.startsWith(`trips/${sql("select id from vienna.trips where label like 'Mama%'")}/family/familyCurrent-`), `Admin-Asset gespeichert: ${famPath}`);
  check(sql(`select count(*) from storage.objects where bucket_id='vienna-memories' and name='${famPath}'`) === '1', 'Asset liegt in vienna-memories');
  await tripA.locator('textarea').first().fill('Видимо да сте преживели тенис 😄');
  await tripA.locator('button', { hasText: 'Senden' }).first().click();
  await sleep(1500);
  check(sql("select count(*) from vienna.messages") === '1', 'Nachricht gespeichert');
  await ad.screenshot({ path: `${SHOTS}/e2e-05-admin.png`, fullPage: true });

  // ---------- Gerät A bekommt Nachricht (Reload statt 30-s-Polling)
  await a.reload();
  await a.getByText('Видимо да сте преживели тенис').first().waitFor({ timeout: 15000 }).then(() => check(true, 'Live-Nachricht kommt auf Gerät A an'), () => check(false, 'Live-Nachricht kommt auf Gerät A an'));
  await a.screenshot({ path: `${SHOTS}/e2e-06-message.png` });

  // ---------- Signierte Lese-URL für Asset (Eltern, über Edge Function)
  const readRes = await a.evaluate(async ({ TA, famPath, path }) => {
    const r = await fetch('http://localhost:54321/functions/v1/vienna-media', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read-urls', token: TA, deviceId: localStorage.getItem('vienna:device-id'), paths: [famPath, path] }) });
    return { status: r.status, body: await r.json() };
  }, { TA, famPath, path });
  check(readRes.status === 200 && Object.keys(readRes.body.urls).length === 2, 'Eltern bekommen signierte URLs für eigenes Foto + Asset');

  // ---------- Fremder Trip / ungültiger Token / fremde Origin
  const foreign = await a.evaluate(async ({ TB, famPath, path }) => {
    const r = await fetch('http://localhost:54321/functions/v1/vienna-media', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read-urls', token: TB, deviceId: '0e6f6a3c-1b2d-4c5e-8f90-0000000000bb', paths: [famPath, path] }) });
    return r.json();
  }, { TB, famPath, path });
  check(Object.keys(foreign.urls ?? {}).length === 0, 'fremder Trip bekommt keine URLs für Trip-A-Dateien');
  const forged = await a.evaluate(async ({ TA, path }) => {
    const r = await fetch('http://localhost:54321/functions/v1/vienna-media', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm-upload', token: TA, deviceId: localStorage.getItem('vienna:device-id'), chapterId: 'spa', path: path.replace('morning-', 'spa-') }) });
    return r.status;
  }, { TA, path });
  check(forged === 400 || forged === 409, `frei gewählter Pfad wird nicht registriert (${forged})`);
  const direct = await a.evaluate(async ({ ANON }) => {
    const r = await fetch('http://localhost:54321/storage/v1/object/vienna-day/trips/x/day/evil.jpg', { method: 'POST', headers: { 'content-type': 'image/jpeg', apikey: ANON, authorization: `Bearer ${ANON}` }, body: 'x' });
    return r.status;
  }, { ANON });
  check(direct >= 400, `direkter Storage-Upload ohne Ticket abgelehnt (${direct})`);
  const evilOrigin = execSync(`curl -s -o /dev/null -w '%{http_code}' -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{"action":"read-urls","token":"${TA}","deviceId":"0e6f6a3c-1b2d-4c5e-8f90-000000000001","paths":["${path}"]}' http://localhost:54321/functions/v1/vienna-media`).toString();
  check(evilOrigin === '403', `fremde Origin → 403 (${evilOrigin})`);

  const ctxC = await browser.newContext({ ...iphone });
  const c = await ctxC.newPage(); watch(c, 'C', errors, net);
  const invalidBodies = [];
  c.on('response', async (r) => { if (r.url().includes('vienna_join_trip')) invalidBodies.push(await r.text()); });
  await c.goto(`${BASE}/trip/WrongTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`);
  await c.getByText('Овај линк није важећи.').waitFor({ timeout: 15000 }).then(() => check(true, 'ungültiger Token → neutrale Fehlerseite'), () => check(false, 'ungültiger Token → neutrale Fehlerseite'));
  check(invalidBodies.every((t) => !/trip|label|Mama|phase/i.test(t.replace(/invalid_token/, ''))), `Antwort verrät nichts: ${invalidBodies[0]}`);
  await c.screenshot({ path: `${SHOTS}/e2e-07-invalid.png` });
  const cD = await ctxC.newPage(); watch(cD, 'D', errors, net);
  await cD.goto(`${BASE}/trip/${TB}`);
  await sleep(3500);
  check((await cD.locator('img[src^="blob:"]').count()) === 0 && !(await cD.locator('body').innerText()).includes('Видимо да сте'), 'Gerät auf fremdem Trip sieht weder Fotos noch Nachrichten von Trip A');

  // ---------- PDF auf Gerät A (Debug-Sprung zum Finale, echtes Foto vom Server)
  await a.goto(`${BASE}/trip/${TA}?debug=true`); await sleep(3000);
  await a.locator('button[aria-label="Debug öffnen"]').click();
  await a.locator('.debug button', { hasText: 'Album / PDF' }).click();
  await sleep(2000);
  await a.locator('button[aria-label="Debug schließen"]').click();
  await sleep(1500);
  await a.screenshot({ path: `${SHOTS}/e2e-08-finale-home.png` });
  await clickBtn(a, /Направите нашу успомену/, 20000);
  const link = a.getByRole('link', { name: /Преузмите успомену/ });
  await link.waitFor({ timeout: 60000 });
  const [dl] = await Promise.all([a.waitForEvent('download'), link.click()]);
  await dl.saveAs(`${SHOTS}/e2e-memory.pdf`);
  const pdfSize = fs.statSync(`${SHOTS}/e2e-memory.pdf`).size;
  check(pdfSize > 100000, `PDF erzeugt (${Math.round(pdfSize / 1024)} KB)`);

  // ---------- Reset (nur mit VIENNA_ALLOW_RESET=true)
  await a.locator('button[aria-label="Debug öffnen"]').click();
  a.once('dialog', (d) => d.accept());
  await a.locator('.debug__danger').click();
  await sleep(4000);
  check(sql("select count(*) from vienna.uploads") === '0' && sql("select count(*) from storage.objects where bucket_id='vienna-day'") === '0', 'Reset: Tagesfotos aus DB und Bucket entfernt');
  check(sql("select count(*) from storage.objects where bucket_id='vienna-memories'") === '1', 'Reset: Familien-Asset bleibt');
  check(sql("select phase from vienna.trips where label like 'Mama%'") === 'opening', 'Reset: Trip wieder am Anfang');
  // Gerät B hatte noch den alten Stand offen → darf ihn NICHT zurückspielen.
  await b.reload(); await sleep(5000);
  check(sql("select phase || '/' || cardinality(completed_chapters) from vienna.trips where label like 'Mama%'") === 'opening/0', 'altes Gerät B spielt den Stand vor dem Reset nicht zurück');
  check(!(await b.locator('body').innerText()).includes('ПОГЛАВЉЕ 2'), 'Gerät B zeigt wieder den Anfang');
  await b.screenshot({ path: `${SHOTS}/e2e-09-device-b-after-reset.png` });

  // ---------- Keine Session, keine Auth-Requests der Eltern
  const parentNet = net.filter((n) => /^\[(A|A2|B|C|D)\]/.test(n));
  check(!parentNet.some((n) => n.includes('/auth/v1')), 'Eltern-Geräte rufen nie /auth/v1 auf (keine Anonymous Sign-ins)');
  check(!parentNet.some((n) => /AUTH:(authenticated|service_role)/.test(n)), 'Eltern-Requests nie als authenticated/service_role');
  const ls = await a.evaluate(() => Object.keys(localStorage));
  check(!ls.some((k) => k.includes('auth')), `keine Auth-Session im localStorage der Eltern (${ls.join(',')})`);

  console.log('\nCONSOLE ERRORS:', JSON.stringify(errors, null, 1));
  console.log('\n' + results.join('\n'));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
