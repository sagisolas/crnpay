import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { COOKIE_MAX_AGE_SECONDS } from "../ui/locale.js";

const TOKEN_COOKIE = "token";

export function rememberToken(c: Context, tokenId: string): void {
  setCookie(c, TOKEN_COOKIE, tokenId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function rememberedToken(c: Context): string | undefined {
  return getCookie(c, TOKEN_COOKIE);
}
