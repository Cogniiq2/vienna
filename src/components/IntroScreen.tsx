import type { CSSProperties } from 'react';
import { useLanguage } from '../i18n/context';
import { useTripStore } from '../state/context';
import { ArrowIcon, HeartIcon } from './Icons';
import { useLeaveTransition } from './useLeaveTransition';

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export function IntroScreen() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { leaving, leave } = useLeaveTransition(() => store.advanceTo('journey'));
  const { intro } = t;

  // Gestaffelte Einblendung: jede Zeile etwas später als die vorige.
  const at = (step: number) => delay(150 + step * 480);
  const lineCount = intro.lines.length;

  return (
    <section className={`intro page ${leaving ? 'screen-leave' : ''}`} aria-labelledby="intro-title">
      <p className="eyebrow eyebrow--accent reveal" style={at(0)}>
        {t.common.city} · {t.common.dateLong}
      </p>
      <h1 id="intro-title" className="headline intro__greeting reveal-blur" style={at(0.5)}>
        {intro.greeting}
        <HeartIcon className="intro__heart" size={22} />
      </h1>

      <div className="intro__text">
        {intro.lines.map((line, i) => (
          <p key={line} className="serif-lead reveal" style={at(1.5 + i)}>
            {line}
          </p>
        ))}
        <div className="intro__highlight reveal" style={at(1.7 + lineCount)}>
          <p className="body-text">{intro.highlightLead}</p>
          <p className="serif-quote intro__highlight-text">{intro.highlight}</p>
        </div>
        {intro.closing.map((line, i) => (
          <p key={line} className="body-text reveal" style={at(3 + lineCount + i)}>
            {line}
          </p>
        ))}
      </div>

      <div className="page__action reveal" style={at(3.5 + lineCount + intro.closing.length)}>
        <button type="button" className="btn btn--primary btn--large" onClick={leave} disabled={leaving}>
          <span>{intro.cta}</span>
          <ArrowIcon size={18} />
        </button>
      </div>
    </section>
  );
}
