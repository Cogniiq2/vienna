# Беч · 27. октобар 2026.

Ein privates Geschenk von Đorđe, Bogdana und Lazar an Mama und Tata: ein Tag in Wien, Kapitel für Kapitel,
am Abend ein Brief und ein stiller Abschluss, danach ein Album als PDF. Am Mittwochmorgen ein ruhiger Epilog.
Eine Familiengeschichte („Ваша прича.“) mit alten Fotos, Video und Stimmen erscheint automatisch, sobald ihr
das Material im Admin hochladet.

- **Sprache:** Serbisch (Kyrillisch) als Standard, Deutsch per `СР | DE`. „Јел’ знате?“ wird nie übersetzt und nie erklärt.
- **Stack:** Vite + React 19 + TypeScript (strict), Supabase (isoliertes Modul im bestehenden Projekt, Edge Function `vienna-media`), pdf-lib
- **Hosting:** Cloudflare Pages

## Ablauf

```
Dienstag:   Opening („Јел’ знате?“) → Intro → I Frühstück → II Gym → III Vienna Open → IV Sauna → V Dinner
            → „Имамо још нешто.“ + Brief → „Јел’ знате?“ · „Знате ли колико вас волимо?“ · Familienfoto · Unterschrift
            → „Ваш дан.“ (Album + PDF)
Später:     „Ваша прича.“ (nur wenn Material da ist): Gradski Klub → Hochzeit → Familie → Was ihr aufgebaut habt
            → Video & drei Stimmen → „ви сте Милица и Милош.“
Mittwoch:   Epilog „Још мало Беча.“ (Schönbrunn, Musik, Kaffeehäuser, „Покажи пут“, letzte Frage, PDF aktualisieren)
```
Keine biografischen Seiten zwischen den Kapiteln des Dienstags.

---

## Architektur (Option B – ohne Anonymous Sign-ins)

```
iPhone (Mama/Tata)                    Supabase (bestehendes All-in-One-Projekt)
 ├─ kein Login, keine Supabase-Session
 ├─ Trip-Token (aus dem Link, 192 Bit)  ─RPC─▶ public.vienna_* (SECURITY DEFINER, prüft Token-Hash + registriert Geräte-ID)
 ├─ Geräte-ID (zufällige UUID, lokal)        └─ Schema vienna (Tabellen für Clients komplett gesperrt)
 └─ Fotos ───────────────────────────── POST ▶ Edge Function vienna-media (Service Role NUR hier)
                                               ├─ upload-url:   Pfad + Ticket von der DB → signierte Upload-URL (vienna-day)
                                               ├─ confirm-upload: Datei vorhanden? Ticket gültig? → registrieren
                                               ├─ read-urls:    nur Pfade dieses Trips → signierte Lese-URLs (6 h)
                                               └─ reset:        nur mit VIENNA_ALLOW_RESET=true
Admin (/admin) ── normaler E-Mail-Login (Magic Link) + Eintrag in vienna.admins ── RLS/Storage-Policies nur für Vienna-Admins
```

- **Anonymous Sign-ins bleiben im Projekt AUS.** Die Eltern-Geräte benutzen ausschließlich die Rolle `anon`
  (öffentlicher Key) und erreichen damit nur die fünf Eltern-RPCs. Policies anderer Apps für `authenticated`
  (z. B. `capabilities_select_authenticated`, `solution_catalog_select_active_or_admin`) sind für sie unerreichbar.
- **Pfade erzeugt immer der Server** (`trips/<trip-id>/day/<kapitel>-<zufall>.jpg`). Der Client kann keinen Pfad,
  keinen Bucket und keinen fremden Trip angeben; registriert wird nur ein unbenutztes, ≤ 2 h altes Ticket desselben
  Trips, dessen Datei wirklich im Bucket liegt.
- **Ungültige/fehlende Tokens** liefern überall dieselbe Meldung `invalid_token` (RPC und Edge Function) – ohne Trip-ID,
  Label oder sonstige Metadaten. Auch gültige Eltern-Snapshots enthalten keine Trip-ID.
