# Payment QR

What the Payment instructions QR carries, and why it differs by network.

## What the QR carries

- **Bitcoin, Monero**: address and amount. These use a unique address per Donation, and their URI schemes (BIP-21, `monero:`) carry the amount in a form wallets read reliably.
- **EVM, Tron**: the address alone. The amount is made unique by a tail and matched on chain; it is not encoded in the QR. See ADR-0002.

## Why EVM QR omits the amount

EVM has no single QR format that carries amount and token the way BIP-21 does. The nearest standard, EIP-681, can encode both, but adoption is uneven and the token case is unsafe for simple scanners:

- **Native coin** (`ethereum:<to>@<chain>?value=<wei>`): a wallet that reads only the address still gets the right recipient, so it degrades safely. The amount is often ignored.
- **Token** (`ethereum:<contract>@<chain>/transfer?address=<to>&uint256=<units>`): the address right after `ethereum:` is the token contract, not the recipient. A wallet that reads only the address sends the token to the contract and the funds are stranded.

Token support is inconsistent across wallets (reliable in some, broken or address-only in others), and a wrong decode loses the Donor's money. Because the service already makes each EVM amount unique with a tail and matches it on chain, carrying the amount in the QR buys little and adds a real way to lose funds. So EVM and Tron QRs carry the address only.

A dApp-side flow (WalletConnect) would avoid the ambiguity by building the transfer itself, but that is a larger change and not how Payment instructions work today.
