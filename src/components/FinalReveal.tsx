import { useEffect, useState, type CSSProperties } from 'react';
import { trip } from '../config/trip';
import { useLanguage } from '../i18n/context';
import { useTripStore } from '../state/context';
import { HeartIcon } from './Icons';
import { MemoryGenerator } from './MemoryGenerator';

const FIRST_DELAY = 600;
const LINE_GAP = 1500;

/** Das ruhige Finale. Beim ersten Mal Zeile für Zeile, danach sofort sichtbar. */
export function FinalReveal() {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const [animate] = useState(() => !store.getFlag('finale'));
  const [creating, setCreating] = useState(false);
  const children = trip.family.children.map((c) => c[lang]).filter(Boolean);

  // PDF-Bibliothek und Schriften schon während des Finales im Hintergrund laden.
  useEffect(() => {
    void import('../pdf/generateMemory').then((m) => m.preloadPdfAssets()).catch(() => undefined);
  }, []);

  const lines = t.final.lines;
  const at = (i: number) => ({ '--d': `${animate ? FIRST_DELAY + i * LINE_GAP : 0}ms` }) as CSSProperties;
  const signatureIndex = lines.length;

  const start = () => {
    store.setFlag('finale');
    setCreating(true);
  };

  return (
    <section className="finale page" aria-labelledby="finale-title">
      <div className="finale__text">
        {lines.map((line, i) =>
          i === 0 ? (
            <h1 key={line} id="finale-title" className="display finale__first reveal-blur" style={at(0)}>
              {line}
            </h1>
          ) : (
            <p
              key={line}
              className={`reveal ${i === lines.length - 1 ? 'headline finale__love' : 'serif-lead finale__line'}`}
              style={at(i)}
            >
              {line}
            </p>
          ),
        )}
        <div className="finale__signature reveal" style={at(signatureIndex)}>
          <span className="rule" aria-hidden="true" />
          <p className="serif-quote">{t.final.signature}</p>
          {children.length > 0 && <p className="small-text">{children.join(' · ')}</p>}
          <HeartIcon size={18} className="finale__heart" />
        </div>
      </div>

      {creating ? (
        <MemoryGenerator />
      ) : (
        <div className="page__action reveal" style={at(signatureIndex + 1)}>
          <button type="button" className="btn btn--primary btn--large" onClick={start}>
            {t.final.cta}
          </button>
        </div>
      )}
    </section>
  );
}
