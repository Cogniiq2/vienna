import { Component, type ErrorInfo, type ReactNode } from 'react';
import { dictionaries, DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../content';
import { safeStorage } from '../lib/safeStorage';

interface State {
  failed: boolean;
}

/** Letzte Verteidigungslinie: freundliche, zweisprachige Meldung statt weißer Seite. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.warn('[vienna] UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const stored = safeStorage.get('vienna:lang') as Language | null;
    const lang = stored && LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
    const t = dictionaries[lang];
    return (
      <main className="gate">
        <div className="gate__inner">
          <span className="rule" />
          <h1 className="headline gate__title">{t.errors.genericTitle}</h1>
          <p className="body-text">{t.errors.generic}</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            {t.common.reload}
          </button>
        </div>
      </main>
    );
  }
}
