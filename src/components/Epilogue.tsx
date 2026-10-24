import { useState, type CSSProperties } from 'react';
import { seenKey } from '../config/chapters';
import { trip } from '../config/trip';
import { localize, useLanguage } from '../i18n/context';
import { navigationHref } from '../lib/links';
import { useTripState, useTripStore } from '../state/context';
import { ArrowBackIcon, ArrowIcon, PinIcon } from './Icons';
import { MemoryGenerator } from './MemoryGenerator';
import { Reveal } from './Reveal';
import { StoryQuestion } from './StoryQuestion';

/** Mittwochmorgen: kein Kapitel 7, keine Mission. Nur noch ein bisschen Wien und eine letzte Frage. */
export function Epilogue({ onBack }: { onBack: () => void }) {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const { responses } = useTripState();
  const [updating, setUpdating] = useState(false);
  const e = t.epilogue;
  const answered = Boolean(responses['epilogue.takeaway']?.value);

  return (
    <section className="story epilogue" aria-labelledby="epilogue-title">
      <button type="button" className="text-link journey__back" onClick={onBack}>
        <ArrowBackIcon size={16} />
        <span>{e.back}</span>
      </button>

      <div className="story__screen story__screen--hero">
        <p className="eyebrow eyebrow--accent reveal">{e.eyebrow}</p>
        <h1 id="epilogue-title" className="display reveal-blur" style={{ '--d': '200ms' } as CSSProperties}>
          {e.title}
        </h1>
        {e.lines.map((line, i) => (
          <p key={line} className="serif-lead reveal" style={{ '--d': `${600 + i * 300}ms` } as CSSProperties}>
            {line}
          </p>
        ))}
      </div>

      {trip.epilogue.locations.length > 0 && (
        <div className="story__screen facts">
          <p className="eyebrow">{e.locationsTitle}</p>
          {trip.epilogue.locations.map((loc, i) => {
            const href = navigationHref(loc.navigationUrl, loc.address ?? loc.name);
            return (
              <Reveal key={loc.name}>
                <div className="fact">
                  <span className="fact__index" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="fact__title">{loc.name}</h2>
                  <p className="body-text">{localize(loc.description, lang)}</p>
                  {loc.history && <p className="small-text">{localize(loc.history, lang)}</p>}
                  {loc.walk && <p className="note hand">{localize(loc.walk, lang)}</p>}
                  {href && (
                    <a className="btn btn--secondary btn--link" href={href} target="_blank" rel="noopener noreferrer">
                      <PinIcon size={18} />
                      <span>{t.info.showWay}</span>
                      <ArrowIcon size={16} className="btn__trail" />
                    </a>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      <div className="story__screen questions">
        <StoryQuestion id="epilogue.takeaway" />
        {answered && (
          <div className="epilogue__update">
            <p className="small-text">{e.updateHint}</p>
            {updating ? (
              <MemoryGenerator />
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--large"
                onClick={() => {
                  store.markSeen(seenKey.epilogue);
                  setUpdating(true);
                }}
              >
                {e.update}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="story__screen story__screen--center">
        <p className="hand epilogue__farewell">{e.farewell}</p>
      </div>
    </section>
  );
}
