import { dictionaries, LANGUAGES } from '../content';
import { useLanguage } from '../i18n/context';

const LABELS = { sr: 'СР', de: 'DE' } as const;

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="lang-switch" role="group" aria-label={t.common.languageLabel}>
      {LANGUAGES.map((code, i) => (
        <span key={code} className="lang-switch__item">
          {i > 0 && (
            <span className="lang-switch__sep" aria-hidden="true">
              |
            </span>
          )}
          <button
            type="button"
            className="lang-switch__btn"
            aria-pressed={lang === code}
            aria-label={dictionaries[code].common.switchTo}
            lang={dictionaries[code].meta.htmlLang}
            onClick={() => setLang(code)}
          >
            {LABELS[code]}
          </button>
        </span>
      ))}
    </div>
  );
}
