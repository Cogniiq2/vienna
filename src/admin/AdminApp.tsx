import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTER_IDS, QUESTIONS, STORY, type QuestionId } from '../config/chapters';
import { ASSET_SLOTS, type AssetSlot } from '../config/family';
import { de } from '../content/de';
import { env } from '../lib/env';
import { callRpc, getSupabase } from '../lib/supabaseClient';
import { createAdminApi } from './api';
import { createDemoAdminApi } from './demoApi';
import type { AdminApi, AdminTrip } from './types';

/**
 * Privates Dashboard für die Kinder. Zugriff nur mit E-Mail-Login (Magic Link / Code)
 * UND Eintrag in private.admins – geprüft in der Datenbank, nicht im Browser.
 */
export function AdminApp() {
  const demo = env.debugAvailable && new URLSearchParams(window.location.search).get('demo') === '1';
  useEffect(() => {
    document.title = 'Admin · Wien 27.10.';
    document.documentElement.lang = 'de';
  }, []);

  if (demo) return <DemoDashboard />;
  if (!env.isSupabaseConfigured) {
    return (
      <AdminFrame>
        <p>Supabase ist nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Das Dashboard braucht den Server.</p>
      </AdminFrame>
    );
  }
  return <AuthGate />;
}

function DemoDashboard() {
  const api = useMemo(() => createDemoAdminApi(), []);
  return <Dashboard api={api} email="Demo-Daten" onSignOut={() => undefined} />;
}

function SupabaseDashboard({ sb, email, onSignOut }: { sb: SupabaseClient; email: string; onSignOut: () => void }) {
  const api = useMemo(() => createAdminApi(sb), [sb]);
  return <Dashboard api={api} email={email} onSignOut={onSignOut} />;
}

function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin">
      <header className="admin__head">
        <h1>Wien · 27.10. — Admin</h1>
      </header>
      {children}
    </div>
  );
}

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'forbidden'; email: string }
  | { kind: 'admin'; email: string; sb: SupabaseClient };

