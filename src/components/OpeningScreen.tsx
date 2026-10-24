import type { CSSProperties } from 'react';
import { useLanguage } from '../i18n/context';
import { useTripStore } from '../state/context';
import { ArrowIcon } from './Icons';
import { useLeaveTransition } from './useLeaveTransition';

export function OpeningScreen() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { leaving, leave } = useLeaveTransition(() => store.advanceTo('intro'), 800);

  return (
    <section className={`opening ${leaving ? 'screen-leave' : ''}`} aria-labelledby="opening-title">
      <div className="opening__glow" aria-hidden="true" />
      <div className="opening__content">
        <span className="rule reveal-fade" style={{ '--d': '200ms' } as CSSProperties} />
        <h1 id="opening-title" className="display opening__title reveal-blur" style={{ '--d': '350ms' } as CSSProperties}>
          {t.opening.dedication}
        </h1>
        <p className="eyebrow opening__place reveal" style={{ '--d': '1000ms' } as CSSProperties}>
          {t.opening.place}
        </p>
        <p className="serif-lead opening__tagline reveal" style={{ '--d': '1400ms' } as CSSProperties}>
          {t.opening.tagline}
        </p>
      </div>
      <div className="opening__action reveal" style={{ '--d': '1900ms' } as CSSProperties}>
        <button type="button" className="btn btn--primary btn--large" onClick={leave} disabled={leaving}>
          <span>{t.opening.cta}</span>
          <ArrowIcon size={18} />
        </button>
      </div>
    </section>
  );
}
