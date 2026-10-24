# Беч · 27. октобар 2026.

Eine private, interaktive Geschenk-Experience für Mama & Papa: Ein Tag in Wien, der sich Kapitel für Kapitel enthüllt.
Am Ende steht automatisch ein Erinnerungs-PDF mit ihren Fotos und Antworten.

- **Sprache:** Serbisch (Kyrillisch) als Standard, Deutsch per Umschalter (`СР | DE`, gespeichert, ohne Reload)
- **Stack:** Vite + React 19 + TypeScript (strict), Supabase (Postgres, Storage, anonyme Auth), pdf-lib
- **Hosting:** Cloudflare Pages (statisch, SPA)

---

## Architektur

```
src/
  config/trip.ts        ← ALLE Reisedaten (Hotel, Tickets, Restaurant, Uhrzeiten). Hier pflegen.
  config/chapters.ts    ← Ablauf der 6 Kapitel (Foto Pflicht?, Kamera, Info-Karte, Fragen)
  content/sr.ts, de.ts  ← ALLE Texte (i18n). Typ: content/types.ts. Test prüft gleiche Struktur.
  state/tripStore.ts    ← Zustand + Sync-Engine (local first, Server = Source of Truth)
  lib/backend/          ← Supabase-Anbindung bzw. lokaler Fallback
  lib/photoStore.ts     ← IndexedDB-Queue für Fotos (Offline / Stadion)
  lib/image.ts          ← Clientseitige Kompression (max. 2000 px, JPEG 86 %)
  pdf/generateMemory.ts ← Echtes PDF-Layout (200 × 250 mm), Fonts eingebettet (Kyrillisch)
  components/           ← Opening, Intro, Journey/ChapterView, PhotoCapture, FinalReveal, MemoryGenerator …
supabase/migrations/    ← Komplettes Schema, RPC-Funktionen, RLS, Storage-Bucket + Policies
public/_headers         ← noindex, CSP, Referrer-Policy für Cloudflare
public/fonts/pdf/       ← TTF-Fonts fürs PDF (auf Latein + Kyrillisch reduziert, OFL)
```

### Datenfluss
1. Jede Aktion wird **sofort lokal** gespeichert (localStorage + IndexedDB) → nichts geht verloren, Seite reagiert sofort.
2. Danach Sync zum Server. Fortschritt wird **monoton** zusammengeführt (Kapitel nur hinzufügen, Phasen nur vorwärts) → Mama und Papa können parallel auf zwei Handys arbeiten.
3. Fehlgeschlagene Uploads bleiben „pending“ und werden automatisch erneut gesendet (`online`-Event, Tab-Rückkehr, alle 15 s).

### Sicherheit
- Kein Login. Zugang nur über `/trip/<token>` (192 Bit Zufall). In der DB liegt nur der **SHA-256-Hash**.
- Jedes Gerät bekommt automatisch eine **anonyme Supabase-Session**; `join_trip(token)` verknüpft sie mit dem Trip.
- Tabellen sind für Clients **komplett gesperrt** (RLS ohne Policies, keine Grants). Alle Zugriffe über `SECURITY DEFINER`-Funktionen mit Mitgliedschaftsprüfung.
- Fotos im **privaten** Bucket `memories`, Zugriff per RLS nur auf den eigenen Trip-Ordner. Kein öffentliches Listing, keine öffentlichen URLs.
- Kein Service-Role-Key im Frontend. `noindex` per Meta + Header + robots.txt. `Referrer-Policy: no-referrer` (Token leakt nicht).

---

## 1. ENV-Variablen

Siehe `.env.example`:

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `VITE_SUPABASE_URL` | ja (sonst lokaler Modus) | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ja (sonst lokaler Modus) | anon/publishable Key (öffentlich, nie service_role) |
| `VITE_ENABLE_DEBUG` | nein | `true` nur für Preview-Deployments |

Fehlen die Supabase-Werte, crasht nichts: die App läuft komplett lokal auf dem Gerät (inkl. PDF).

## 2. Supabase einrichten (einmalig, ~10 Minuten)

1. Projekt anlegen (Region z. B. Frankfurt).
2. **Authentication → Sign In / Providers → „Allow anonymous sign-ins“ aktivieren.** (Ohne das funktioniert der Server-Sync nicht.)
3. **SQL Editor** → Inhalt von `supabase/migrations/20261024000000_vienna_gift.sql` einfügen und ausführen
   (oder per CLI: `supabase link` + `supabase db push`). Das Skript ist idempotent.
4. Trip anlegen:
   ```bash
   npm run trip:create -- https://<dein-projekt>.pages.dev
   ```
   Das ausgegebene `select public.create_trip(...)` im SQL-Editor ausführen. Den ausgegebenen Link bekommen die Eltern.
