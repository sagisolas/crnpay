# Spec: crnpay v1

**Status:** ready-for-agent

## Problem Statement

A Streamer wants viewers to support them in crypto and to see those Donations announced live on stream, with the Donor's Nickname and message. Existing options either put a custodial payment company in the money path (fees, KYC, frozen accounts) or require the Streamer to run heavy payment infrastructure. Donors want to pay from whatever wallet or exchange they already use, in the coin they already hold, without creating an account.

## Solution

A self-hosted service for one Streamer. A Donor opens the donation page (English or Russian), picks a Token, enters an amount, a message and an optional Nickname, and receives Payment instructions: an address shown as a QR code with a copy button, and the exact amount with a copy button. The Donor pays from any wallet. The service watches the chain, matches the Payment to the Donation, waits for the confirmation count set for that network, and then shows an Alert on the Alert page, which the Streamer has added to OBS as a browser source.

Money always goes straight into the Streamer's own wallets. The service never holds a key that can spend (ADR-0001).

v1 Tokens: Bitcoin (on-chain), ETH, ERC-20 tokens on EVM networks, TRC-20 tokens on Tron, and Monero.

## User Stories

### Donor: making a Donation

1. As a Donor, I want to open a single donation page without signing up, so that I can donate in seconds.
2. As a Donor, I want to see the Streamer's name at the top of the page, so that I know I am donating to the right person.
3. As a Donor, I want the page in my browser's language (English or Russian), so that I understand every step.
4. As a Donor, I want to switch between English and Russian and have that choice remembered, so that I am not stuck with a wrong guess.
5. As a Donor, I want to pick a Token from a list that shows both the asset and its network, so that I send the right asset over the right network.
6. As a Donor, I want to enter the amount in the Token's own units, so that I know exactly what I am sending.
7. As a Donor, I want to see the minimum amount for the chosen Token, so that my Donation is not refused.
8. As a Donor, I want to write a message of up to 300 characters, so that the Streamer reads it on stream.
9. As a Donor, I want to optionally give a Nickname of up to 32 characters, so that I am credited on stream, or stay anonymous.
10. As a Donor, I want clear errors when my amount is below the minimum, has too many decimal places, or my message is empty or too long, so that I can fix it.
11. As a Donor, I want a clear message when I have created too many Donations recently, so that I know to wait.
12. As a Donor, I want a clear message when a Token temporarily cannot accept Donations, so that I can try later or pick another Token.

### Donor: paying

13. As a Donor, I want Payment instructions with the address as a QR code, so that I can scan it with a mobile wallet.
14. As a Donor, I want a copy button for the address, so that I can paste it into an exchange or desktop wallet without typos.
15. As a Donor, I want a copy button for the exact amount, so that I send exactly what is needed.
16. As a Donor paying in Bitcoin or Monero, I want the QR code to include the amount, so that my wallet fills it in for me.
17. As a Donor paying on an EVM network or Tron, I want a clear warning that the exact amount must arrive, so that my Donation is matched.
18. As a Donor, I want to see the network next to the address, so that I do not send over the wrong network.
19. As a Donor, I want to see that the service is waiting for my Payment and how long the Payment instructions stay valid, so that I know to pay now.
20. As a Donor, I want to see "Payment seen, waiting for confirmation" as soon as my transfer appears on chain, so that I know it worked.
21. As a Donor, I want to see "Thank you, your Donation is confirmed" when it is final, so that I know my message will be shown.
22. As a Donor whose Donation expired, I want to be told that a Payment made within the next 24 hours will still be matched, so that I do not panic or pay twice.

### Streamer: Alerts

23. As a Streamer, I want an Alert page I can add to OBS as a browser source, so that Donations appear on stream.
24. As a Streamer, I want the Alert page reachable only by a secret link, so that nobody else can open my Alerts.
25. As a Streamer, I want an Alert only after a Donation is Confirmed, so that I never announce money that later disappears.
26. As a Streamer, I want each Alert to show the Nickname (or "Аноним"), the amount with its Token, and the message, in Russian, so that my audience sees who gave what.
27. As a Streamer, I want Alerts to play one at a time, oldest first, for 8 seconds each, so that simultaneous Donations do not overlap.
28. As a Streamer, I want Alerts that arrived while OBS was closed to play when it opens, so that no paid message is lost.
29. As a Streamer, I want Alerts older than 1 hour skipped on replay, so that yesterday's Donations do not appear on today's stream.
30. As a Streamer, I want an Alert shown in one OBS scene not to repeat in another, so that each Donation is announced once.
31. As a Streamer, I want a test link that shows a sample Alert, so that I can position and size the page in OBS.
32. As a Streamer, I want the Alert page to reconnect by itself after a network blip, so that I do not have to refresh OBS mid-stream.

