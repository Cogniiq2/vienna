# Беч · 27. октобар 2026.

Ein privates Geschenk von Đorđe, Bogdana und Lazar an Mama und Tata: ein Tag in Wien, Kapitel für Kapitel,
am Abend ein Brief und ein stiller Abschluss, danach ein Album als PDF. Am Mittwochmorgen ein ruhiger Epilog.
Eine Familiengeschichte („Ваша прича.“) mit alten Fotos, Video und Stimmen erscheint automatisch, sobald ihr
das Material im Admin hochladet.

- **Sprache:** Serbisch (Kyrillisch) als Standard, Deutsch per `СР | DE`. „Јел’ знате?“ wird nie übersetzt und nie erklärt.
- **Stack:** Vite + React 19 + TypeScript (strict), Supabase (isoliertes Modul im bestehenden Projekt), pdf-lib
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

## Produktiv gehen – Checkliste

1. **Migration prüfen & ausführen:** `supabase/migrations/20261026000000_vienna_module.sql` (siehe Safety-Report unten).
2. **Auth:** anonyme Anmeldung aktivieren – **vorher Prüf-Abfrage ausführen** (siehe „Auth“).
3. **Admin:** dich als User anlegen + `insert into vienna.admins (email) values ('deine@mail.de');`
4. **Cloudflare ENV:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production + Preview), optional `VITE_ENABLE_DEBUG=true` nur Preview.
5. **Trip:** `npm run trip:create -- https://<projekt>.pages.dev` → ausgegebenes `select public.vienna_create_trip(...)` ausführen → Link an die Eltern.
6. **Familienfoto:** `/admin` → Familien-Assets → „Aktuelles Familienfoto“ → Hochladen. Fertig.
7. Später weitere Fotos, Video, Audios genauso. **Kein Code, kein Commit, kein Redeploy.**
8. Tagesdetails in `src/config/trip.ts` (Hoteladresse, Tickets, Restaurant …) – das braucht einen Deploy.

---

## ALL-IN-ONE SUPABASE SAFETY REPORT

Die alten Migrationen (für ein leeres Projekt geschrieben) wurden **entfernt** und durch **eine** additive Migration ersetzt.
Gefundene und beseitigte Risiken der alten Version: `revoke … on schema private` / `revoke execute on all functions in schema private`
(hätte fremde Funktionen getroffen), generische Tabellen `public.trips|messages|uploads|responses`, generische RPCs
(`join_trip`, `admin_overview`, …), `private.admins`, `on conflict do update` auf `storage.buckets`, `create extension pgcrypto`.

**Kollisionsschutz:** Die Migration läuft in einer Transaktion und bricht vor jeder Änderung ab (Rollback), falls
ein Schema `vienna`, eine Funktion `public.vienna_*`, der Bucket `vienna-memories` oder Storage-Policies `vienna_*`
existieren, die **nicht** von diesem Modul stammen (Markierung `COMMENT … 'vienna-gift module'`). Wiederholtes Ausführen ist sicher.

**A. Schemas (neu):** `vienna`

**B. Tabellen (neu, alle in `vienna`, RLS an):** `trips`, `trip_members`, `uploads`, `answers`, `messages`, `assets`, `admins`

**C. Funktionen (neu)**
- intern (`vienna`): `chapter_order`, `phase_rank`, `hash_token`, `is_trip_member`, `is_trip_member_folder`, `is_admin`,
  `assert_member`, `assert_admin`, `touch_member`, `trip_snapshot`
- API (`public`, nur mit Präfix): `vienna_join_trip`, `vienna_save_progress`, `vienna_save_answer`, `vienna_record_upload`,
  `vienna_mark_message_read`, `vienna_reset_trip`, `vienna_admin_whoami`, `vienna_admin_overview`, `vienna_admin_send_message`,
  `vienna_admin_delete_message`, `vienna_admin_set_asset`, `vienna_admin_update_asset_meta`, `vienna_admin_remove_asset`,
  `vienna_create_trip`*, `vienna_admin_reset_trip`* (*nur SQL-Editor, für keine Client-Rolle ausführbar)

**D. Trigger:** keine.

**E. Policies (neu)**
- auf Vienna-Tabellen: `vienna_admin_read_trips|members|uploads|answers|messages|assets` (nur SELECT, nur Vienna-Admins)
- auf `storage.objects` (nur `bucket_id = 'vienna-memories'`): `vienna_memories_read`, `vienna_memories_day_insert`,
  `vienna_memories_day_delete`, `vienna_memories_admin_insert`, `vienna_memories_admin_update`, `vienna_memories_admin_delete`
  – permissiv/additiv, erweitern keine Rechte auf andere Buckets.

**F. Buckets (neu):** `vienna-memories` (privat). Struktur `trips/<trip-id>/day|family|video|audio/…`

**G. Realtime:** `vienna.trips, trip_members, uploads, answers, messages, assets` werden der bestehenden Publication
`supabase_realtime` **hinzugefügt** (nur wenn nicht schon enthalten; bei `FOR ALL TABLES` wird nichts getan). Nichts wird entfernt oder neu erstellt.

