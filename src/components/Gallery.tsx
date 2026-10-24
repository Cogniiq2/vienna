import { CHAPTER_IDS, getChapter, type ChapterId, type QuestionId } from '../config/chapters';
import { trip } from '../config/trip';
import { useLanguage } from '../i18n/context';
import { formatClock, toRoman } from '../lib/format';
import { usePhotoUrl } from '../lib/hooks';
import { displayAnswers } from '../lib/memory';
import { useTripState, useTripStore } from '../state/context';
import { Reveal } from './Reveal';

function GalleryEntry({ id }: { id: ChapterId }) {
  const { t } = useLanguage();
  const store = useTripStore();
  const { photos, responses } = useTripState();
  const entry = photos[id];
  const { url } = usePhotoUrl(store, id, entry);
  const content = t.chapters[id];
  const shown = displayAnswers(t, responses);
  const answers = getChapter(id)
    .questions.map((q) => ({ q, text: shown[q] }))
    .filter((a): a is { q: QuestionId; text: string } => Boolean(a.text));
  if (!entry && answers.length === 0) return null;
  const time = entry ? formatClock(entry.capturedAt, trip.timeZone) : null;

  return (
    <Reveal>
      <article className="album-entry">
        <p className="eyebrow eyebrow--accent">
          {t.chapter.label(toRoman(CHAPTER_IDS.indexOf(id) + 1))}
          {time && <span className="album-entry__time"> · {time}</span>}
        </p>
        <h3 className="album-entry__title">{content.pdf.title}</h3>
        {url && (
          <figure className="memory-photo" data-archival="false">
            <div className="memory-photo__print">
              <img src={url} alt={t.photo.savedAlt(content.title)} loading="lazy" decoding="async" />
            </div>
          </figure>
        )}
        {answers.map((a) => (
          <div key={a.q} className="album-entry__answer">
            <p className="small-text">{t.questions[a.q].pdfLabel}</p>
            <p className="album-entry__quote">„{a.text}“</p>
          </div>
        ))}
      </article>
    </Reveal>
  );
}

/** Ein ruhiges, chronologisches Album des Tages – kein Social-Media-Raster. */
export function Gallery() {
  const { t } = useLanguage();
  const { photos } = useTripState();
  const any = CHAPTER_IDS.some((id) => photos[id]);
  return (
    <section className="album" aria-label={t.finale.home.title}>
      {!any && <p className="small-text">{t.finale.home.empty}</p>}
      {CHAPTER_IDS.map((id) => (
        <GalleryEntry key={id} id={id} />
      ))}
    </section>
  );
}
