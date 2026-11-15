# 09: Rate limit in Caddy

**What to build:** A Donor who creates more than 5 Donations within 10 minutes from one IP gets a "too many donations, try again later" message on the donation page. The limit lives in Caddy, not in the app. See ADR-0005.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Custom Caddy image built with `xcaddy` and the `caddy-ratelimit` plugin; compose uses it
- [ ] Create-Donation endpoint limited to 5 requests per client IP per 10 minutes; other routes unlimited; over the limit Caddy answers 429
- [ ] Donation page shows the localized "too many donations, try again later" message on 429
- [ ] App contains no rate-limiting code
- [ ] README documents the limit and that running without the provided Caddy means running without it
