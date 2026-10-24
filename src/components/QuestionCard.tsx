import { useEffect, useId, useRef, useState } from 'react';
import type { QuestionId } from '../config/chapters';
import { trip } from '../config/trip';
import { useLanguage } from '../i18n/context';
import { useTripState, useTripStore } from '../state/context';
import { CheckIcon } from './Icons';

const SAVE_DELAY = 600;

/** Eingabefeld, das selbstständig (debounced) speichert. */
function useAutosave(questionId: QuestionId) {
  const store = useTripStore();
  const { responses } = useTripState();
  const stored = responses[questionId]?.value ?? '';
  const [value, setValue] = useState(stored);
  const [savedFlash, setSavedFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(false);

  // Werte von einem anderen Gerät übernehmen, solange hier nicht getippt wird.
  const [lastStored, setLastStored] = useState(stored);
  if (stored !== lastStored) {
    setLastStored(stored);
    if (!editing) setValue(stored);
  }

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    setEditing(false);
    const trimmed = latest.current.trim();
    if (trimmed === stored.trim()) return;
    store.setResponse(questionId, trimmed);
    setSavedFlash(true);
  };

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 1800);
    return () => clearTimeout(t);
  }, [savedFlash]);

  // Beim Verlassen des Kapitels nichts verlieren.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    dirty.current = true;
    setEditing(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  return { value, onChange, onBlur: flush, savedFlash };
}

function SavedHint({ visible }: { visible: boolean }) {
  const { t } = useLanguage();
  return (
    <span className="question__saved" data-visible={visible ? 'true' : 'false'} aria-live="polite">
      {visible && (
        <>
          <CheckIcon size={14} /> {t.questions.saved}
        </>
      )}
    </span>
  );
}

function WinnerInput({ questionId, label }: { questionId: QuestionId; label: string }) {
  const { t } = useLanguage();
  const id = useId();
  const field = useAutosave(questionId);
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="words"
        maxLength={80}
        placeholder={t.questions.winnerPlaceholder}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
      <SavedHint visible={field.savedFlash} />
    </div>
  );
}

export function WinnerQuestion() {
  const { t, lang } = useLanguage();
  return (
    <section className="question" aria-labelledby="q-winner">
      <p className="eyebrow">{t.chapter.question}</p>
      <h2 id="q-winner" className="serif-quote">
        {t.questions.winnerTitle}
      </h2>
      <p className="small-text">{t.questions.winnerHint}</p>
      <div className="question__fields question__fields--pair">
        <WinnerInput questionId="tennis.winner.mother" label={trip.family.mother[lang]} />
        <WinnerInput questionId="tennis.winner.father" label={trip.family.father[lang]} />
      </div>
    </section>
  );
}

export function MomentQuestion() {
  const { t } = useLanguage();
  const id = useId();
  const field = useAutosave('dinner.moment');
  return (
    <section className="question" aria-labelledby={`${id}-title`}>
      <p className="eyebrow">{t.chapter.question}</p>
      <h2 id={`${id}-title`} className="serif-quote">
        <label htmlFor={id}>{t.questions.momentTitle}</label>
      </h2>
      <p className="small-text">{t.questions.momentHint}</p>
      <div className="field">
        <textarea
          id={id}
          className="field__input field__textarea"
          rows={4}
          maxLength={600}
          placeholder={t.questions.momentPlaceholder}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
        />
        <SavedHint visible={field.savedFlash} />
      </div>
    </section>
  );
}
