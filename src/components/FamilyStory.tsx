import { useMemo, useState } from 'react';
import { FAMILY_STORY } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { hasFamilyMedia } from '../lib/frames';
import { useTripStore } from '../state/context';
import { ArrowIcon } from './Icons';
import { ChildrenVoices, FamilyVideo } from './MediaPlayers';
import { StorySequence } from './StorySequence';

/**
 * „Ваша прича.“ – die Familiengeschichte, getrennt vom Dienstag:
 * Album-Seiten (Gradski Klub, Hochzeit, Familie, was ihr aufgebaut habt) → Video & Stimmen → Schluss.
 * Alles datengetrieben: was im Admin hochgeladen ist, erscheint; was fehlt, wird ruhig ausgelassen.
 */
export function FamilyStory({ onDone }: { onDone: () => void }) {
  const { t } = useLanguage();
  const store = useTripStore();
  const media = hasFamilyMedia((s) => store.hasAsset(s));
  const [stage, setStage] = useState<'pages' | 'media' | 'ending'>('pages');
  const pages = useMemo(() => FAMILY_STORY.flatMap((id) => t.interludes[id]), [t]);

  if (stage === 'pages') {
    return <StorySequence frames={pages} eyebrow={t.familyStory.eyebrow} onDone={() => setStage(media ? 'media' : 'ending')} immersive />;
  }
  if (stage === 'media') {
    return (
      <section className="story finale finale--media">
        {store.hasAsset('familyVideo') && (
          <div className="story__screen">
            <FamilyVideo />
          </div>
        )}
        <div className="story__screen">
          <ChildrenVoices />
          <div className="page__action">
            <button
              type="button"
              className="btn btn--primary btn--large"
              onClick={() => {
                setStage('ending');
                window.scrollTo({ top: 0 });
              }}
            >
              <span>{t.common.next}</span>
              <ArrowIcon size={18} />
            </button>
          </div>
        </div>
      </section>
    );
  }
  return <StorySequence frames={t.familyStory.ending} onDone={onDone} doneLabel={t.familyStory.back} immersive />;
}