- **Missbrauchsschutz:** Token 192 Bit (nicht erratbar), Formatprüfung vor jeder DB-Abfrage, Upload-Tickets max. 15 pro
  Gerät/10 min und 60 pro Trip/h (DB), 120 Requests/min pro IP (Edge-Instanz), Request-Body ≤ 8 KB, max. 40 Pfade pro
  Lese-Anfrage, Bucket `vienna-day` nimmt nur JPEG ≤ 15 MB an, CORS nur für die Vienna-Domain(s).
- **Offline:** Fotos liegen in IndexedDB, bis Upload + Bestätigung durch sind (auch über Safari-Schließen hinweg).
- **Zwei Handys:** Fortschritt wird monoton zusammengeführt. Nach einem Test-Reset (`reset_at`) verwirft ein Gerät
  seinen älteren lokalen Stand, statt ihn zurückzuspielen – wichtig, damit eure Testhandys den echten Trip nicht „auffüllen“.

---

## GO-LIVE-Checkliste

> Reihenfolge einhalten. Nichts davon ändert Auth-Einstellungen oder Objekte anderer Apps.

**0. Vorab (einmalig, lesend):** Supabase Dashboard → Authentication → Sign In / Providers →
„Allow anonymous sign-ins“ ist **aus** und bleibt aus.

**1. Migration** – im **SQL-Editor** des Projekts den Inhalt von
`supabase/migrations/20261026000000_vienna_module.sql` ausführen.
- *Nicht* `supabase db push` / `supabase link` + `config push` aus diesem Repo gegen das All-in-One-Projekt
  verwenden: das würde die Migrationshistorie bzw. Projekt-Konfiguration der anderen Apps berühren.
- Erwartet: „Success. No rows returned“. Bei einem Namenskonflikt bricht sie mit „Abbruch: …“ ab und ändert nichts.
- Kontrolle: `select proname from pg_proc where proname like 'vienna\_%' order by 1;` → 17 Funktionen.

**2. Edge Function `vienna-media`** (Supabase CLI ≥ 2.x, Login mit `supabase login`):
```bash
supabase secrets set --project-ref <PROJECT_REF> \
  VIENNA_ALLOWED_ORIGINS="https://<projekt>.pages.dev,https://*.<projekt>.pages.dev"
#   + ggf. eigene Domain, z. B. ",https://wien.example.de". Kein Leerzeichen, kein abschließender Slash.
supabase functions deploy vienna-media --project-ref <PROJECT_REF> --no-verify-jwt --use-api
```
- `--no-verify-jwt` ist nötig, weil die Eltern keine Session haben; die Funktion prüft Token + Geräte-ID selbst.
- `--use-api` bündelt serverseitig (kein Docker nötig). Es wird nur diese eine Funktion angelegt/aktualisiert.
- `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Funktion automatisch bereit.
  **Den Service-Role-Key nirgends sonst eintragen** – nicht in Cloudflare, nicht als `VITE_*`.
- `VIENNA_ALLOW_RESET=true` nur während der Testphase setzen (für „Reset alles“ im Debug-Panel), vor der Übergabe:
  `supabase secrets unset --project-ref <PROJECT_REF> VIENNA_ALLOW_RESET`.
- Prüfen: `curl -i -X POST https://<PROJECT_REF>.supabase.co/functions/v1/vienna-media -H 'origin: https://<projekt>.pages.dev' -d '{}'`
  → `401 {"error":"invalid_token"}`. Mit fremder Origin → `403`.

**3. Admin**
- Authentication → Users → „Add user“ (oder vorhandenen E-Mail-User nutzen).
- SQL: `insert into vienna.admins (email) values ('deine@mail.de');` (Vienna-eigene Liste).
- Authentication → URL Configuration → Redirect URLs: `https://<projekt>.pages.dev/admin` **hinzufügen**
  (bestehende Einträge und Site URL nicht ändern).

**4. Cloudflare Pages** – Build `npm run build`, Output `dist`, Umgebungsvariablen (Production **und** Preview):

| Variable | Wert | Hinweis |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` | öffentlich |
| `VITE_SUPABASE_ANON_KEY` | anon- bzw. publishable Key | öffentlich (nur Rolle `anon`) |
| `VITE_ENABLE_DEBUG` | `true` nur in Preview | Production: nicht setzen |
| `NODE_VERSION` | `22` | |

**5. Trip anlegen:** `npm run trip:create -- https://<projekt>.pages.dev` → ausgegebenes
`select public.vienna_create_trip(...)` im SQL-Editor ausführen → Link sicher aufbewahren.

