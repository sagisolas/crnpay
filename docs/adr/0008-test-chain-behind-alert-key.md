# Test chain behind the Alert key

To check the whole flow (Payment seen, Confirmed, Alert) without real money, the app has a built-in Test Token backed by an in-memory test chain. It is turned on per page by opening the donation page with `?key=<ALERT_KEY>`, not by an env flag or an admin page, so it works in production without a restart. Reusing the Alert key keeps one secret for the Streamer: whoever holds it can already control what appears on stream.

The test chain only ever pays the Test Token, never a configured Token, so a fake Payment cannot pass for real money in the log (its entries carry `tokenId: "test"`). It adds one confirmation per watcher tick and keeps unfinished test payments in memory only.

## Consequences

- Anyone with the Alert key can put a test Alert on stream through a Test Donation.
- Without the key, the Test Token does not exist: it is not listed, Donations for it are refused as an unknown Token, and the test payment endpoint answers 404.
- The id `test` is reserved and refused in the config.
