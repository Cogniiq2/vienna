import { useLanguage } from '../i18n/context';

export function ChallengeCard({ text }: { text: string }) {
  const { t } = useLanguage();
  return (
    <aside className="challenge" aria-label={t.chapter.challenge}>
      <p className="eyebrow eyebrow--accent">
        {t.chapter.challenge} <span className="challenge__optional">· {t.common.optional}</span>
      </p>
      <p className="serif-quote">{text}</p>
    </aside>
  );
}
