# EVM chain data comes from Etherscan V2

The EVM adapter reads incoming transfers from the Etherscan V2 unified API (`/v2/api?chainid=...`), under ADR-0003's choice of hosted providers on free tiers. One API key works across every supported EVM network, selected per request by `chainid`, so adding an EVM network is config only. Alchemy was rejected because it needs a separate app URL and key per network; plain JSON-RPC was rejected because native incoming transfers, especially internal transfers from contract wallets, are not reliably available without trace APIs.

## Consequences

- A native Token reads both `txlist` and `txlistinternal` (to catch internal transfers); an ERC-20 Token reads `tokentx` filtered to its contract, and transfers of a same-named token from any other contract are ignored.
- Confirmations are computed from the current block (`eth_blockNumber`) rather than trusting the provider's `confirmations` field, and the stored cursor stays `confirmations` blocks behind the tip so a not-yet-final transfer is reported again until it confirms.
- `tokentx` carries no log index, so transfers sharing a transaction hash are numbered by their order in the response; the order is stable across polls, which keeps the transfer key stable for de-duplication.
- The API key is read from `ETHERSCAN_API_KEY`, required at startup only when EVM Tokens are configured, and provider and network errors are re-thrown without the request URL so the key is never logged.
- The free tier caps requests at a few per second for the whole key, and every Token poll makes 2–3 calls, so the adapter instance (shared by all EVM Tokens) throttles outgoing requests to at most 3 per second across all of them.
