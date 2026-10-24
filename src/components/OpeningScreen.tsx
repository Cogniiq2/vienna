import { useEffect, useState, type CSSProperties } from 'react';
import { MOTIF } from '../content';
import { useLanguage } from '../i18n/context';
import { useTripStore } from '../state/context';
import { ArrowIcon } from './Icons';
import { useLeaveTransition } from './useLeaveTransition';

const MOTIF_MS = 3800;
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Erst nur das Leitmotiv. Dann die Widmung. */
export function OpeningScreen() {
  const { t } = useLanguage();
  const store = useTripStore();
  const [stage, setStage] = useState<'motif' | 'dedication'>('motif');
  const { leaving, leave } = useLeaveTransition(() => store.advanceTo('intro'), 800);

  useEffect(() => {
    if (stage !== 'motif') return;
    const timer = setTimeout(() => setStage('dedication'), MOTIF_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  if (stage === 'motif') {
    return (
      <section className="opening opening--motif" aria-label={MOTIF} onClick={() => setStage('dedication')}>
        <div className="opening__glow" aria-hidden="true" />
        <div className="opening__center">
          <p className="motif reveal-blur" style={delay(400)} lang="sr-Cyrl">
            {MOTIF}
          </p>
          <p className="eyebrow opening__place reveal-fade" style={delay(1600)}>
            {t.opening.place}
          </p>
        </div>
        <button type="button" className="visually-hidden" onClick={() => setStage('dedication')}>
          {t.opening.continue}
        </button>
      </section>
    );
  }

  return (
    <section className={`opening ${leaving ? 'screen-leave' : ''}`} aria-labelledby="opening-title">
      <div className="opening__glow" aria-hidden="true" />
      <div className="opening__content">
        <span className="rule reveal-fade" style={delay(100)} />
        <h1 id="opening-title" className="display opening__title reveal-blur" style={delay(200)}>
          {t.opening.dedication}
        </h1>
        <p className="eyebrow opening__place reveal" style={delay(800)}>
          {t.opening.place}
        </p>
        <p className="serif-lead opening__tagline reveal" style={delay(1200)}>
          {t.opening.tagline}
        </p>
      </div>
      <div className="opening__action reveal" style={delay(1700)}>
        <button type="button" className="btn btn--primary btn--large" onClick={leave} disabled={leaving}>
          <span>{t.opening.cta}</span>
          <ArrowIcon size={18} />
        </button>
      </div>
    </section>
  );
}
