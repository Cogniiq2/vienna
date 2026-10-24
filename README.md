# Беч · 27. октобар 2026.

Ein privates Geschenk von Đorđe, Bogdana und Lazar an Mama und Tata: ein Tag in Wien, der sich Kapitel für Kapitel enthüllt –
dazwischen Seiten aus dem Familienalbum, am Abend ein Brief, ein Video, drei Stimmen und eine stille Bonus-Sequenz.
Am Ende entsteht ein kleines Familien-Reisejournal als PDF. Am Mittwochmorgen folgt ein ruhiger Epilog.

- **Sprache:** Serbisch (Kyrillisch) als Standard, Deutsch per `СР | DE`. „Јел’ знате?“ wird nie übersetzt und nie erklärt.
- **Stack:** Vite + React 19 + TypeScript (strict), Supabase (Postgres, Storage, Auth, Realtime), pdf-lib
- **Hosting:** Cloudflare Pages (statisch, SPA)

---

## Ablauf

```
Opening („Јел’ знате?“ → „За маму и тату.“) → Intro (Brief)
→ ♡ Gradski Klub → I Frühstück → ♡ Hochzeit → II Gym → ♡ Aus zwei wurden fünf
→ III Wien → IV Vienna Open → ♡ Was ihr aufgebaut habt → V Sauna → VI Dinner
→ „Имамо још нешто.“ + Brief → Video & drei Stimmen → „Још нешто. Само за вас двоје.“ (Bonus, Vollbild)
→ „Ваш дан.“ (Album + PDF) → Mittwoch: Epilog „Још мало Беча.“
```
♡ = Memory Interlude (Album-Seiten ohne Aufgaben). Fehlt ein Foto, wird nur das Bild weggelassen – nie ein leerer Rahmen.

## Wo trage ich was ein?

| Was | Wo |
|---|---|
| Namen, Familienfotos, Video, Audios, Musik | `src/config/family.ts` (bzw. Upload im Admin) |
| Hotel, Tickets, Restaurant, Uhrzeiten, Epilog-Orte | `src/config/trip.ts` |
| Alle Texte | `src/content/sr.ts`, `src/content/de.ts` |
| Ablauf/Fragen pro Kapitel | `src/config/chapters.ts` |

### Familienfotos, Video, Audios – empfohlen: im Admin hochladen
`/admin` → „Familien-Assets (privat)“ → je Slot „hochladen“:

| Slot | Inhalt |
|---|---|
| Gradski Klub | altes Foto als junges Paar |
| Hochzeit | Hochzeitsfoto |
| Kinder klein / Urlaub | frühes Familienfoto |
| Familie heute | aktuelles Foto mit allen fünf (kommt kurz vor Schluss) |
| Mama & Tata heute | optional; sonst wird das heutige Dinner-Foto genommen |
| Familienvideo + Vorschaubild | mp4/mov (Größe ≤ Supabase-Dateilimit, Free-Plan 50 MB) |
| Sprachnachricht Đorđe / Bogdana / Lazar | m4a/mp3 |

Dateien liegen im **privaten** Bucket `family`; die Eltern bekommen nur kurzlebige signierte Links. Kein Code-Änderung nötig.
Bildunterschrift/Jahr/Ort der alten Fotos: `family.memoryAssets.<slot>.caption | year | location`.
Abschriften (Barrierefreiheit): `family.familyMessages[].transcript`, `family.familyVideo.transcript`, Untertitel `captionsSrc`.
Alternativ (nur lokal/Demo): `src` auf eine URL setzen – Dateien in `/public` sind aber öffentlich.

### Musik
`family.music.morning | spa | finale = { title, artist, spotifyUrl, appleMusicUrl, youtubeUrl }`.
Nur Streaming-Links, kein Autoplay, leere Einträge werden nicht angezeigt.

### Noch offen in `trip.ts`
Hoteladresse, Vienna-Open-Arena/Plätze/Ticket-Link, Restaurant (italienisch – Name, Adresse, Uhrzeit, Reservierungsname),
optionale Kapitel-Uhrzeiten, 2–3 Epilog-Orte (`epilogue.locations`). Fehlende Werte zeigen „Биће допуњено“.

---

## Supabase

### Migrationen (beide, in dieser Reihenfolge, im SQL-Editor oder per `supabase db push`)
1. `supabase/migrations/20261024000000_vienna_gift.sql` – Grundschema (falls noch nicht ausgeführt)
2. `supabase/migrations/20261025000000_story_admin_messages.sql` – Story-Fortschritt, Admin, Nachrichten, Familien-Assets, Realtime

Beide sind idempotent. Lokal testbar: `PGHOST=… PGPORT=… supabase/tests/run.sh` (leeres Postgres 16).