### Streamer: setup and operation

33. As a Streamer, I want to list my Tokens in one config file, with addresses, minimums and confirmation counts, so that I control exactly what I accept.
34. As a Streamer, I want the service to refuse to start on an invalid config or environment, so that a typo never silently breaks Payments.
35. As a Streamer, I want to give only my Bitcoin extended public key (zpub), so that a unique address can be created per Donation without any spending key.
36. As a Streamer, I want Bitcoin addresses from never-paid Donations reused, so that my wallet still finds every Payment.
37. As a Streamer, I want to give only my Monero main address and private view key, so that Payments can be detected without any spending key.
38. As a Streamer, I want ETH, ERC-20 and TRC-20 Donations to arrive at my one address per network, so that I never sweep funds from many addresses.
39. As a Streamer, I want unique-amount tails worth at most cents, so that Donors are not overcharged.
40. As a Streamer, I want every Confirmed Donation written to the log with Token, amount, Nickname and message, so that I have a record without a history page.
41. As a Streamer, I want transfers that match nothing (wrong amount, below minimum, later transfers to a used address) logged, so that I can explain missing Alerts.
42. As a Streamer, I want to run everything with one `docker compose up`, including HTTPS, the rate limit and the Monero wallet, so that hosting stays simple.
43. As a Streamer, I want my secrets (Alert link secret, provider API keys, Monero view key) only in environment variables and never in logs, so that they do not leak.
44. As a Streamer, I want the service to keep working through a restart without losing waiting Donations or unshown Alerts, so that redeploys are safe.

## Implementation Decisions

### Config and environment

- The JSON config gains the Streamer's display name and, per Token, a `chain` (`bitcoin`, `evm`, `tron`, `monero`) next to the existing fields. The matching method follows from the chain: `bitcoin` and `monero` use unique address, `evm` and `tron` use unique amount.
- Unique-amount Tokens carry the shared address and an `amountTailStep` (decimal string in Token units). EVM Tokens carry the EVM chain id and, for ERC-20, the token contract address; native ETH has none. TRC-20 Tokens carry the token contract address.
- Bitcoin Tokens carry a zpub (native SegWit, BIP84). Monero Tokens carry nothing secret in the config; the main address and private view key are environment variables consumed by the wallet container, and the app gets the wallet-rpc URL.
- Provider API keys and URLs (Etherscan, TronGrid, mempool.space base URL, wallet-rpc URL) are environment variables, validated at startup.
- The config refuses Tokens with duplicate (chain, network, contract) pairs.

### Domain modules

- **Donation module**: creates a Donation, validates the form, allocates Payment instructions, and reports a Donation's state for the status endpoint. It owns the lifecycle (Waiting → Payment seen → Confirmed, or Expired) and all time-based rules (60 min window, 24 h hold), reading time from an injected clock.
- **Payment instructions allocation**: unique amount picks a random free tail (1–9999 steps) not held by any Donation of the same Token that is Waiting or within its 24 h hold; unique address asks the chain adapter for the next address, preferring a never-paid address from a Donation past its hold.
- **Payment watcher**: on a fixed interval (15 s) per Token, asks the Token's chain adapter for incoming transfers, matches each to a Donation by the Token's matching method, records Payments, updates confirmation counts, and moves Donations to Confirmed. Runs on an injected scheduler so tests drive it through the clock.
- **Alert module**: creates one Alert per Confirmed Donation, broadcasts it to connected Alert pages over Server-Sent Events, records when it was shown, and on connect replays unshown Alerts Confirmed within the last hour.
- **Locale module**: typed dictionaries for English and Russian with compile-time key parity, written as ICU messages and formatted with FormatJS `intl-messageformat` (ADR-0007). The Donor's message and Nickname are never translated.

### Chain adapter interface