**6. Generalprobe** (Preview mit Debug oder Production):
Link auf zwei Handys öffnen → Kapitel 1 mit Foto (einmal im Flugmodus aufnehmen, dann online) → `/admin` zeigt
beide Geräte und das Foto → Nachricht senden → erscheint auf dem Handy (≤ 30 s) → Album/PDF erzeugen →
Reset (`VIENNA_ALLOW_RESET=true` oder SQL, s. u.).

**7. Familienfoto:** `/admin` → Familien-Assets → „Aktuelles Familienfoto“ → Hochladen. Weitere Assets jederzeit
genauso – kein Code, kein Redeploy.

**8. Übergabe:** `VIENNA_ALLOW_RESET` entfernen, Trip per SQL zurücksetzen (s. u.), Link an Mama & Tata.

---

## ALL-IN-ONE SUPABASE SAFETY REPORT (Option B)

**Grundsatz:** rein additiv, alles Vienna-Eigene im Schema `vienna`, API-Funktionen in `public` nur mit Präfix `vienna_`,
eigene Buckets, eigene Policy-Namen. Die Migration läuft in **einer Transaktion** und bricht **vor jeder Änderung**
ab, falls ein Schema `vienna`, eine Funktion `public.vienna_*`, ein Bucket `vienna-day`/`vienna-memories` oder eine
Storage-Policy `vienna_*` existiert, die nicht von diesem Modul stammt (Markierung `COMMENT … 'vienna-gift module'`).
Wiederholtes Ausführen ist sicher; ein früherer Vienna-Entwurf (mit `trip_members`) wird dabei sauber ersetzt –
ausschließlich markierte Vienna-Objekte.

**A. Schemas (neu):** `vienna`

**B. Tabellen (neu, alle `vienna`, RLS an):** `trips`, `devices`, `uploads`, `upload_tickets`, `answers`, `messages`,
`assets`, `admins`. Für `anon` gibt es weder Schema-Usage noch Tabellenrechte; `authenticated` darf nur lesen, was die
Admin-Policies (Vienna-Admins) freigeben; `token_hash` ist per Spaltenrecht auch für Admins unsichtbar;
`admins` und `upload_tickets` haben keine Policy und keine Grants.

**C. Funktionen (neu)**
| Gruppe | Funktionen | ausführbar für |
|---|---|---|
| intern (`vienna`) | `chapter_order`, `phase_rank`, `hash_token`, `require_trip`, `is_admin`, `assert_admin`, `trip_snapshot` | niemand direkt (`is_admin` für `authenticated`, nur für RLS) |
| Eltern | `vienna_join_trip`, `vienna_save_progress`, `vienna_save_answer`, `vienna_mark_message_read` | `anon`, `authenticated` – jede prüft Token + Geräte-ID |
| Media | `vienna_media_issue_upload`, `vienna_media_confirm_upload`, `vienna_media_readable`, `vienna_media_reset` | **nur `service_role`** (Edge Function) |
| Admin | `vienna_admin_whoami`, `_overview`, `_send_message`, `_delete_message`, `_set_asset`, `_update_asset_meta`, `_remove_asset` | `authenticated`, intern `assert_admin()` |
| SQL-Editor | `vienna_create_trip`, `vienna_admin_reset_trip` | keine API-Rolle |

Alle `SECURITY DEFINER` mit `search_path = ''` und vollqualifizierten Namen. Keine Extensions (SHA-256/UUID sind Bordmittel).

**D. Trigger:** keine.

**E. Policies (neu)**
- Vienna-Tabellen: `vienna_admin_read_trips|devices|uploads|answers|messages|assets` (SELECT, nur Vienna-Admins).
- `storage.objects`: `vienna_admin_read` / `vienna_admin_delete` (Buckets `vienna-day`, `vienna-memories`),
  `vienna_admin_insert` / `vienna_admin_update` (nur `vienna-memories`) – jeweils nur für Vienna-Admins.
  **Eltern haben keine einzige Storage-Policy**; sie erhalten nur kurzlebige signierte URLs der Edge Function.

**F. Buckets (neu, privat):** `vienna-day` (Tagesfotos, nur `image/jpeg`, ≤ 15 MB), `vienna-memories`
(Familien-Assets: Bilder, Video, Audio). Struktur `trips/<trip-id>/day|family|video|audio/…`.

