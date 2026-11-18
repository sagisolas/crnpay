import { LOCALES, useI18n, type Locale } from "./i18n.js";

function hrefFor(locale: Locale, keyParam: string | undefined): string {
  const params = new URLSearchParams({ lang: locale });
  if (keyParam) {
    params.set("key", keyParam);
  }
  return `?${params.toString()}`;
}

export function LocaleSwitch({ keyParam }: { keyParam?: string | undefined }) {
  const { locale, strings: t } = useI18n();
  return (
    <div class="lang" role="group" aria-label={t.languageLabel}>
      {LOCALES.map((option) => (
        <a
          class="lang-option"
          href={hrefFor(option, keyParam)}
          aria-current={option === locale ? "true" : undefined}
          hreflang={option}
        >
          {option.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
