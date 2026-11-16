import { IntlMessageFormat } from "intl-messageformat";

export type MessageValues = Record<string, string | number>;

const compiled = new Map<string, IntlMessageFormat>();

export function formatMessage(locale: string, message: string, values: MessageValues = {}): string {
  const key = `${locale}\u0000${message}`;
  let formatter = compiled.get(key);
  if (!formatter) {
    formatter = new IntlMessageFormat(message, locale);
    compiled.set(key, formatter);
  }
  return String(formatter.format(values));
}
