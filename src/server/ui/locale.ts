import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { isLocale, type Locale } from "./i18n.js";

const LANG_COOKIE = "lang";
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function fromAcceptLanguage(header: string | undefined): Locale {
  if (!header) {
    return "en";
  }
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const quality = params
        .map((param) => /^q=(\d(?:\.\d+)?)$/.exec(param.trim()))
        .find((match) => match)?.[1];
      const primary = (tag.split("-")[0] ?? "").toLowerCase();
      return { primary, q: quality ? Number(quality) : 1 };
    })
    .filter((entry) => entry.primary.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const entry of ranked) {
    if (isLocale(entry.primary)) {
      return entry.primary;
    }
  }
  return "en";
}

export function resolveLocale(c: Context): Locale {
  const requested = c.req.query("lang");
  if (isLocale(requested)) {
    setCookie(c, LANG_COOKIE, requested, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return requested;
  }
  const remembered = getCookie(c, LANG_COOKIE);
  if (isLocale(remembered)) {
    return remembered;
  }
  return fromAcceptLanguage(c.req.header("accept-language"));
}
