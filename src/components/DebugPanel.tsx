import { useState } from 'react';
import { CHAPTER_IDS, FINALE_STAGES, QUESTIONS, seenKey, STORY, type QuestionId } from '../config/chapters';
import type { AssetSlot } from '../config/family';
import { forceEpilogue } from '../lib/epilogue';
import { createPlaceholderPhoto } from '../lib/image';
import { createDebugAudio, createDebugVideo } from '../lib/debugMedia';
import { currentChapterId, initialProgress, progressAtStep, type TripProgress } from '../lib/progress';
import { useTripState, useTripStore } from '../state/context';

const SAMPLE_ANSWERS: Record<QuestionId, string> = {
  'morning.firstAwake': 'father',
  'morning.noWork': 'try',
  'tennis.mother.favorite': 'Синер',
  'tennis.father.food': 'set',
  'spa.lastDay': 'Искрено, не сећамо се. Можда пре тридесет година, на мору.',
  'dinner.still': 'Што се и даље смејемо истим глупостима.',
  'dinner.moment': 'Шетња кроз парк у Шенбруну, без журбе.',
  'dinner.repeat': 'Сауну. И доручак без сата.',
  'epilogue.takeaway': 'Да можемо и ми понекад да станемо.',
};

const STEP_LABELS: Record<string, string> = {
  gradskiKlub: 'Gradski Klub',
  wedding: 'Hochzeit',
  family: 'Familie',
  work: 'Arbeit',
};
// Interludes stehen aktuell nicht im Dienstag (STORY); die Labels bleiben für spätere Abläufe.

/**
 * Entwickler-Werkzeug (nicht für die Eltern):
 * - im Dev-Server mit ?debug=true
 * - in Builds nur, wenn VITE_ENABLE_DEBUG=true gesetzt ist, ebenfalls mit ?debug=true
 */
export function DebugPanel() {
  const store = useTripStore();
  const state = useTripState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<void> | void) => {
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

  const jump = (label: string, progress: TripProgress) => run(label, () => store.debugSetProgress(progress));
  const finaleAt = (stages: number) =>
    progressAtStep(STORY.length, undefined, FINALE_STAGES.slice(0, stages).map((s) => seenKey.finale(s)));

  const simulatePhotos = (all: boolean) =>
    run(all ? 'Fotos + Antworten' : 'Foto (aktuell)', async () => {
      const ids = all ? CHAPTER_IDS : [currentChapterId(state.progress) ?? 'morning'];
      for (const id of ids) {
        const index = CHAPTER_IDS.indexOf(id);
        await store.savePhoto(id, await createPlaceholderPhoto(`${index + 1} · ${id}`, index));
      }
      if (all) for (const q of Object.keys(QUESTIONS) as QuestionId[]) store.setResponse(q, SAMPLE_ANSWERS[q]);
    });

  const simulateFamilyPhotos = () =>
    run('Familienfotos', async () => {
      const slots: AssetSlot[] = ['familyCurrent', 'parentsCurrent', 'gradskiKlub', 'wedding', 'familyEarly'];
      for (const [i, slot] of slots.entries()) {
        const image = await createPlaceholderPhoto(slot, i + 2);
        store.debugSetAsset(slot, URL.createObjectURL(image.blob));
      }
    });

  const simulateFamilyCurrent = () =>
    run('Familienfoto', async () => {
      const image = await createPlaceholderPhoto('familyCurrent', 2);
      store.debugSetAsset('familyCurrent', URL.createObjectURL(image.blob));
    });

  const simulateAudio = () =>
    run('Audios', () => {
      (['audioDjordje', 'audioBogdana', 'audioLazar'] as const).forEach((slot, i) =>
        store.debugSetAsset(slot, URL.createObjectURL(createDebugAudio(3 + i, 330 + i * 110))),
      );
    });

  const simulateVideo = () =>
    run('Video', async () => {
      const video = await createDebugVideo();
      if (!video) throw new Error('MediaRecorder in diesem Browser nicht verfügbar');
      store.debugSetAsset('familyVideo', URL.createObjectURL(video));
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

  const disabled = Boolean(busy);
  return (
    <aside className="debug" aria-label="Debug">
      <div className="debug__head">
        <strong>Debug</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Debug schließen">
          ×
        </button>
      </div>
      <p className="debug__meta">
        Phase: <b>{state.progress.phase}</b> · Kapitel {state.progress.completed.length}/6 · gesehen {state.progress.seen.length} ·{' '}
        <b>{state.connection}</b>
        {state.pending ? ' · ausstehend' : ''}
      </p>

      <p className="debug__label">Ablauf</p>
      <div className="debug__grid">
        <button type="button" disabled={disabled} onClick={() => void jump('Opening', initialProgress())}>
          Opening
        </button>
        <button type="button" disabled={disabled} onClick={() => void jump('Intro', { ...initialProgress(), phase: 'intro' })}>
          Intro
        </button>
        {STORY.map((step, i) => (
          <button key={`${step.kind}-${step.id}`} type="button" disabled={disabled} onClick={() => void jump(step.id, progressAtStep(i))}>
            {step.kind === 'chapter' ? `K${CHAPTER_IDS.indexOf(step.id) + 1}` : `♡ ${STEP_LABELS[step.id] ?? step.id}`}
          </button>
        ))}
      </div>

      <p className="debug__label">Finale</p>
      <div className="debug__grid">
        <button type="button" disabled={disabled} onClick={() => void jump('Brief', finaleAt(0))}>
          Brief
        </button>
        <button type="button" disabled={disabled} onClick={() => void jump('Abschluss', finaleAt(1))}>
          Abschluss
        </button>
        <button type="button" disabled={disabled} onClick={() => void jump('Ваш дан', finaleAt(2))}>
          Album / PDF / Geschichte
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            forceEpilogue();
            void jump('Epilog freigeschaltet (Album öffnen)', finaleAt(2));
          }}
        >
          Epilog
        </button>
      </div>

      <p className="debug__label">Simulieren</p>
      <div className="debug__grid">
        <button type="button" disabled={disabled} onClick={() => void simulatePhotos(false)}>
          Foto (aktuell)
        </button>
        <button type="button" disabled={disabled} onClick={() => void simulatePhotos(true)}>
          Alle Fotos + Antworten
        </button>
        <button type="button" disabled={disabled} onClick={() => void simulateFamilyCurrent()}>
          Nur Familienfoto
        </button>
        <button type="button" disabled={disabled} onClick={() => void simulateFamilyPhotos()}>
          Alle Familienfotos
        </button>
        <button type="button" disabled={disabled} onClick={() => void simulateAudio()}>
          Audios
        </button>
        <button type="button" disabled={disabled} onClick={() => void simulateVideo()}>
          Video
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void run('Nachricht', () => store.debugAddMessage('Видимо да сте преживели тенис 😄'))}
        >
          Live-Nachricht
        </button>
        <a className="debug__link" href="/admin?demo=1" target="_blank" rel="noreferrer">
          Admin (Demo-Daten)
        </a>
        <button type="button" disabled={disabled} className="debug__danger" onClick={reset}>
          Reset alles
        </button>
      </div>
      {(busy || message) && <p className="debug__msg">{busy ? `${busy}…` : message}</p>}
    </aside>
  );
}
