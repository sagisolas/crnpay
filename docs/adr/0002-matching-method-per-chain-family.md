# Matching method is chosen per chain family

A Payment is matched to its Donation in one of two ways, depending on the chain family. UTXO chains (Bitcoin and similar) give each Donation its own address, derived from the Streamer's extended public key; an address from an expired, never-paid Donation is reused so the Streamer's wallet never hits its gap limit. Account-based chains (EVM, Solana, Tron) use one Streamer address per network and give each Donation a unique exact amount, because per-Donation addresses there would scatter tokens across addresses that each need gas to sweep.

## Considered options

Connecting a browser wallet and verifying by transaction hash was rejected: it excludes exchange and QR donors, and needs a signature step to stop someone attaching their message to a stranger's transfer.

The resulting matching rules for Donors are in `docs/domain/donations.md`.
