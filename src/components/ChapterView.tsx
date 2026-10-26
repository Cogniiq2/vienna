import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { chapterIndex, getChapter, type ChapterId } from '../config/chapters';
import { trip } from '../config/trip';
import { useLanguage } from '../i18n/context';
import { toRoman } from '../lib/format';
import { useReducedMotion } from '../lib/hooks';
import { useTripState } from '../state/context';
import { ArrowIcon } from './Icons';
import { ChapterInfo } from './InfoCards';
import { MusicCard } from './MusicCard';
import { PhotoCapture } from './PhotoCapture';
import { Reveal } from './Reveal';
import { StoryQuestion } from './StoryQuestion';
import { TaskList } from './TaskList';

const COMPLETE_DELAY = 900;
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

interface Props {
  chapterId: ChapterId;
  mode: 'current' | 'review';
  onCompleted?: (id: ChapterId) => void;
}

/**
 * Ein Kapitel als kleine Folge von Seiten: Überschrift → Geschichte → was zu tun ist → Erinnerung.
 * Jede Seite bekommt Raum; Inhalte blenden beim Scrollen ruhig ein.
 */
export function ChapterView({ chapterId, mode, onCompleted }: Props) {
  const { t } = useLanguage();
  const { photos } = useTripState();
  const reduced = useReducedMotion();
  const def = getChapter(chapterId);
  const c = t.chapters[chapterId];
  const index = chapterIndex(chapterId);
  const roman = toRoman(index + 1);
  const time = trip.chapterTimes[chapterId];
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPhoto = Boolean(photos[chapterId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const finish = (withMoment: boolean) => {
    if (mode !== 'current' || finishing) return;
    setFinishing(true);
    timer.current = setTimeout(() => onCompleted?.(chapterId), withMoment && !reduced ? COMPLETE_DELAY : 0);
  };

  return (
    <article className="chapter story" aria-labelledby={`chapter-${chapterId}`} data-chapter={chapterId}>
      {/* 1 — Überschrift */}
      <header className="story__screen story__screen--hero chapter__hero">
        <span className="chapter__numeral reveal-fade" aria-hidden="true">
          {roman}
        </span>
        <p className="eyebrow eyebrow--accent reveal" style={delay(100)}>
          {t.chapter.label(roman)} · {c.eyebrow}
          {time && <span className="chapter__time"> · {t.chapter.timeLabel(time)}</span>}
        </p>
        {c.reveal && (
          <p className="chapter__reveal reveal-blur" style={delay(300)}>
            {c.reveal}
          </p>
        )}
        <h1 id={`chapter-${chapterId}`} className="headline chapter__title reveal-blur" style={delay(c.reveal ? 900 : 250)}>
          {c.title}
        </h1>
        {c.subtitle && (
          <p className="serif-lead chapter__subtitle reveal" style={delay(c.reveal ? 1400 : 700)}>
            {c.subtitle}
          </p>
        )}
      </header>

      {/* 2 — Geschichte */}
      {c.story.length > 0 && (
        <div className="story__screen chapter__story">
          {c.story.map((line, i) => (
            <Reveal key={line} delay={i * 220}>
              <p className="serif-lead">{line}</p>
            </Reveal>
          ))}
          {c.storyClose && (
            <Reveal delay={c.story.length * 220}>
              <p className="chapter__close">{c.storyClose}</p>
            </Reveal>
          )}
        </div>
      )}

      {/* Die Regel beim Dinner */}
      {c.rule && (
        <div className="story__screen rule-reveal">
          <Reveal>
            <p className="serif-lead">{c.rule.intro}</p>
          </Reveal>
          <ul className="rule-reveal__items">
            {c.rule.items.map((item, i) => (
              <li key={item}>
                <Reveal delay={200 + i * 260}>
                  <span>{item}</span>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delay={200 + c.rule.items.length * 260 + 300}>
            <p className="hand rule-reveal__punchline">{c.rule.punchline}</p>
          </Reveal>
        </div>
      )}

      {/* 3 — Was zu tun ist */}
      <div className="story__screen story__screen--flow">
        {c.tasks.length > 0 && (
          <Reveal>
            <TaskList tasks={c.tasks} style={def.taskStyle} title={c.tasksTitle} />
          </Reveal>
        )}
        {c.note && (
          <Reveal>
            <p className="note hand">{c.note}</p>
          </Reveal>
        )}
        {c.toast && (
          <Reveal>
            <aside className="toast" aria-label={t.chapter.toast}>
              <p className="eyebrow eyebrow--accent">{t.chapter.toast}</p>
              <p className="toast__text">{c.toast}</p>
            </aside>
          </Reveal>
        )}
        {def.info && (
          <Reveal>
            <ChapterInfo kind={def.info} />
          </Reveal>
        )}
        {c.challenge && (
          <Reveal>
            <aside className="challenge" aria-label={t.chapter.challenge}>
              <p className="eyebrow eyebrow--accent">
                {t.chapter.challenge} <span className="challenge__optional">· {t.common.optional}</span>
              </p>
              <p className="challenge__text hand">{c.challenge}</p>
            </aside>
          </Reveal>
        )}
        {def.music && <MusicCard slot={def.music} />}
      </div>

      {/* 4 — Fragen */}
      {def.questions.length > 0 && (
        <div className="story__screen questions">
          {def.questions.map((q) => (
            <Reveal key={q}>
              <StoryQuestion id={q} />
            </Reveal>
          ))}
        </div>
      )}

      {/* 5 — Erinnerung */}
      <div className="story__screen story__screen--photo">
        {def.photo && c.photo && (
          <PhotoCapture
            chapter={def}
            title={c.title}
            prompt={c.photo}
            savedText={c.saved}
            mode={mode}
            onSaved={() => finish(true)}
          />
        )}

        {mode === 'current' && !finishing && !hasPhoto && (
          <div className="chapter__complete">
            {def.photo && def.photoRequired ? (
              <button type="button" className="text-link text-link--quiet" onClick={() => finish(false)}>
                {t.photo.skip}
              </button>
            ) : (
              <button type="button" className="btn btn--primary btn--large" onClick={() => finish(true)}>
                <span>{c.completeCta ?? t.common.next}</span>
                <ArrowIcon size={18} />
              </button>
            )}
          </div>
        )}

        {mode === 'current' && finishing && !hasPhoto && (
          <div className="saved-moment" role="status" aria-live="polite">
            <p className="serif-quote">{c.saved}</p>
          </div>
        )}
      </div>
    </article>
  );
}
