#!/usr/bin/env node
/**
 * Erzeugt einen geheimen Trip-Token (192 Bit) und gibt das SQL für den Supabase-SQL-Editor
 * sowie den fertigen Link aus.
 *
 *   npm run trip:create -- https://dein-projekt.pages.dev
 */
import { randomBytes } from 'node:crypto';

const base = (process.argv[2] ?? 'https://<deine-domain>').replace(/\/+$/, '');
const token = randomBytes(24).toString('base64url');

console.log(`
1) Im Supabase SQL-Editor ausführen:

   select public.create_trip('${token}', 'Mama & Papa · Wien 27.10.2026');

2) Privater Link für Mama & Papa:

   ${base}/trip/${token}

3) Zum Testen mit Debug-Panel (nur Dev / Preview mit VITE_ENABLE_DEBUG=true):

   ${base}/trip/${token}?debug=true

Den Token sicher aufbewahren – er wird in der Datenbank nur gehasht gespeichert.
`);