**G. Edge Function (neu):** `vienna-media`. Service Role nur dort; arbeitet ausschließlich mit den beiden Vienna-Buckets
und Vienna-Pfadmustern (doppelt geprüft: DB + Funktion). CORS nur für `VIENNA_ALLOWED_ORIGINS`.

**H. Realtime:** `vienna.trips, devices, uploads, answers, messages, assets` werden der bestehenden Publication
`supabase_realtime` nur **hinzugefügt** (bei `FOR ALL TABLES` passiert nichts). Nichts wird entfernt.

**I. Auth:** **keine Änderung.** Anonymous Sign-ins bleiben aus. Nur manuell: Admin-User anlegen (falls nicht vorhanden)
und eine Redirect-URL **hinzufügen**.

**J. Wird ein bestehendes Objekt verändert?** **Nein.** Keine fremde Tabelle, Policy, Funktion, kein fremder Bucket,
Trigger, keine Auth-Einstellung, keine globalen GRANT/REVOKE, keine Default Privileges, kein `DROP … CASCADE` außerhalb
von `vienna`. Berührungspunkte mit geteilten Systemobjekten sind ausschließlich *Hinzufügungen* (zwei Zeilen in
`storage.buckets`, vier Policies auf `storage.objects` für die eigenen Buckets, sechs Tabellen in `supabase_realtime`,
eine neue Edge Function, ein neues Secret).

**Geprüft**
- `supabase/tests/run.sh` (Postgres 16 + Supabase-Rollen-Stub + simulierte fremde Objekte): fremde Objekte vor/nach
  Migration identisch (bis auf die genannten Hinzufügungen), Migration 2× ausführbar, Upgrade vom Vorentwurf,
  Kollisionsschutz in 4 Fällen (Schema, Funktion, Bucket, Policy) mit Rollback, Deinstallation = exakter Ausgangszustand,
  selbstprüfende Sicherheitstests (ungültige Tokens, fremder Trip, Tickets, Rate-Limit, Rollenrechte, Admin, Reset).
- `supabase/tests/e2e/stack.sh` (echtes `supabase/postgres`, PostgREST, storage-api, edge-runtime mit `vienna-media`):
  zwei Geräte, Offline-Foto → Safari zu → online → Upload, Admin sieht Fotos/Geräte, Asset-Upload, Nachricht,
  PDF, Reset (auch altes zweites Gerät), ungültiger Token, fremder Trip, fremde Origin, direkter Storage-Upload,
  frei gewählter Pfad, Eltern nie mit `/auth/v1` oder Rolle `authenticated`.
- `vienna-media`-Logik: `supabase/functions/vienna-media/handler.test.ts` (Vitest).

---

## ASSET READINESS

| Slot | DB | Storage | Admin-Upload | Experience | PDF | Missing-State |
|---|---|---|---|---|---|---|
| `familyCurrent` | ✓ | ✓ `family/` | ✓ Thumbnail, ersetzen, löschen, Details | Ende Dienstag („Хвала вам за све.“) | Familienseite vor „Јел’ знате?“ | Seite/Bild entfällt |
| `parentsCurrent` | ✓ | ✓ `family/` | ✓ | Familiengeschichte („ви сте Милица и Милош.“) | – | Fallback: heutiges Dinner-, sonst Frühstücksfoto |
| `gradskiKlub` | ✓ | ✓ `family/` | ✓ | Familiengeschichte, warm/filmisch | Archivseite | Bild entfällt, Text bleibt |
| `wedding` | ✓ | ✓ `family/` | ✓ | Familiengeschichte | Archivseite | Seite entfällt |
| `familyEarly` | ✓ | ✓ `family/` | ✓ | Familiengeschichte | Archivseite | Bild entfällt, Text bleibt |
| `familyVideo` | ✓ | ✓ `video/` | ✓ Video-Vorschau | Familiengeschichte, kein Autoplay, „Пусти.“ | – (Video) | Abschnitt entfällt |
| `videoPoster` | ✓ | ✓ `video/` | ✓ Thumbnail | Standbild des Videos | – | Video ohne Standbild |
| `audioDjordje` | ✓ | ✓ `audio/` | ✓ Play | „Од Ђорђа.“ | – (Audio) | Eintrag entfällt |
| `audioBogdana` | ✓ | ✓ `audio/` | ✓ Play | „Од Богдане.“ | – | Eintrag entfällt |
| `audioLazar` | ✓ | ✓ `audio/` | ✓ Play | „Од Лазара.“ | – | Eintrag entfällt |

