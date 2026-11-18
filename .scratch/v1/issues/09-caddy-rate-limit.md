# 09: Rate limit in Caddy

**What to build:** A Donor who creates more than 5 Donations within 10 minutes from one IP gets a "too many donations, try again later" message on the donation page. The limit lives in Caddy, not in the app. See ADR-0005.

**Blocked by:** 01

**Status:** ready-for-human

- [x] Custom Caddy image built with `xcaddy` and the `caddy-ratelimit` plugin; compose uses it
- [x] Create-Donation endpoint limited to 5 requests per client IP per 10 minutes; other routes unlimited; over the limit Caddy answers 429
- [x] Donation page shows the localized "too many donations, try again later" message on 429 (already present: `rateLimited` in `src/shared/locale.ts`, handled in `src/client/donate.ts`)
- [x] App contains no rate-limiting code
- [x] README documents the limit and that running without the provided Caddy means running without it

**Note:** Docker files live in `docker/`; deploy with `cd docker && docker compose up --build`. The custom Caddy image builds cleanly (Caddy v2.8.4 with `caddy-ratelimit`) and `caddy validate` reports the Caddyfile valid with the `rate_limit` directive recognized. The live 5-per-10-min 429 behaviour over HTTP has not been exercised end to end.
