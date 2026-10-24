import { useId, useState } from 'react';
import { QUESTIONS, type QuestionId } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { useTripState, useTripStore } from '../state/context';
import { CheckIcon } from './Icons';

/**
 * Eine Frage als eigene, ruhige Seite: groß gestellt, minimal beantwortet.
 * Gespeicherte Antworten erscheinen als Zitat – sie sind Teil der Geschichte, kein Formular.
 */
export function StoryQuestion({ id }: { id: QuestionId }) {
  const kind = QUESTIONS[id];
  return kind.type === 'choice' ? <ChoiceQuestion id={id} options={kind.options} /> : <TextQuestion id={id} multiline={kind.multiline} />;
}

function ChoiceQuestion({ id, options }: { id: QuestionId; options: readonly string[] }) {
  const { t } = useLanguage();
  const store = useTripStore();
  const { responses } = useTripState();
  const q = t.questions[id];
  const value = responses[id]?.value ?? '';
  const titleId = useId();

  return (
    <section className="question" aria-labelledby={titleId}>
      <h2 id={titleId} className="question__title">
        {q.title}
      </h2>
      <div className="choices" role="group" aria-labelledby={titleId}>
        {options.map((key) => (
          <button
            key={key}
            type="button"
            className="choice"
            aria-pressed={value === key}
            onClick={() => store.setResponse(id, key)}
          >
            <span>{q.options?.[key] ?? key}</span>
            {value === key && <CheckIcon size={16} />}
          </button>
        ))}
      </div>
    </section>
  );
}

function TextQuestion({ id, multiline }: { id: QuestionId; multiline: boolean }) {
  const { t } = useLanguage();
  const store = useTripStore();
  const { responses } = useTripState();
  const q = t.questions[id];
  const saved = responses[id]?.value ?? '';
  const [editing, setEditing] = useState(!saved);
  const [draft, setDraft] = useState(saved);
  const inputId = useId();

  const persist = () => {
    const clean = draft.trim();
    if (clean && clean !== saved) store.setResponse(id, clean);
    return clean;
  };

  if (!editing && saved) {
    return (
      <section className="question question--answered" aria-label={q.title}>
        <p className="question__asked">{q.title}</p>
        <blockquote className="answer-quote">„{saved}“</blockquote>
        <button
          type="button"
          className="text-link text-link--quiet"
          onClick={() => {
            setDraft(saved);
            setEditing(true);
          }}
        >
          {t.questions.ui.edit}
        </button>
      </section>
    );
  }

  const Field = multiline ? 'textarea' : 'input';
  return (
    <section className="question">
      <label htmlFor={inputId} className="question__title">
        {q.title}
      </label>
      <p className="question__hint">{q.hint ?? t.questions.ui.write}</p>
      <Field
        id={inputId}
        className="line-input"
        {...(multiline ? { rows: 2 } : { type: 'text', autoCapitalize: 'words' })}
        maxLength={multiline ? 600 : 80}
        placeholder={q.placeholder}
        value={draft}
        onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
        onBlur={() => {
          persist();
        }}
      />
      <button
        type="button"
        className="btn btn--secondary question__save"
        disabled={!draft.trim()}
        onClick={() => {
          if (persist()) setEditing(false);
        }}
      >
        {t.questions.ui.save}
      </button>
    </section>
  );
}
