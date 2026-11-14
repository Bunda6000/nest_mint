import { LANGUAGES, type Language, setLanguage } from './language';
import { useT } from './translate';

const NAMES: Record<Language, string> = { en: 'EN', mk: 'МК' };

/** English / Macedonian toggle. The choice is remembered on this device. */
export function LanguageSwitch() {
  const { t, language } = useT();
  return (
    <div role="group" aria-label={t('common.language')} className="flex gap-1">
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={language === option}
          onClick={() => setLanguage(option)}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 aria-pressed:bg-emerald-700 aria-pressed:text-white"
        >
          {NAMES[option]}
        </button>
      ))}
    </div>
  );
}
