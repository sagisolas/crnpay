# Donations

## What a Donor can give

- Donors choose from a fixed list of Tokens set by the Streamer. Only the exact asset on the exact network of a listed Token counts.
- Amounts are entered and shown in the Token's own units. There is no fiat conversion.
- Each Token has a minimum amount, and smaller Donations are refused. The number of Donations one Donor can create in a short time is limited.
- A Donation carries a Token, an amount, a message of at most 300 characters and an optional Nickname.

## Payment instructions

After submitting, the Donor sees the address as a QR code with a copy button and the exact amount with a copy button. The QR code carries the amount only where wallets read it reliably (Bitcoin, Solana); elsewhere it carries the address alone.

Depending on the Token's network, either the address is unique to the Donation, or the address is shared and the amount is made unique by a small tail (25.000137 instead of 25). See ADR-0002.

## Lifecycle

1. **Waiting for payment**: up to 60 minutes after submission.
2. **Payment seen**: a matching transfer is on chain but not yet final.
3. **Confirmed**: the Payment has reached the confirmation count set for its network.

A Donation still waiting after 60 minutes expires, but a Payment that arrives within the following 24 hours still matches it and still leads to an Alert.

## Matching rules

- **Shared address, unique amount**: only a transfer of exactly the expected amount matches. Anything more or less matches no Donation: the money stays with the Streamer and no Alert is shown.
- **Unique address**: the first Payment of at least the Token's minimum confirms the Donation, and its Alert shows the amount that actually arrived. Smaller transfers and any later transfers to that address lead to no Alert.