- **Priorität:** Datenbank/Storage → Default in `src/config/family.ts` → ausblenden. Bildunterschrift SR/DE, Jahr, Ort
  aus dem Admin haben Vorrang vor den Defaults.
- **„Ваша прича.“** erscheint erst, wenn mindestens eines von Gradski Klub, Hochzeit, Kinder klein, Mama & Tata heute,
  Video oder einer Sprachnachricht vorhanden ist. Das Familienfoto allein reicht bewusst nicht (es steht schon am Ende des Dienstags).
- Für Mama & Tata gibt es nie „fehlt“, „TODO“ oder leere Rahmen.
- Video: Größe ≤ Datei-Limit des Projekts (Free-Plan 50 MB) – ggf. 720p H.264 exportieren.

---

## Admin-Dashboard (`/admin`)
Login per Magic Link (E-Mail-User + `vienna.admins`). Status (Kapitel, Phase, letzter Sync), Geräte, alle Tagesfotos live (Supabase Realtime auf Schema `vienna`
+ Polling alle 20 s), Antworten, **Nachricht an Mama & Tata** (erscheint beim nächsten Sync ≤ 30 s als „Порука од нас.“),
**Familien-Assets** (Upload, Vorschau/Play, Ersetzen, Löschen, Details SR/DE/Jahr/Ort/Notiz).
Ohne Server ansehen (nur Dev/Preview): `/admin?demo=1`.

## Wo trage ich was ein?
| Was | Wo |
|---|---|
| Familienfotos, Video, Audios + Bildunterschriften | **`/admin` → Familien-Assets** (kein Code) |
| Musik (nur Streaming-Links) | `src/config/family.ts` → `music.morning|spa|finale` |
| Hotel, Tickets, Restaurant, Uhrzeiten, Epilog-Orte | `src/config/trip.ts` |
| Texte | `src/content/sr.ts`, `src/content/de.ts` |

## Lokal testen & Debug
```bash
npm install && npm run dev
# http://localhost:5173/trip/demo?debug=true   (ohne Supabase, alles lokal)
```
Debug-Panel: zu jedem Kapitel / Brief / Abschluss / Album / Epilog springen, Fotos + Antworten simulieren,
„Nur Familienfoto“ (= erste reale Version), „Alle Familienfotos“, Audios, Video, Live-Nachricht, Reset.

DB-Tests: `PGHOST=… PGPORT=… supabase/tests/run.sh` (leeres Postgres 15/16, `psql`).
E2E mit lokalem Supabase-Stack (Docker): `supabase/tests/e2e/stack.sh up && supabase/tests/e2e/stack.sh run`, danach `… down`.

## Testdaten zurücksetzen
- Debug-Panel → „Reset alles“ (Fortschritt, Antworten, Nachrichten, Tagesfotos; **Familien-Assets bleiben**).
  Funktioniert nur, solange die Edge Function `VIENNA_ALLOW_RESET=true` hat.
- SQL: `select public.vienna_admin_reset_trip('<token>');` – danach Storage → `vienna-day` → `trips/<id>/day` leeren.
- Andere Testgeräte übernehmen den Reset beim nächsten Öffnen automatisch (`reset_at`).

## Modul entfernen
`supabase/uninstall_vienna_module.sql` – entfernt ausschließlich Vienna-Objekte (vorher Dateien in `vienna-day` und
`vienna-memories` löschen), danach `supabase functions delete vienna-media --project-ref <PROJECT_REF>` und
`supabase secrets unset --project-ref <PROJECT_REF> VIENNA_ALLOWED_ORIGINS VIENNA_ALLOW_RESET`.

## Cloudflare Pages
Build `npm run build`, Output `dist`, `NODE_VERSION=22`. SPA-Routing ohne `_redirects`.
`public/_headers`: noindex, CSP (`*.supabase.co` für API, Edge Function, Realtime, signierte Medien), no-referrer.

## Qualität
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