5. URL + anon Key in Cloudflare (und lokal in `.env.local`) eintragen.

## 3. Was in `src/config/trip.ts` noch fehlt

Alles mit `null` / `TODO`. Fehlende Werte zeigen „Биће допуњено / Wird noch ergänzt“ — nichts wird erfunden.

- **Hotel:** `name`, `address`, `mapsUrl`, optional `gymNotes`, `spaNotes`
- **Vienna Open:** `venue`, `venueAddress`, `session` (nur bestätigte Spieler/Matches), `entryTime`, `startTime`, `departureTime`, `seatInfo`, `ticketUrl` oder `ticketPdf`, `navigationUrl`, `notes`
- **Restaurant:** `name`, `address`, `reservationTime`, `reservationName`, `navigationUrl`, `notes`
- **Optional:** `chapterTimes` (Uhrzeit pro Kapitel), `family.children` (Namen unter der Signatur)

Ohne `navigationUrl` wird aus der Adresse automatisch ein Google-Maps-Link gebaut.
Texte ändern: `src/content/sr.ts` und `de.ts` (der Test `npm test` meldet, wenn eine Sprache einen Key nicht hat).

> ⚠️ Dateien in `/public` (z. B. ein Ticket-PDF) sind öffentlich abrufbar – nur mit kryptischem Dateinamen, besser `ticketUrl` verwenden. Ist das Git-Repo öffentlich, landen auch die Config-Daten dort.

## 4. Lokal testen

```bash
npm install
npm run dev
# ohne Supabase:      http://localhost:5173/trip/demo?debug=true
# mit Supabase:       .env.local anlegen, dann http://localhost:5173/trip/<token>?debug=true
```

Auf dem echten Handy im selben WLAN: `npm run dev -- --host` und die angezeigte IP öffnen
(Kamera-`capture` funktioniert über `http://` im LAN; für vollen Test besser das Preview-Deployment nutzen).

## 5. Debug-Modus

- **Dev-Server:** `?debug=true` an die URL hängen → kleiner „DBG“-Button unten rechts.
- **Preview-Deployment:** `VITE_ENABLE_DEBUG=true` nur in der *Preview*-Umgebung von Cloudflare setzen, dann ebenfalls `?debug=true`.
- **Production:** Panel ist nicht im Bundle aktivierbar (ohne `VITE_ENABLE_DEBUG`).

Funktionen: zu Opening / Intro / Kapitel 1–6 / Finale springen, Foto für aktuelles Kapitel oder alle Fotos + Antworten simulieren, PDF testen (Finale → „Направите нашу успомену“), alles zurücksetzen.
`?debug=false` blendet es in der Sitzung wieder aus.

## 6. Testdaten zurücksetzen (vor Dienstag!)

**Variante A – empfohlen (inkl. Fotos):** Trip-Link mit `?debug=true` auf einem Preview-Deployment oder lokal öffnen → DBG → „Reset alles“.
Löscht Fortschritt, Antworten, Upload-Einträge **und** die Fotodateien im Storage sowie den lokalen Stand dieses Geräts.

**Variante B – SQL (z. B. aus der Ferne):**
```sql
select public.admin_reset_trip('<token>');
```
Setzt Fortschritt/Antworten/Uploads zurück und entfernt alle Gerätezuordnungen. Danach im Dashboard
**Storage → memories → Ordner `<trip_id>`** löschen. Auf Testgeräten zusätzlich Website-Daten löschen
(oder Variante A nutzen), da der lokale Stand sonst beim nächsten Öffnen wieder hochgeladen wird.

**Ganz frisch:** einfach mit `npm run trip:create` einen neuen Token erzeugen und den alten Trip in `public.trips` löschen.

## 7. Cloudflare Pages

1. Repo verbinden → Framework preset **Vite** (bzw. „None“)
2. **Build command:** `npm run build`
3. **Build output directory:** `dist`
4. **Environment variables** (Production *und* Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; nur Preview: `VITE_ENABLE_DEBUG=true`
5. Node-Version: ≥ 20.19 (z. B. `NODE_VERSION=22` setzen)

SPA-Routing/Deep-Links: Cloudflare Pages liefert automatisch `index.html` für unbekannte Pfade, solange **keine `404.html`** existiert – deshalb gibt es bewusst kein `_redirects` (`/* /index.html 200` wird von Pages als Endlosschleife ignoriert).
Header (noindex, CSP, Cache) kommen aus `public/_headers`. Bei einer eigenen Supabase-Domain die `connect-src` in der CSP anpassen.

## 8. Qualität

```bash
npm run lint       # ESLint (typed rules)
npm run typecheck  # tsc strict
npm test           # Vitest: Fortschritts-Merge, Offline-Queue, i18n-Parität, PDF-Layout, Utils
npm run build
```
