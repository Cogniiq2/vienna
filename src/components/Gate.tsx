import { useLanguage } from '../i18n/context';
import { AppShell } from './AppShell';

/** Ruhige Vollbild-Meldung: privater Link fehlt / ungültig / lädt. */
export function Gate({ kind }: { kind: 'private' | 'invalid' | 'loading' }) {
  const { t } = useLanguage();
  if (kind === 'loading') {
    return (
      <AppShell footer={false}>
        <div className="gate gate--loading" role="status" aria-live="polite">
          <span className="loader-line" aria-hidden="true" />
          <span className="visually-hidden">{t.gate.loading}</span>
        </div>
      </AppShell>
    );
  }
  const title = kind === 'private' ? t.gate.privateTitle : t.gate.invalidTitle;
  const text = kind === 'private' ? t.gate.privateText : t.gate.invalidText;
  return (
    <AppShell>
      <div className="gate">
        <div className="gate__inner reveal">
          <span className="rule" />
          <h1 className="headline gate__title">{title}</h1>
          <p className="body-text">{text}</p>
        </div>
      </div>
    </AppShell>
  );
}
