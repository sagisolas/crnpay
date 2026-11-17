# Donations

## What a Donor can give

- Donors choose from a fixed list of Tokens set by the Streamer. Only the exact asset on the exact network of a listed Token counts.
- Amounts are entered and shown in the Token's own units. There is no fiat conversion.
- Each Token has a minimum amount, and smaller Donations are refused.
- A Donation carries a Token, an amount, a message and an optional Nickname. The message is 1–300 characters and the Nickname at most 32, both plain text, trimmed, with control characters removed.
- One Donor can create at most 5 Donations per 10 minutes, counted per IP address (ADR-0005).

## Donation page

- The page is available in English and Russian. It starts in the browser's preferred language, falls back to English, and offers a switch that is remembered.
- The page heading shows the Streamer's name.

## Payment instructions

After submitting, the Donor sees the address as a QR code with a copy button and the exact amount with a copy button. The QR code carries the amount where wallets read it reliably (Bitcoin, Monero); elsewhere it carries the address alone.

Depending on the Token's network, either the address is unique to the Donation (Bitcoin, Monero), or the address is shared and the amount is made unique by a small tail (EVM, Tron). See ADR-0002.

The tail is 1 to 9999 steps of a per-Token step size, chosen so the tail is worth at most cents. When every tail of a Token is held by another Donation, that Token refuses new Donations with "try again later".

## Lifecycle

1. **Waiting for payment**: up to 60 minutes after submission.
2. **Payment seen**: a matching transfer is on chain but not yet final.
3. **Confirmed**: the Payment has reached the confirmation count set for its network.

A Donation still waiting after 60 minutes is **Expired**, but a Payment that arrives within the following 24 hours still matches it and still leads to an Alert.

The payment screen shows each state to the Donor:

- Waiting: the Payment instructions and a waiting indicator.
- Payment seen: "Payment seen, waiting for confirmation".
- Confirmed: "Thank you, your Donation is confirmed".
- Expired: "This Donation expired. If you already paid, it will still be matched for 24 hours".

The payment screen is not saved anywhere; closing it loses it.

## Matching rules

- **Shared address, unique amount**: only a transfer of exactly the expected amount matches. Anything more or less matches no Donation: the money stays with the Streamer and no Alert is shown.
- A transfer is matched once, when the service first sees it. A transfer that matched nothing never matches a Donation created later.
- **Unique address**: the first Payment of at least the Token's minimum confirms the Donation, and its Alert shows the amount that actually arrived. Smaller transfers and any later transfers to that address lead to no Alert.

## Test Token

The Streamer can try the whole flow without money. Opening the donation page with the Alert key adds a **Test Token** on a Test network. Its Donations follow the same Lifecycle and Matching rules and lead to a real Alert. On its payment screen the Streamer sends a test payment of any amount; it gains one confirmation every 15 seconds and needs 2. Without the key the Test Token does not exist. See ADR-0008.

## Streamer's record

There is no Donation history page. Each Confirmed Donation is written to the service log with its Token, amount, Nickname and message.
