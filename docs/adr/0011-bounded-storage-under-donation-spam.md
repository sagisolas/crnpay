# Storage is bounded by forgetting and capping unpaid Donations

Creating a Donation costs the requester nothing, and the per-IP rate limit (ADR-0005) does not stop an attacker with many IPs. To keep such spam from filling the disk, the app does two things:

- **Forget**: once an hour it deletes every Donation that has no transfer and whose hold has ended. Without a hold a Donation can no longer be matched, so nothing that could still be paid is lost.
- **Cap**: a Token on a shared address refuses new Donations while it holds 100,000. Unique-address Tokens are already capped at 20 by the wallet gap limit.

A Donation with the longest message takes about 2.1 KB, so each shared-address Token peaks at roughly 0.25 GB (100,000 held plus up to an hour of forgotten-but-not-yet-deleted rows).

## Considered options

Forgetting alone was rejected: it bounds rows to about 26 hours of creations, which a server saturated with requests turns into roughly 100 GB once per-request work stops growing with the number of holds. A CAPTCHA or proof of work was rejected because it adds friction for every Donor, and a CAPTCHA needs a third-party service.

## Consequences

- An attacker who keeps 100,000 Donations held, about 130 rotating IPs per Token at the current rate limit, blocks that Token's Donations for as long as they keep going.
- A forgotten Donation's link answers Not Found instead of Expired.
- Unmatched transfers are still stored indefinitely. Each costs the sender a network fee, so they are not bounded here.
