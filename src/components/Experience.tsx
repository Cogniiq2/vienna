import { lazy, Suspense, useState } from 'react';
import { useTripState } from '../state/context';
import { AppShell } from './AppShell';
import { Gate } from './Gate';
import { IntroScreen } from './IntroScreen';
import { Journey } from './Journey';
import { MessageCard } from './MessageCard';
import { OpeningScreen } from './OpeningScreen';
import { StatusBanner } from './StatusBanner';

const Finale = lazy(() => import('./Finale').then((m) => ({ default: m.Finale })));
const DebugPanel = lazy(() => import('./DebugPanel').then((m) => ({ default: m.DebugPanel })));

export function Experience({ debug }: { debug: boolean }) {
  const { status, progress } = useTripState();
  const [immersive, setImmersive] = useState(false);

  if (status === 'loading') return <Gate kind="loading" />;
  if (status === 'invalid') return <Gate kind="invalid" />;

  const phase = progress.phase;
  return (
    <AppShell footer={phase !== 'opening'} chrome={immersive ? 'none' : 'full'}>
      <StatusBanner />
      {!immersive && phase !== 'opening' && <MessageCard />}
      {phase === 'opening' && <OpeningScreen />}
      {phase === 'intro' && <IntroScreen />}
      {phase === 'journey' && <Journey />}
      {phase === 'finale' && (
        <Suspense fallback={null}>
          <Finale onImmersive={setImmersive} />
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