function AuthGate() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  const check = useCallback(async () => {
    const sb = await getSupabase('admin');
    const { data } = await sb.auth.getSession();
    if (!data.session) return setState({ kind: 'signedOut' });
    const { data: who } = await callRpc(sb, 'admin_whoami');
    const info = who as { email?: string; is_admin?: boolean } | null;
    const email = info?.email ?? data.session.user.email ?? '';
    setState(info?.is_admin ? { kind: 'admin', email, sb } : { kind: 'forbidden', email });
  }, []);

  useEffect(() => {
    // onAuthStateChange meldet sich sofort mit INITIAL_SESSION – das ist die erste Prüfung.
    let unsubscribe: (() => void) | undefined;
    void getSupabase('admin').then((sb) => {
      const { data } = sb.auth.onAuthStateChange(() => void check());
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => unsubscribe?.();
  }, [check]);

  const signOut = async () => {
    const sb = await getSupabase('admin');
    await sb.auth.signOut();
    setState({ kind: 'signedOut' });
  };

  if (state.kind === 'loading') return <AdminFrame>Lädt…</AdminFrame>;
  if (state.kind === 'signedOut') return <Login />;
  if (state.kind === 'forbidden') {
    return (
      <AdminFrame>
        <p>
          Angemeldet als <b>{state.email}</b>, aber ohne Admin-Rechte. Eintrag in <code>private.admins</code> fehlt.
        </p>
        <button type="button" className="admin__btn" onClick={() => void signOut()}>
          Abmelden
        </button>
      </AdminFrame>
    );
  }
  return <SupabaseDashboard sb={state.sb} email={state.email} onSignOut={() => void signOut()} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    const sb = await getSupabase('admin');
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin` },
    });
    setBusy(false);
    if (err) setError('Senden fehlgeschlagen. Ist die Adresse als Supabase-User angelegt?');
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const sb = await getSupabase('admin');
    const { error: err } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (err) setError('Code ungültig oder abgelaufen.');
  };

  return (
    <AdminFrame>
      <section className="admin__card admin__login">
        <h2>Anmelden</h2>
        <p>Du bekommst einen Login-Link (und ggf. einen 6-stelligen Code) per E-Mail. Kein Passwort.</p>
        <label>
          E-Mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="button" className="admin__btn admin__btn--primary" disabled={busy || !email.includes('@')} onClick={() => void send()}>
          Login-Link senden
        </button>
        {sent && (
          <>
            <p>E-Mail ist unterwegs. Link in <b>diesem</b> Browser öffnen – oder den Code hier eingeben:</p>
            <label>
              Code
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="button" className="admin__btn" disabled={busy || code.trim().length < 6} onClick={() => void verify()}>
              Code bestätigen
            </button>
          </>
        )}
        {error && <p className="admin__error">{error}</p>}
      </section>
    </AdminFrame>
  );
}

// -----------------------------------------------------------------------------

const POLL_MS = 20_000;
const fmt = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Vienna' }).format(new Date(iso)) : '—';

function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  return `vor ${Math.round(min / 60)} Std.`;
}

function stepLabel(trip: AdminTrip): string {
  if (trip.phase !== 'journey') return { opening: 'Opening', intro: 'Intro', finale: 'Finale', journey: '' }[trip.phase] ?? trip.phase;
  const seen = new Set(trip.seen ?? []);
  const done = new Set(trip.completed);
  const step = STORY.find((s) => (s.kind === 'chapter' ? !done.has(s.id) : !seen.has(`interlude:${s.id}`)));
  if (!step) return 'Finale';
  return step.kind === 'chapter'
    ? `Kapitel ${CHAPTER_IDS.indexOf(step.id) + 1} · ${de.chapters[step.id].eyebrow}`
    : `Erinnerung · ${step.id}`;
}

function answerLabel(id: string, value: string): string {
  const q = QUESTIONS[id as QuestionId];
  if (q?.type === 'choice') return de.questions[id as QuestionId].options?.[value] ?? value;
  return value;
}

function Dashboard({ api, email, onSignOut }: { api: AdminApi; email: string; onSignOut: () => void }) {
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.overview();
      setTrips(data);
      setError(null);
      setUpdatedAt(new Date().toISOString());
      const paths = data.flatMap((t) => t.uploads_detail.map((u) => u.path));
      const urls = await api.signedPhotoUrls(paths);
      setPhotoUrls((prev) => ({ ...prev, ...urls }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
    }
  }, [api]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const debounced = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 600);
    };
    const unsubscribe = api.subscribe(debounced, setLive);
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      unsubscribe();
      clearTimeout(first);
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [api, load]);

  return (
    <div className="admin">
      <header className="admin__head">
        <h1>Wien · 27.10. — Admin</h1>
        <p className="admin__meta">
          <span className="admin__live" data-live={live ? 'true' : 'false'}>
            {live ? 'Live' : 'Polling'}
          </span>{' '}
          · aktualisiert {ago(updatedAt)} · {email}{' '}
          <button type="button" className="admin__link" onClick={onSignOut}>
            Abmelden
          </button>
        </p>
      </header>
      {error && <p className="admin__error">{error}</p>}
      {trips.length === 0 && !error && <p>Noch kein Trip angelegt (npm run trip:create).</p>}
      {trips.map((trip) => (
        <TripPanel key={trip.trip_id} trip={trip} api={api} photoUrls={photoUrls} onChanged={() => void load()} />
      ))}
    </div>
  );
}

function TripPanel({
  trip,
  api,
  photoUrls,
  onChanged,
}: {
  trip: AdminTrip;
  api: AdminApi;
  photoUrls: Record<string, string>;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [heart, setHeart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    try {
      await api.sendMessage(trip.trip_id, body.trim(), heart);
      setBody('');
      setNote('Gesendet – erscheint beim nächsten Sync (≤ 30 s).');
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setBusy(false);
    }
  };

  const lastSeen = trip.members.map((m) => m.last_seen_at).filter(Boolean).sort().pop() ?? null;

  return (
    <section className="admin__trip">
      <div className="admin__card">
        <h2>{trip.label ?? 'Trip'}</h2>
        <dl className="admin__facts">
          <div>
            <dt>Status</dt>
            <dd>{stepLabel(trip)}</dd>
          </div>
          <div>
            <dt>Kapitel erledigt</dt>
            <dd>
              {trip.completed.length} / {CHAPTER_IDS.length}
              <span className="admin__chips">
                {CHAPTER_IDS.map((id, i) => (
                  <span key={id} data-done={trip.completed.includes(id) ? 'true' : 'false'} title={de.chapters[id].eyebrow}>
                    {i + 1}
                  </span>
                ))}
              </span>
            </dd>
          </div>
          <div>
            <dt>Gestartet / fertig</dt>
            <dd>
              {fmt(trip.started_at)} / {fmt(trip.finished_at)}
            </dd>
          </div>
          <div>
            <dt>Letzter Sync</dt>
            <dd>
              {fmt(trip.updated_at)} · zuletzt aktiv {ago(lastSeen)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="admin__card">
        <h3>Geräte ({trip.members.length})</h3>
        <ul className="admin__list">
          {trip.members.map((m, i) => (
            <li key={i}>
              {m.device ?? 'Gerät'} · seit {fmt(m.joined_at)} · aktiv {ago(m.last_seen_at)}
            </li>
          ))}
        </ul>
      </div>

      <div className="admin__card">
        <h3>Nachricht an Mama & Tata</h3>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Видимо да сте преживели тенис 😄"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="admin__check">
          <input type="checkbox" checked={heart} onChange={(e) => setHeart(e.target.checked)} /> mit kleinem Herz
        </label>
        <button type="button" className="admin__btn admin__btn--primary" disabled={busy || !body.trim()} onClick={() => void send()}>
          Senden
        </button>
        {note && <p className="admin__note">{note}</p>}
        <ul className="admin__list">
          {(trip.messages ?? []).map((m) => (
            <li key={m.id}>
              <span>{m.body}</span> <small>· {fmt(m.created_at)} · {m.read_at ? `gelesen ${ago(m.read_at)}` : 'ungelesen'}</small>{' '}
              <button
                type="button"
                className="admin__link"
                onClick={() => void api.deleteMessage(m.id).then(onChanged)}
              >
                löschen
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="admin__card">
        <h3>Fotos ({trip.uploads_detail.length})</h3>
        <div className="admin__photos">
          {trip.uploads_detail.map((u) => (
            <figure key={u.path}>
              {photoUrls[u.path] ? <img src={photoUrls[u.path]} alt={u.chapter_id} loading="lazy" /> : <div className="admin__ph" />}
              <figcaption>
                <b>{de.chapters[u.chapter_id as keyof typeof de.chapters]?.pdf.title ?? u.chapter_id}</b>
                <br />
                aufgenommen {fmt(u.captured_at)}
                <br />
                hochgeladen {fmt(u.uploaded_at)}
                {photoUrls[u.path] && (
                  <>
                    {' · '}
                    <a href={photoUrls[u.path]} target="_blank" rel="noreferrer">
                      Original
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="admin__card">
        <h3>Antworten</h3>
        <ul className="admin__list">
          {(trip.responses ?? []).map((r) => (
            <li key={r.question_id}>
              <b>{de.questions[r.question_id as QuestionId]?.pdfLabel ?? r.question_id}:</b> {answerLabel(r.question_id, r.value)}{' '}
              <small>· {fmt(r.updated_at)}</small>
            </li>
          ))}
          {(trip.responses ?? []).length === 0 && <li>Noch keine.</li>}
        </ul>
      </div>

      <AssetManager trip={trip} api={api} onChanged={onChanged} />
    </section>
  );
}

const SLOT_LABELS: Record<AssetSlot, string> = {
  gradskiKlub: 'Gradski Klub (altes Foto)',
  wedding: 'Hochzeit',
  familyEarly: 'Kinder klein / Urlaub',
  familyCurrent: 'Familie heute (alle fünf)',
  parentsNow: 'Mama & Tata heute (optional)',
  familyVideo: 'Familienvideo (mp4/mov, max. Projektlimit)',
  familyVideoPoster: 'Video-Vorschaubild',
  audioDjordje: 'Sprachnachricht Đorđe',
  audioBogdana: 'Sprachnachricht Bogdana',
  audioLazar: 'Sprachnachricht Lazar',
};

function AssetManager({ trip, api, onChanged }: { trip: AdminTrip; api: AdminApi; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assets = new Map((trip.assets ?? []).map((a) => [a.slot, a]));

  const upload = async (slot: AssetSlot, file: File | undefined) => {
    if (!file) return;
    setBusy(slot);
    setError(null);
    try {
      await api.uploadAsset(trip.trip_id, slot, file);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  const preview = async (path: string) => {
    const url = await api.signedAssetUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="admin__card">
      <h3>Familien-Assets (privat)</h3>
      <p className="admin__note">
        Liegen im privaten Bucket <code>family</code>. Die Eltern sehen sie nur über kurzlebige signierte Links.
      </p>
      <ul className="admin__assets">
        {ASSET_SLOTS.map((slot) => {
          const asset = assets.get(slot);
          const accept = slot.startsWith('audio') ? 'audio/*' : slot === 'familyVideo' ? 'video/*' : 'image/*';
          return (
            <li key={slot}>
              <span>
                {SLOT_LABELS[slot]} <small data-ok={asset ? 'true' : 'false'}>{asset ? '✓ vorhanden' : '— fehlt'}</small>
              </span>
              <span className="admin__asset-actions">
                <label className="admin__btn">
                  {busy === slot ? 'lädt…' : asset ? 'ersetzen' : 'hochladen'}
                  <input
                    type="file"
                    accept={accept}
                    hidden
                    disabled={busy !== null}
                    onChange={(e) => {
                      void upload(slot, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {asset && (
                  <>
                    <button type="button" className="admin__link" onClick={() => void preview(asset.path)}>
                      ansehen
                    </button>
                    <button
                      type="button"
                      className="admin__link"
                      onClick={() => void api.removeAsset(trip.trip_id, slot).then(onChanged)}
                    >
                      entfernen
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="admin__error">{error}</p>}
    </div>
  );
}
