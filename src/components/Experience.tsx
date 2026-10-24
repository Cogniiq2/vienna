import { lazy, Suspense } from 'react';
import { useTripState } from '../state/context';
import { AppShell } from './AppShell';
import { Gate } from './Gate';
import { IntroScreen } from './IntroScreen';
import { Journey } from './Journey';
import { OpeningScreen } from './OpeningScreen';
import { StatusBanner } from './StatusBanner';

const FinalReveal = lazy(() => import('./FinalReveal').then((m) => ({ default: m.FinalReveal })));
const DebugPanel = lazy(() => import('./DebugPanel').then((m) => ({ default: m.DebugPanel })));

export function Experience({ debug }: { debug: boolean }) {
  const { status, progress } = useTripState();

  if (status === 'loading') return <Gate kind="loading" />;
  if (status === 'invalid') return <Gate kind="invalid" />;

  const phase = progress.phase;
  return (
    <AppShell footer={phase !== 'opening'}>
      <StatusBanner />
      {phase === 'opening' && <OpeningScreen />}
      {phase === 'intro' && <IntroScreen />}
      {phase === 'journey' && <Journey />}
      {phase === 'finale' && (
        <Suspense fallback={null}>
          <FinalReveal />
        </Suspense>
      )}
      {debug && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </AppShell>
  );
}