Each chain family implements one adapter behind a common interface: list incoming transfers to the Token's address(es) since a cursor, each with transaction id, output or log index, receiving address, amount as bigint base units and confirmation count; unique-address adapters additionally provide the address for a given index (Bitcoin derives it locally, Monero asks wallet-rpc for a subaddress). All provider responses are validated with zod.

- **Bitcoin**: zpub derivation in-process; incoming transfers from the mempool.space API.
- **EVM**: native ETH and ERC-20 transfers from the Etherscan V2 API (normal, internal and token transfer lists), confirmations from the current block number.
- **Tron**: TRC-20 transfers from the TronGrid API.
- **Monero**: subaddress creation and incoming transfers from `monero-wallet-rpc` in view-only mode against a public remote node (ADR-0006).

### Storage

SQLite through better-sqlite3 with plain SQL in one storage module; numbered SQL migrations applied at startup. Until v1 is released there is only the initial migration: schema changes edit it instead of adding a new one, and a database from an older build is deleted, not upgraded. Amounts are stored as decimal text of base units and handled only as bigint. Invariants enforced by the database:

- A chain transfer (network, transaction id, output or log index) matches at most one Donation.
- No two held Donations of the same Token share an amount (unique amount) or an address (unique address). Held means Waiting or within the 24 h hold.
- A Donation has at most one Payment and at most one Alert.

Donation ids are random UUIDs, the only handle a Donor has.

### HTTP API and pages

- Donation page (server-rendered with Hono JSX, both locales), create-Donation endpoint returning Payment instructions, and a Donation status endpoint polled every 5 s by the payment screen.
- Test Token: the donation page opened with the Alert key lists a built-in Test Token, and its payment screen can send test payments of any amount through an in-memory test chain (one confirmation per watcher tick, 2 needed). Without the key it does not exist (ADR-0008).
- Alert page, Alert event stream, Alert shown acknowledgement and test Alert, all requiring the secret key from the query string, compared in constant time. The Alert page text is Russian only.
- All user text (message, Nickname) is rendered as text, never HTML, on both pages.
- QR codes: `bitcoin:` and `monero:` payment URIs with amount; plain address for EVM and Tron.

### Logging

Info level: Donation created (Token, amount), Payment seen, Donation Confirmed (Token, amount, Nickname, message), Alert shown, unmatched transfers, provider errors, startup and shutdown. Request logs stay at debug. Secrets are redacted and query strings never logged.

### Deployment

- Caddy is built with the `caddy-ratelimit` plugin and limits the create-Donation endpoint to 5 requests per IP per 10 minutes, answering 429 (ADR-0005).
- `monero-wallet-rpc` runs as a separate container with a view-only wallet in a persistent volume, reachable only from the app container.

## Testing Decisions

- Tests exercise external behaviour only: what a Donor or the Alert page sees over HTTP, and what an adapter reports for a given provider response. Internal modules are not tested directly.
- **HTTP app seam**: the app is built with an in-memory SQLite database, a fake chain adapter whose incoming transfers the test sets, and a fake clock that also drives the Payment watcher. This covers form validation, Payment instructions, tail allocation and exhaustion, address reuse, the lifecycle including expiry and late Payments, matching rules, the status endpoint, the Alert stream, acknowledgement, replay and the 1 h limit, and the secret key check.
- **Adapter seam**: each real adapter is tested against recorded provider responses with `fetch` stubbed (and wallet-rpc responses recorded for Monero); tests never touch the network. Bitcoin derivation is checked against the published BIP84 test vectors. Malformed provider responses must be rejected, not guessed at.
- Prior art: the existing colocated Vitest tests for config, env, amounts and the app (`app.request`), including the test that query strings never reach the log.

## Out of Scope

- Multiple Streamers, accounts or logins.
- Lightning, Solana, and any chain not listed above.
- Fiat amounts or price feeds.
- A Donation history page or dashboard.
- Configurable Alert look, sound, text-to-speech, or Alert page language other than Russian.
- Message moderation or profanity filtering.
- Refunds or any action that moves funds.
- Cross-checking a second data provider.

## Further Notes

- Concrete free providers per chain are chosen in each adapter's ticket; prefer free tiers (ADR-0003).
- Accepted risks: false Payments from a compromised provider (ADR-0003), address tampering after server compromise (ADR-0004), Monero incoming history leak after server compromise (ADR-0001).
