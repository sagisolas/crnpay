# 07: Tron adapter for TRC-20

**What to build:** A Donor can donate a TRC-20 token (for example USDT on Tron) using the unique-amount Payment instructions, and the Donation Confirms after the configured confirmations. See the spec's "Chain adapter interface" and ADR-0003.

**Blocked by:** 02

**Status:** resolved

- [x] Config accepts TRC-20 Tokens with the token contract address; addresses validated as Tron addresses
- [x] Adapter lists incoming TRC-20 transfers to the Streamer's address via a free provider (TronGrid or equivalent)
- [x] Only transfers from the configured contract count
- [x] Confirmations computed from the current block number
- [x] API key from the environment, validated at startup, never logged
- [x] Provider responses validated with zod; malformed responses rejected
- [x] Adapter tests use recorded provider responses with `fetch` stubbed
