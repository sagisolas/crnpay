# crnpay

Crypto donations for a single Streamer: Donors pay straight into the Streamer's own wallets, and each confirmed Donation is announced on stream.

## Language

**Streamer**:
The one person this service collects Donations for, and the owner of the receiving wallets.
_Avoid_: creator, owner, merchant, user

**Donor**:
A viewer who sends a Donation.
_Avoid_: payer, customer, user

**Donation**:
What a Donor submits on the donation page: a Token, an amount, a message and a Nickname. It exists before any money moves.
_Avoid_: order, invoice, tip

**Token**:
One asset on one specific network that a Donor can pick; native coins such as ETH and SOL are Tokens too. The same asset on two networks is two Tokens.
_Avoid_: coin, currency, payment option

**Nickname**:
The name shown with a Donation. A Donor who leaves it empty gets "Anonymous" or "Аноним", by the language of the donation page.
_Avoid_: username, display name

**Payment instructions**:
The address and exact amount shown to a Donor after submitting a Donation.
_Avoid_: invoice, checkout, payment request

**Payment**:
An on-chain transfer that has been matched to a Donation.
_Avoid_: transaction, deposit

**Confirmed**:
The state of a Donation whose Payment is final on its network.
_Avoid_: paid, completed, settled

**Alert**:
The on-stream announcement of a Confirmed Donation.
_Avoid_: notification, popup

**Test Token**:
A built-in Token on a fake network, available only with the Alert key, for the Streamer to try Donations and Alerts without money.
_Avoid_: demo coin, sandbox

**Alert page**:
The page the Streamer adds to OBS as a browser source, where Alerts are shown.
_Avoid_: overlay, widget
