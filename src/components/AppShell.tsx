import type { ReactNode } from 'react';
import { useLanguage } from '../i18n/context';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AppShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__date" aria-label={t.common.dateLong}>
          {t.common.dateShort}
        </span>
        <LanguageSwitcher />
      </header>
      <main className="shell__main" id="main">
        {children}
      </main>
      {footer && (
        <footer className="shell__footer">
          <p>{t.common.footer}</p>
        </footer>
      )}
    </div>
  );
}
