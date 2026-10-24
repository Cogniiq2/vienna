import { useState } from 'react';
import { CHAPTER_IDS } from '../config/chapters';
import { createPlaceholderPhoto } from '../lib/image';
import { currentChapterId, initialProgress, progressAtChapter, type TripProgress } from '../lib/progress';
import { useTripState, useTripStore } from '../state/context';

/**
 * Entwickler-Werkzeug (nicht für die Eltern):
 * - im Dev-Server mit ?debug=true
 * - in Builds nur, wenn VITE_ENABLE_DEBUG=true gesetzt ist, ebenfalls mit ?debug=true
 * Bewusst deutschsprachig und schlicht.
 */
export function DebugPanel() {
  const store = useTripStore();
  const state = useTripState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
      setMessage(`✓ ${label}`);
    } catch (error) {
      setMessage(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const jump = (progress: TripProgress) => run('Sprung', () => store.debugSetProgress(progress));

  const simulate = (all: boolean) =>
    run(all ? 'Alle Fotos simuliert' : 'Foto simuliert', async () => {
      const ids = all ? CHAPTER_IDS : [currentChapterId(state.progress) ?? 'morning'];
      for (const id of ids) {
        const index = CHAPTER_IDS.indexOf(id);
        const image = await createPlaceholderPhoto(`${index + 1} · ${id}`, index);
        await store.savePhoto(id, image);
      }
      if (all) {
        store.setResponse('tennis.winner.mother', 'Test A');
        store.setResponse('tennis.winner.father', 'Test B');
        store.setResponse('dinner.moment', 'Testantwort: der Spaziergang nach dem Abendessen.');
      }
    });

  const reset = () => {
    if (!window.confirm('Wirklich ALLES zurücksetzen (lokal und Server, inkl. Fotos)?')) return;
    void run('Zurückgesetzt', () => store.resetAll());
  };

  if (!open) {
    return (
      <button type="button" className="debug-toggle" onClick={() => setOpen(true)} aria-label="Debug öffnen">
        DBG
      </button>
    );
  }

  return (
    <aside className="debug" aria-label="Debug">
      <div className="debug__head">
        <strong>Debug</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Debug schließen">
          ×
        </button>
      </div>
      <p className="debug__meta">
        Phase: <b>{state.progress.phase}</b> · erledigt: {state.progress.completed.length}/6 · Verbindung:{' '}
        <b>{state.connection}</b>
        {state.pending ? ' · ausstehend' : ''}
      </p>
      <div className="debug__grid">
        <button type="button" disabled={!!busy} onClick={() => void jump({ ...initialProgress(), phase: 'opening' })}>
          Opening
        </button>
        <button type="button" disabled={!!busy} onClick={() => void jump({ ...initialProgress(), phase: 'intro' })}>
          Intro
        </button>
        {CHAPTER_IDS.map((id, i) => (
          <button key={id} type="button" disabled={!!busy} onClick={() => void jump(progressAtChapter(i))}>
            K{i + 1}
          </button>
        ))}
        <button type="button" disabled={!!busy} onClick={() => void jump(progressAtChapter(CHAPTER_IDS.length))}>
          Finale / PDF
        </button>
      </div>
      <div className="debug__grid">
        <button type="button" disabled={!!busy} onClick={() => void simulate(false)}>
          Foto (aktuell)
        </button>
        <button type="button" disabled={!!busy} onClick={() => void simulate(true)}>
          Alle Fotos + Antworten
        </button>
        <button type="button" disabled={!!busy} className="debug__danger" onClick={reset}>
          Reset alles
        </button>
      </div>
      {(busy || message) && <p className="debug__msg">{busy ? `${busy}…` : message}</p>}
    </aside>
  );
}
