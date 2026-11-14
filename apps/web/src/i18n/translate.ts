import { type Language, useLanguage } from './language';
import { en, type MessageKey, mk, mkCategoryNames } from './messages';

export type Params = Record<string, string | number>;

/** The text for `key` in `language`, English when there is no translation, with placeholders filled. */
export function translate(language: Language, key: MessageKey, params: Params = {}): string {
  const text = (language === 'mk' ? mk[key] : undefined) ?? en[key];
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** A default category or group name in `language`; any other name is returned unchanged. */
export function categoryLabel(language: Language, name: string): string {
  return (language === 'mk' ? mkCategoryNames[name] : undefined) ?? name;
}

/** Translation helpers for a component; it re-renders when the language changes. */
export function useT() {
  const language = useLanguage();
  return {
    language,
    t: (key: MessageKey, params?: Params) => translate(language, key, params),
    category: (name: string) => categoryLabel(language, name),
  };
}
