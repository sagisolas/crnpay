# 08: Monero adapter and view-only wallet

**What to build:** A Donor picks Monero and gets a fresh subaddress for their Donation, with a `monero:` QR code that includes the amount. Payments are detected by a view-only `monero-wallet-rpc` container that reads a public remote node; the app holds no Monero key at all. See ADR-0006, ADR-0001 and the spec's "Chain adapter interface" and "Deployment".

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Compose runs `monero-wallet-rpc` with a view-only wallet created from the Streamer's main address and private view key (environment variables), stored in a persistent volume, reachable only from the app container
- [ ] Remote node URL set in config; the ticket documents a few public nodes to choose from
- [ ] App talks to wallet-rpc over JSON-RPC: creates a subaddress per Donation, reusing never-paid subaddresses as in 05, and lists incoming transfers with confirmations
- [ ] Unique-address matching rules from 05 apply unchanged
- [ ] QR code carries a `monero:` URI with the amount
- [ ] wallet-rpc responses validated with zod; malformed responses rejected
- [ ] Adapter tests use recorded wallet-rpc responses with `fetch` stubbed
- [ ] README explains creating the view-only wallet and which secrets go where