### Einstellungen im Dashboard
1. **Authentication → Sign In / Providers:** „Allow anonymous sign-ins“ **an** (Eltern-Geräte), **Email** an.
2. **Authentication → URL Configuration:** Site URL = deine Pages-URL; unter Redirect URLs `https://<deine-domain>/admin` (und `http://localhost:5173/admin`) eintragen.
3. **Optional, empfohlen:** Authentication → Email Templates → „Magic Link“: `{{ .Token }}` in den Text aufnehmen. Dann kannst du dich auch per 6-stelligem Code anmelden (praktisch, wenn der Link im Mail-App-Browser statt in Safari aufgeht).
4. **Admin-User anlegen:** Authentication → Users → „Add user“ → „Send invitation“ / „Create new user“ mit deiner E-Mail.
5. **Admin freischalten (SQL-Editor):**
   ```sql
   insert into private.admins (email) values ('deine@mail.de');
   ```
6. Trip anlegen (falls noch nicht): `npm run trip:create -- https://<projekt>.pages.dev` → ausgegebenes SQL ausführen.

### Sicherheitsmodell
- Eltern: anonyme Session pro Gerät, Zugang nur über den geheimen Trip-Link (DB speichert nur den SHA-256-Hash).
- Tabellen sind für Clients gesperrt; Schreiben nur über `SECURITY DEFINER`-Funktionen mit Mitgliedschafts- bzw. Admin-Prüfung.
- Admin = E-Mail-Login **und** Eintrag in `private.admins` (in der DB geprüft; anonyme Sessions können nie Admin sein).
  Admin liest per RLS-Policies (nötig für Realtime); `token_hash` bleibt auch für Admins unsichtbar.
- Fotos (`memories`) und Familien-Assets (`family`): private Buckets, Zugriff nur für Mitglieder des Trips bzw. Admins, nur signierte URLs.
- Kein Service-Role-Key im Browser, kein Passwort im Bundle. `/admin` ist nicht verlinkt, aber die Sicherheit hängt nicht an der URL.

---

## Admin-Dashboard (`/admin`)

- **Login:** E-Mail eingeben → Magic Link (oder Code) → nur Adressen aus `private.admins` kommen rein.
- **Live:** Supabase Realtime auf `uploads`, `responses`, `messages`, `trip_members`, `trips` + Fallback-Polling alle 20 s.
  Neue Fotos erscheinen ohne Neuladen (Anzeige „Live“ oben rechts).
- **Zeigt:** aktuellen Schritt, erledigte Kapitel, Start/Ende, letzten Sync, aktive Geräte, alle Fotos mit Aufnahme- und Upload-Zeit (Original per signiertem Link), alle Antworten.
- **Nachricht an Mama & Tata:** Text (+ optional Herz) → „Senden“. Erscheint bei den Eltern beim nächsten Sync (≤ 30 s, beim Öffnen sofort) als kleine Karte „Порука од нас.“ – keine Push-Benachrichtigung, keine Browser-Rechte. Gelesen/ungelesen ist im Dashboard sichtbar.
- **Familien-Assets:** hochladen, ersetzen, ansehen, entfernen.
- Demo ohne Server (nur Dev/Preview): `/admin?demo=1`.

## Epilog
Erscheint ab `trip.epilogue.availableFrom` (Mi 28.10., 06:00 Wiener Zeit) oben auf „Ваш дан.“. Keine Mission, keine Fotos:
optionale Orte mit „Покажи пут“ und die Frage „Шта носите кући са овог путовања?“. Danach „Ажурирајте успомену“ – das PDF wird mit der Antwort neu erzeugt.
Wurde das PDF schon Dienstag erstellt, einfach am Mittwoch neu erzeugen.

## ENV-Variablen
Keine neuen. Weiterhin `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_ENABLE_DEBUG` (nur Preview). Siehe `.env.example`.

## Lokal testen & Debug
```bash
npm install && npm run dev
# http://localhost:5173/trip/demo?debug=true   (ohne Supabase, alles lokal)
```
Debug-Panel („DBG“): zu jedem Schritt springen (Opening, Intro, alle Interludes ♡, K1–K6, Finale-Stationen, Album/PDF, Epilog),
Fotos + alle Antworten simulieren, Familienfotos/Audios/Video simulieren (nur im Speicher), Live-Nachricht simulieren,
Admin mit Demo-Daten öffnen, alles zurücksetzen.

## Testdaten zurücksetzen
- **Empfohlen:** Trip-Link mit `?debug=true` (lokal oder Preview) → DBG → „Reset alles“ (Fortschritt, Antworten, Nachrichten, Tagesfotos – **Familien-Assets bleiben**).
- **SQL:** `select public.admin_reset_trip('<token>');` (zusätzlich Geräte-Zuordnungen), danach Tagesfotos unter Storage → `memories/<trip_id>` löschen.

## Cloudflare Pages
Build `npm run build`, Output `dist`, `NODE_VERSION=22`. SPA-Routing funktioniert ohne `_redirects` (keine `404.html`).
`public/_headers`: noindex, CSP (erlaubt `*.supabase.co` für API, Realtime, signierte Bilder/Video/Audio), no-referrer.

## Qualität
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
