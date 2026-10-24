import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { chapterIndex, getChapter, type ChapterId } from '../config/chapters';
import { trip } from '../config/trip';
import { useLanguage } from '../i18n/context';
import { toRoman } from '../lib/format';
import { useReducedMotion } from '../lib/hooks';
import { useTripState } from '../state/context';
import { ChallengeCard } from './ChallengeCard';
import { ArrowIcon } from './Icons';
import { ChapterInfo } from './InfoCards';
import { PhotoCapture } from './PhotoCapture';
import { MomentQuestion, WinnerQuestion } from './QuestionCard';
import { TaskList } from './TaskList';

const COMPLETE_DELAY = 900;
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

interface Props {
  chapterId: ChapterId;
  mode: 'current' | 'review';
  onCompleted?: (id: ChapterId) => void;
}

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
    <article className="chapter" aria-labelledby={`chapter-${chapterId}`} data-chapter={chapterId}>
      <header className="chapter__header">
        <span className="chapter__numeral reveal-fade" aria-hidden="true">
          {roman}
        </span>
        <p className="eyebrow eyebrow--accent reveal" style={delay(100)}>
          {t.chapter.label(roman)} · {c.eyebrow}
          {time && <span className="chapter__time"> · {t.chapter.timeLabel(time)}</span>}
        </p>
        {c.reveal && (
          <p className="chapter__reveal reveal-blur" style={delay(250)}>
            {c.reveal}
          </p>
        )}
        <h1 id={`chapter-${chapterId}`} className="headline reveal-blur" style={delay(c.reveal ? 700 : 200)}>
          {c.title}
        </h1>
        <p className="serif-lead reveal" style={delay(c.reveal ? 1100 : 500)}>
          {c.lead}
        </p>
      </header>

      <div className="chapter__body reveal" style={delay(c.reveal ? 1400 : 750)}>
        {c.body.map((p) => (
          <p key={p} className="body-text">
            {p}
          </p>
        ))}

        <TaskList tasks={c.tasks} style={def.taskStyle} />
        {c.note && <p className="chapter__note small-text">{c.note}</p>}

        {def.info && <ChapterInfo kind={def.info} />}
        {c.challenge && <ChallengeCard text={c.challenge} />}

        {def.questions.includes('tennis.winner.mother') && <WinnerQuestion />}
        {def.questions.includes('dinner.moment') && <MomentQuestion />}

        <span className="rule rule--full" aria-hidden="true" />

        <PhotoCapture
          chapter={def}
          title={c.title}
          prompt={c.photo}
          savedText={c.saved}
          mode={mode}
          onSaved={() => finish(true)}
        />

        {mode === 'current' && !finishing && !hasPhoto && (
          <div className="chapter__complete">
            {def.photoRequired ? (
              <button type="button" className="text-link text-link--quiet" onClick={() => finish(false)}>
                {t.photo.skip}
              </button>
            ) : (
              <button type="button" className="btn btn--primary btn--large" onClick={() => finish(true)}>
                <span>{c.completeCta}</span>
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
