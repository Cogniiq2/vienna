import { CHAPTER_IDS, type ChapterId } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { toRoman } from '../lib/format';
import type { TripProgress } from '../lib/progress';

interface Props {
  progress: TripProgress;
  currentIndex: number;
  viewing: ChapterId | null;
  onSelect: (id: ChapterId | null) => void;
}

/** Das Inhaltsverzeichnis des Tages (I–V). Abgeschlossene Kapitel lassen sich erneut aufschlagen. */
export function StoryProgress({ progress, currentIndex, viewing, onSelect }: Props) {
  const { t } = useLanguage();
  const total = CHAPTER_IDS.length;
  const shownIndex = viewing ? CHAPTER_IDS.indexOf(viewing) : currentIndex;

  return (
    <nav className="progress" aria-label={t.chapter.progressAria}>
      <p className="progress__label eyebrow" aria-live="polite">
        {t.chapter.progress(Math.min(shownIndex + 1, total), total)}
      </p>
      <ol className="progress__list">
        {CHAPTER_IDS.map((id, index) => {
          const done = progress.completed.includes(id);
          const current = index === currentIndex;
          const active = index === shownIndex;
          const status = done ? t.chapter.statusDone : current ? t.chapter.statusCurrent : t.chapter.statusLocked;
          const label = `${t.chapter.label(toRoman(index + 1))} — ${status}`;
          const state = done ? 'done' : current ? 'current' : 'locked';
          return (
            <li key={id}>
              <button
                type="button"
                className="progress__marker"
                data-state={state}
                data-active={active ? 'true' : 'false'}
                aria-label={label}
                aria-current={active ? 'step' : undefined}
                disabled={!done && !current}
                onClick={() => onSelect(done && !current ? id : null)}
              >
                <span className="progress__numeral" aria-hidden="true">
                  {toRoman(index + 1)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
