# 02: Payment detection and Donation lifecycle

**What to build:** After paying, the Donor watches the payment screen move from waiting, to "Payment seen, waiting for confirmation", to "Thank you, your Donation is confirmed", or to the Expired message. Behind it, a Payment watcher polls each Token's chain adapter every 15 s, matches transfers by exact amount, records Payments, tracks confirmations, and Confirms Donations at the Token's confirmation count. Uses the fake adapter. See `docs/domain/donations.md` ("Lifecycle", "Matching rules") and the spec's "Domain modules" and "Chain adapter interface".

**Design:** Follow `docs/design.md`; see the prototypes in `design/` for reference.

**Blocked by:** 01

**Status:** resolved

- [x] Chain adapter interface defined: incoming transfers since a cursor, each with transaction id, output or log index, receiving address, bigint amount and confirmation count
- [x] Watcher runs per Token every 15 s on an injected scheduler driven by the clock
- [x] Only a transfer of exactly the expected amount matches a unique-amount Donation; other transfers are logged as unmatched at info
- [x] Database enforces that a chain transfer matches at most one Donation and a Donation has at most one Payment
- [x] Donation becomes Confirmed when its Payment reaches the Token's confirmation count; Confirmed is logged at info with Token, amount, Nickname and message
- [x] Waiting Donations expire after 60 minutes; a matching Payment within the following 24 hours still matches and Confirms; after that the tail is released
- [x] Status endpoint returns the Donation's state by id; the payment screen polls it every 5 s and shows each state's text
- [x] Waiting Donations and their state survive a restart
- [x] Provider errors are logged and retried on the next tick without crashing the watcher
- [x] Tests through the HTTP app with the fake adapter and fake clock cover seen, confirmed, wrong amount, duplicate transfer, expiry, late Payment and tail release

## Comments

Agreed deviations and decisions:

- Every transfer is recorded once in `transfers`, matched or not, and matching runs only when a transfer is first seen. A transfer that matched nothing never matches a later Donation that took over the same tail. The transfer key also carries the Token, so ETH and an ERC-20 transfer in one transaction cannot collide.
- The adapter cursor is opaque and stored per Token. It must not move past a transfer that is not yet final.
- `main.ts` has no real adapters yet (tickets 06/07), so each Token logs "no chain adapter, payments not watched" at startup.
- Payment screen texts follow the design prototype, including "n of m confirmations" while a Payment is seen.
- Known limits, left for later: a Payment is matched by the time it is first seen, not its block time, so a provider outage across the end of the 24 h hold leaves it unmatched; reorgs that drop a seen transfer are not handled.
