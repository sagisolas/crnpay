# Tron chain data comes from TronGrid

The Tron adapter reads incoming TRC-20 transfers from TronGrid, under ADR-0003's choice of hosted providers on free tiers. TronGrid is run by the TRON DAO, has a free key-based tier, and offers both an indexed per-account TRC-20 transfer list and the plain java-tron HTTP API, so one provider covers listing and confirmations. Tronscan's API was rejected because it is unofficial for programmatic use and rate limits more tightly.

## Consequences

- Transfers are listed with `/v1/accounts/{address}/transactions/trc20?only_to=true&contract_address=...`, and each row is checked again against the configured address and contract, so transfers of a same-named token from any other contract are ignored. Native TRX is not supported.
- The list carries only a block timestamp, so each listed transfer's block number is read with `/wallet/gettransactioninfobyid`, which also confirms the transaction's receipt is `SUCCESS`. A listed transfer the node does not yet know holds the cursor at its timestamp, so lag between TronGrid's index and its nodes cannot skip it. Confirmations are computed from the current block (`/wallet/getblock`) rather than TronGrid's confirmed/unconfirmed flag.
- The cursor is the timestamp of the oldest block that is not yet final (`tip - confirmations + 1`), passed back as `min_timestamp`, so a not-yet-final transfer is reported again until it confirms. With no stored cursor, listing starts from that block rather than from genesis, which keeps the per-transfer lookups bounded; Donations cannot predate the first poll of a newly added Token by more than a few seconds.
- The list carries no event index, so transfers sharing a transaction id are numbered by their order in the response, as with Etherscan's `tokentx` (ADR-0009).
- The API key is read from `TRONGRID_API_KEY`, required at startup only when Tron Tokens are configured, and sent in the `TRON-PRO-API-KEY` header; provider and network errors are re-thrown without request details so the key is never logged.
