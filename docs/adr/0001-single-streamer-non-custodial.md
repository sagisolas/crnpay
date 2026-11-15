# Single Streamer, non-custodial, watch-only

Each deployment serves exactly one Streamer, and the service never holds a key that can spend: it knows only the Streamer's public addresses and extended public keys, plus a Monero private view key, and detects Payments by watching the chain. Donors pay straight into the Streamer's own wallets, so a compromised server cannot move any funds. Multi-streamer hosting, third-party payment gateways (NOWPayments, CoinPayments) and BTCPay Server were rejected: the first multiplies the security surface, the gateways put a company with fees, KYC and freeze risk in the money path, and BTCPay is weak on EVM tokens.

## Consequences

- Monero cannot be watched without the private view key (ADR-0006). It cannot spend, but a compromised server leaks the Streamer's full history of incoming Monero payments.
