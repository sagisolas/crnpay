# 01: Donation form to Payment instructions

**What to build:** A Donor opens the donation page (English), picks a unique-amount Token, enters an amount, a message and an optional Nickname, submits, and sees Payment instructions: the shared address as a QR code with a copy button, the network, and the exact amount (requested amount plus a unique tail) with a copy button and a "send exactly this amount" warning. Runs against a fake chain adapter; no real chain yet. Lays the groundwork the other tickets build on: SQLite storage with migrations, an injectable clock, and the config additions. See the spec sections "Config and environment", "Storage" and "HTTP API and pages", and `docs/domain/donations.md`.

**Design:** Follow `docs/design.md`; see the prototypes in `design/` for reference.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Config accepts the Streamer's display name and, per Token, `chain` and (for unique-amount Tokens) `amountTailStep`; invalid values stop startup
- [ ] SQLite storage via better-sqlite3 with plain SQL in one module; numbered SQL migrations applied at startup; amounts stored as base-unit text and handled only as bigint
- [ ] Database enforces: no two held Donations of the same Token share an amount; Donation ids are random UUIDs
- [ ] Donation page is server-rendered, shows the Streamer's name, lists Tokens with asset and network, and shows each Token's minimum
- [ ] Create-Donation endpoint validates Token, amount (minimum, decimal places), message (1–300 chars) and Nickname (≤32 chars), trimming and stripping control characters, and returns localized-ready error codes
- [ ] Tail is a random 1–9999 steps of the Token's `amountTailStep`, never one held by a Waiting Donation or one within its 24 h hold; when none is free, the Token answers "try again later"
- [ ] Payment instructions show a QR code of the address, copy buttons for address and amount, and the exact-amount warning
- [ ] Message and Nickname are never rendered as HTML
- [ ] Donation created is logged at info (Token, amount)
- [ ] Tests through the HTTP app with in-memory SQLite, fake adapter and fake clock cover validation, tail allocation, tail exhaustion and HTML escaping
