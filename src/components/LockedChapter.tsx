import { useLanguage } from '../i18n/context';
import { toRoman } from '../lib/format';
import { LockIcon } from './Icons';

/** Verdeckte Vorschau des nächsten Kapitels – ohne Inhalte zu verraten. */
export function LockedChapter({ index }: { index: number }) {
  const { t } = useLanguage();
  return (
    <aside className="locked" aria-label={t.chapter.locked}>
      <div className="locked__veil" aria-hidden="true">
        <span className="locked__numeral">{toRoman(index + 1)}</span>
        <span className="locked__line locked__line--lg" />
        <span className="locked__line locked__line--md" />
        <span className="locked__line locked__line--sm" />
      </div>
      <div className="locked__label">
        <LockIcon size={18} />
        <p className="eyebrow">{t.chapter.label(toRoman(index + 1))}</p>
        <p className="body-text">{t.chapter.locked}</p>
        <p className="small-text">{t.chapter.lockedHint}</p>
      </div>
    </aside>
  );
}
