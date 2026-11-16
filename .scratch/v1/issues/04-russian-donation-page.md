# 04: Russian donation page

**What to build:** A Donor whose browser prefers Russian sees the donation page, errors, Payment instructions and status texts in Russian; everyone else gets English. An EN/RU switch changes the language and is remembered. See `docs/domain/donations.md` ("Donation page") and the spec's "Locale module".

**Design:** Follow `docs/design.md`; see the prototypes in `design/` for reference.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] English and Russian dictionaries as typed objects; the compiler fails if either misses a key
- [ ] Language picked from Accept-Language, falling back to English
- [ ] EN/RU switch sets a cookie that overrides Accept-Language on later visits
- [ ] Every Donor-facing text, including validation errors and status texts from 02 if present, comes from the dictionaries
- [ ] Message and Nickname are shown as written, never translated
- [ ] Tests through the HTTP app cover Accept-Language selection, fallback, and the cookie override
