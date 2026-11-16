# 02: Payment detection and Donation lifecycle

**What to build:** After paying, the Donor watches the payment screen move from waiting, to "Payment seen, waiting for confirmation", to "Thank you, your Donation is confirmed", or to the Expired message. Behind it, a Payment watcher polls each Token's chain adapter every 15 s, matches transfers by exact amount, records Payments, tracks confirmations, and Confirms Donations at the Token's confirmation count. Uses the fake adapter. See `docs/domain/donations.md` ("Lifecycle", "Matching rules") and the spec's "Domain modules" and "Chain adapter interface".

**Design:** Follow `docs/design.md`; see the prototypes in `design/` for reference.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Chain adapter interface defined: incoming transfers since a cursor, each with transaction id, output or log index, receiving address, bigint amount and confirmation count
- [ ] Watcher runs per Token every 15 s on an injected scheduler driven by the clock
- [ ] Only a transfer of exactly the expected amount matches a unique-amount Donation; other transfers are logged as unmatched at info
- [ ] Database enforces that a chain transfer matches at most one Donation and a Donation has at most one Payment
- [ ] Donation becomes Confirmed when its Payment reaches the Token's confirmation count; Confirmed is logged at info with Token, amount, Nickname and message
- [ ] Waiting Donations expire after 60 minutes; a matching Payment within the following 24 hours still matches and Confirms; after that the tail is released
- [ ] Status endpoint returns the Donation's state by id; the payment screen polls it every 5 s and shows each state's text
- [ ] Waiting Donations and their state survive a restart
- [ ] Provider errors are logged and retried on the next tick without crashing the watcher
- [ ] Tests through the HTTP app with the fake adapter and fake clock cover seen, confirmed, wrong amount, duplicate transfer, expiry, late Payment and tail release
