import type { ReactNode } from 'react';
import { family } from '../config/family';
import { useLanguage } from '../i18n/context';
import { LanguageSwitcher } from './LanguageSwitcher';

interface Props {
  children: ReactNode;
  footer?: boolean;
  /** 'none' = Vollbild ohne Kopfzeile (Bonus-Sequenz). */
  chrome?: 'full' | 'none';
}

export function AppShell({ children, footer = true, chrome = 'full' }: Props) {
  const { t, lang } = useLanguage();
  const names = family.children.map((c) => c.name[lang]);
  const signed = `${names.slice(0, -1).join(', ')} ${t.common.and} ${names[names.length - 1] ?? ''}`;
  return (
    <div className="shell" data-chrome={chrome}>
      {chrome === 'full' && (
        <header className="shell__header">
          <span className="shell__date" aria-label={t.common.dateLong}>
            {t.common.dateShort}
          </span>
          <LanguageSwitcher />
        </header>
      )}
      <main className="shell__main" id="main">
        {children}
      </main>
      {footer && chrome === 'full' && (
        <footer className="shell__footer">
          <p>
            {t.common.footer} <span className="hand">{signed}</span>
          </p>
        </footer>
      )}
    </div>
  );
}