**Indizes (neu):** `vienna_trip_members_user_idx`, `vienna_messages_trip_idx` (+ Primär-/Unique-Indizes der Vienna-Tabellen).

**Rechte:** `grant usage on schema vienna to authenticated`; Execute nur auf Vienna-Funktionen; Spalten-SELECT für
Admin-Realtime nur auf Vienna-Tabellen (ohne `token_hash`). **Keine** globalen GRANT/REVOKE, keine Default Privileges.
**Extensions:** keine (SHA-256 und UUIDs sind Postgres-Bordmittel).

**H. Auth – manuell (siehe nächster Abschnitt):** anonyme Anmeldung aktivieren (**projektweit!**), Redirect-URL **hinzufügen**,
Admin-User anlegen. Nichts davon deaktiviert oder ersetzt etwas.

**I. Wird ein bestehendes Objekt verändert?** **Nein.** Vienna wird rein additiv und isoliert integriert.
Die einzigen Berührungspunkte mit geteilten Systemobjekten sind *Hinzufügungen*: neue Policies auf `storage.objects`
(nur für den eigenen Bucket), eine neue Zeile in `storage.buckets`, neue Tabellen in der Publication `supabase_realtime`
und ein Fremdschlüssel von `vienna.trip_members` auf `auth.users` (ändert `auth.users` nicht).

**J.** entfällt.

**Geprüft** (`supabase/tests/run.sh`, Postgres 16 mit nachgebauten Supabase-Rollen und simulierten fremden Objekten:
`private.admins`, `private.secret()`, `public.trips`, `public.messages` + Policy, `public.join_trip`, Bucket `avatars`,
Realtime): fremde Objekte vorher/nachher identisch, Migration 2× ausführbar, Kollisionsschutz bricht in allen drei Fällen
mit Rollback ab, `supabase/uninstall_vienna_module.sql` stellt den exakten Ausgangszustand wieder her.

---

## Auth (bestehendes Supabase Auth bleibt unangetastet)

### 1. Anonyme Anmeldung – ⚠ projektweite Einstellung, vorher prüfen
Die Eltern brauchen kein Konto; jedes Handy bekommt eine anonyme Session. Dafür muss
**Authentication → Sign In / Providers → „Allow anonymous sign-ins“** an sein. Das gilt für das **ganze Projekt**:
anonyme User haben die Rolle `authenticated`. Bestehende Policies anderer Apps, die pauschal `authenticated` erlauben,
wären danach für jeden erreichbar, der euren (öffentlichen) anon-Key hat.

**Vor dem Aktivieren im SQL-Editor prüfen:**
```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where ('authenticated' = any (roles) or 'public' = any (roles))
  and schemaname <> 'vienna'
  and coalesce(qual, '') || coalesce(with_check, '') not ilike '%is_anonymous%'
order by 1, 2;
```
Unkritisch sind Policies, die auf den eigenen User einschränken (z. B. `auth.uid() = user_id`) – anonyme User sehen dann
nur ihre eigenen, leeren Daten. **Kritisch** sind z. B. `using (true)` für `authenticated`. Solche Policies vor dem
Aktivieren in der jeweiligen App absichern (z. B. `and (auth.jwt()->>'is_anonymous')::boolean is not true`) –
das ist eine Entscheidung für die andere App und wird hier bewusst **nicht** automatisch gemacht.
Empfehlung zusätzlich: Authentication → Attack Protection → CAPTCHA bzw. Rate-Limits für anonyme Anmeldungen prüfen.

### 2. Admin
- Authentication → Users → „Add user“ mit deiner E-Mail (oder vorhandenen User nutzen).
- `insert into vienna.admins (email) values ('deine@mail.de');` – Vienna-eigene Liste, unabhängig von anderen Apps.
- Authentication → URL Configuration → **Redirect URLs: `https://<deine-domain>/admin` hinzufügen** (bestehende nicht entfernen,
  **Site URL nicht ändern**).
- Login per Magic Link (`/admin`). Der 6-stellige Code im Login-Formular funktioniert nur, wenn das globale
  Magic-Link-Template `{{ .Token }}` enthält – das Template gilt für alle Apps, daher **optional und bewusst nicht nötig**.

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
Status (Kapitel, Phase, letzter Sync), aktive Geräte, alle Tagesfotos live (Supabase Realtime auf Schema `vienna`
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

DB-Tests: `PGHOST=… PGPORT=… supabase/tests/run.sh` (leeres Postgres 16).

## Testdaten zurücksetzen
- Debug-Panel → „Reset alles“ (Fortschritt, Antworten, Nachrichten, Tagesfotos; **Familien-Assets bleiben**).
- SQL: `select public.vienna_admin_reset_trip('<token>');`, Tagesfotos danach unter Storage → `vienna-memories/trips/<id>/day`.

## Modul entfernen
`supabase/uninstall_vienna_module.sql` – entfernt ausschließlich Vienna-Objekte (vorher Dateien im Bucket löschen).

## Cloudflare Pages
Build `npm run build`, Output `dist`, `NODE_VERSION=22`. SPA-Routing ohne `_redirects`.
`public/_headers`: noindex, CSP (`*.supabase.co` für API, Realtime, signierte Medien), no-referrer.

## Qualität
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
