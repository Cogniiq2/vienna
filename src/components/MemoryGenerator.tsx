import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/context';
import { useReducedMotion } from '../lib/hooks';
import { buildMemory } from '../lib/memory';
import { useTripStore } from '../state/context';
import { DownloadIcon, ShareIcon } from './Icons';

type Status =
  | { kind: 'working'; step: number }
  | { kind: 'ready'; url: string; file: File; missing: number }
  | { kind: 'error' };

const STEP_MS = 950;

function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Inszenierte PDF-Erstellung mit Download & Teilen.
 * Startet beim Einblenden; bei Sprachwechsel wird das Album in der neuen Sprache neu gesetzt.
 */
export function MemoryGenerator() {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<Status>({ kind: 'working', step: 0 });
  const runId = useRef(0);
  const readyUrl = status.kind === 'ready' ? status.url : null;

  useEffect(() => {
    if (!readyUrl) return;
    return () => URL.revokeObjectURL(readyUrl);
  }, [readyUrl]);

  const generate = async () => {
    const id = ++runId.current;
    setStatus({ kind: 'working', step: 0 });
    const steps = t.memory.steps.length;
    const ticker = setInterval(() => {
      setStatus((s) => (s.kind === 'working' && s.step < steps - 1 ? { kind: 'working', step: s.step + 1 } : s));
    }, STEP_MS);
    const minDuration = new Promise((r) => setTimeout(r, reduced ? 0 : STEP_MS * steps));
    try {
      const [result] = await Promise.all([buildMemory(store, lang, t), minDuration]);
      if (id !== runId.current) return;
      const file = new File([result.blob], result.fileName, { type: 'application/pdf' });
      setStatus({ kind: 'ready', url: URL.createObjectURL(file), file, missing: result.missing });
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[vienna] PDF', error);
      if (id === runId.current) setStatus({ kind: 'error' });
    } finally {
      clearInterval(ticker);
    }
  };

  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  });
  useEffect(() => {
    const runs = runId;
    void generateRef.current();
    return () => {
      runs.current++;
    };
  }, [lang]);

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: t.memory.shareTitle });
    } catch {
      /* Abbruch durch Nutzer – kein Fehler */
    }
  };

  if (status.kind === 'working') {
    return (
      <section className="memory memory--working" aria-live="polite" aria-busy="true">
        <span className="memory__progress" aria-hidden="true">
          <span />
        </span>
        <p key={status.step} className="serif-quote memory__step reveal-fade">
          {t.memory.steps[status.step]}
        </p>
      </section>
    );
  }

  if (status.kind === 'error') {
    return (
      <section className="memory" role="alert">
        <p className="body-text">{t.memory.error}</p>
        <button type="button" className="btn btn--secondary" onClick={() => void generate()}>
          {t.memory.retry}
        </button>
      </section>
    );
  }

  return (
    <section className="memory memory--ready reveal" aria-live="polite">
      <span className="rule" aria-hidden="true" />
      <h2 className="headline memory__title">{t.memory.ready}</h2>
      <p className="body-text">{t.memory.readyText}</p>
      {status.missing > 0 && <p className="small-text">{t.memory.missingPhotos}</p>}
      <div className="memory__actions">
        <a className="btn btn--primary btn--large" href={status.url} download={status.file.name}>
          <DownloadIcon size={18} />
          <span>{t.memory.download}</span>
        </a>
        {canShareFile(status.file) && (
          <button type="button" className="btn btn--secondary btn--large" onClick={() => void share(status.file)}>
            <ShareIcon size={18} />
            <span>{t.memory.share}</span>
          </button>
        )}
        <button type="button" className="text-link text-link--quiet" onClick={() => void generate()}>
          {t.memory.regenerate}
        </button>
      </div>
    </section>
  );
}
