import { useEffect, useMemo, useRef, useState } from 'react';
import { family } from '../config/family';
import type { StoryFrame } from '../content';
import { useLanguage } from '../i18n/context';
import { visibleFrames } from '../lib/frames';
import { useTripState, useTripStore } from '../state/context';
import { ArrowIcon, HeartIcon } from './Icons';
import { MemoryPhoto } from './MemoryPhoto';

interface Props {
  frames: StoryFrame[];
  onDone: () => void;
  /** Beschriftung des letzten „Weiter“. */
  doneLabel?: string;
  /** Kleine Überschrift über allen Seiten (z. B. „Из породичног албума“). */
  eyebrow?: string;
  /** Vollbild ohne Rahmen (Bonus-Sequenz). */
  immersive?: boolean;
}

/**
 * Eine kleine Folge von Album-Seiten: eine Seite pro Bildschirm, sanfte Überblendung,
 * weiter per Tippen oder „Даље“. Keine Aufgaben, keine Formulare.
 */
export function StorySequence({ frames, onDone, doneLabel, eyebrow, immersive = false }: Props) {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const state = useTripState();
  const pages = useMemo(() => visibleFrames(frames, state, (s) => store.hasAsset(s)), [frames, state, store]);
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const page = pages[Math.min(index, pages.length - 1)];
  const last = index >= pages.length - 1;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  // Nichts anzuzeigen (z. B. nur fehlende Fotos) → direkt weiter.
  useEffect(() => {
    if (pages.length === 0) onDone();
  }, [pages.length, onDone]);

  if (!page) return null;

  const advance = () => (last ? onDone() : setIndex((i) => i + 1));
  const names = family.children.map((c) => c.name[lang]).join(' · ');
  const alt = page.lines.join(' ') || eyebrow || '';

  return (
    <section className="sequence" data-immersive={immersive ? 'true' : 'false'} aria-roledescription="story">
      <div
        key={index}
        className="sequence__page"
        data-size={page.size ?? 'lg'}
        data-has-photo={page.asset ? 'true' : 'false'}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a')) return;
          advance();
        }}
      >
        {eyebrow && <p className="eyebrow eyebrow--accent sequence__eyebrow">{eyebrow}</p>}
        {page.asset && <MemoryPhoto asset={page.asset} alt={alt} />}
        {page.lines.length > 0 && (
          <div className="sequence__text" aria-live="polite">
            {page.lines.map((line) => (
              <p key={line} className="sequence__line">
                {line}
              </p>
            ))}
          </div>
        )}
        {page.small && <p className="sequence__small">{page.small}</p>}
        {page.signature && (
          <div className="signature">
            <p className="signature__main">
              {t.finale.signature} <HeartIcon size={20} className="signature__heart" />
            </p>
            <p className="signature__names hand">{names}</p>
          </div>
        )}
      </div>

      <div className="sequence__nav">
        <button ref={nextRef} type="button" className="sequence__next" onClick={advance}>
          <span>{last && doneLabel ? doneLabel : t.common.next}</span>
          <ArrowIcon size={16} />
        </button>
      </div>
    </section>
  );
}
