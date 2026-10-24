import { lazy, Suspense, useState } from 'react';
import { Experience } from './components/Experience';
import { Gate } from './components/Gate';
import { isDebugRequested } from './lib/debug';
import { env } from './lib/env';
import { DEMO_TOKEN, isValidTokenFormat, parseTripToken } from './lib/token';
import { TripProvider } from './state/TripProvider';

const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));

type Route = { kind: 'admin' } | { kind: 'private' } | { kind: 'invalid' } | { kind: 'trip'; token: string };

function resolveRoute(pathname: string): Route {
  if (/^\/admin(\/|$)/.test(pathname)) return { kind: 'admin' };
  const token = parseTripToken(pathname);
  if (token === null) return { kind: 'private' };
  if (token === DEMO_TOKEN) {
    // Demo nur lokal (ohne Supabase) oder wenn Debug verfügbar ist.
    return !env.isSupabaseConfigured || env.debugAvailable ? { kind: 'trip', token } : { kind: 'invalid' };
  }
  return isValidTokenFormat(token) ? { kind: 'trip', token } : { kind: 'invalid' };
}

export function App() {
  const [route] = useState(() => resolveRoute(window.location.pathname));
  const [debug] = useState(() => isDebugRequested(window.location.search));

  if (route.kind === 'admin') {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }
  if (route.kind === 'private') return <Gate kind="private" />;
  if (route.kind === 'invalid') return <Gate kind="invalid" />;
  return (
    <TripProvider token={route.token}>
      <Experience debug={debug} />
    </TripProvider>
  );
}
