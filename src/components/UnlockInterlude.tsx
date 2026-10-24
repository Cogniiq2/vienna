import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/context';
import { toRoman } from '../lib/format';
import { useReducedMotion } from '../lib/hooks';
import { LockIcon } from './Icons';

const DURATION = 1900;

/** Kurzer, ruhiger Übergang: Schloss öffnet sich, nächstes Kapitel wird freigegeben. */
export function UnlockInterlude({ index, onDone }: { index: number; onDone: () => void }) {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openTimer = setTimeout(() => setOpen(true), reduced ? 0 : 450);
    const doneTimer = setTimeout(onDone, reduced ? 600 : DURATION);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, reduced]);

  return (
    <div className="interlude" role="status" aria-live="assertive">
      <div className="interlude__inner">
        <span className="interlude__lock" data-open={open ? 'true' : 'false'}>
          <LockIcon size={30} open={open} />
        </span>
        <p className="interlude__numeral">{toRoman(index + 1)}</p>
        <p className="eyebrow eyebrow--accent">{t.chapter.unlocked}</p>
      </div>
    </div>
  );
}
