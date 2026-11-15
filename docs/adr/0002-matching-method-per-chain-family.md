# Matching method is chosen per chain family

A Payment is matched to its Donation in one of two ways, depending on the chain family.

- **Unique address**: Bitcoin and Monero give each Donation its own address, derived from the Streamer's extended public key (Bitcoin) or created as a subaddress by a view-only wallet (Monero). An address from an expired, never-paid Donation is reused so the Streamer's wallet never hits its address lookahead limit.
- **Unique amount**: account-based chains (EVM, Tron) use one Streamer address per network and give each Donation a unique exact amount, because per-Donation addresses there would scatter tokens across addresses that each need gas to sweep.

## Considered options

Connecting a browser wallet and verifying by transaction hash was rejected: it excludes exchange and QR donors, and needs a signature step to stop someone attaching their message to a stranger's transfer.

The resulting matching rules for Donors are in `docs/domain/donations.md`.
