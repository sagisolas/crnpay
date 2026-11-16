import { createContext, useContext } from "hono/jsx";
import { formatMessage, type MessageValues } from "../../shared/i18n.js";
import { en, type Dictionary } from "../../shared/locale.js";

const dictionaries = { en } satisfies Record<string, Dictionary>;

type Locale = keyof typeof dictionaries;

interface I18n {
  locale: Locale;
  strings: Dictionary;
  phrase: (key: keyof Dictionary, values?: MessageValues) => string;
}

const I18nContext = createContext<I18n | null>(null);

export const I18nProvider = I18nContext.Provider;

export function createI18n(locale: Locale): I18n {
  const strings = dictionaries[locale];
  return {
    locale,
    strings,
    phrase: (key, values) => formatMessage(locale, strings[key], values),
  };
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
