# 03: Alert page

**What to build:** The Streamer adds the Alert page to OBS via its secret link and sees each Confirmed Donation as an Alert: Nickname (or "Аноним"), amount with Token, and message, one at a time, oldest first, 8 seconds each, silent. Alerts missed while OBS was closed replay on open unless Confirmed more than 1 hour ago. A test link shows a sample Alert. See `docs/domain/alerts.md` and the spec's "Alert module".

**Design:** Follow `docs/design.md`; see the prototypes in `design/` for reference.

**Blocked by:** 02

**Status:** resolved

- [x] Alert page, event stream, shown acknowledgement and test Alert all require the secret key from the query string, compared in constant time; a wrong or missing key gets 404
- [x] Exactly one Alert per Confirmed Donation, enforced by the database
- [x] Event stream delivers new Alerts live over Server-Sent Events and reconnects by itself after a drop
- [x] Page queues Alerts and plays them one at a time, oldest first, for 8 seconds each, without sound
- [x] Page reports each Alert as shown after displaying it; a shown Alert is not sent again to any page
- [x] On connect, unshown Alerts Confirmed within the last hour replay; older ones are never shown
- [x] All page content comes from the Donation, except "Аноним" for a missing Nickname; Nickname and message rendered as text, never HTML
- [x] Test link shows a sample Alert without creating any Donation
- [x] Alert shown is logged at info; the secret key never appears in logs
- [x] Tests through the HTTP app cover key check, live delivery, acknowledgement, replay, the 1 h limit and two pages connected at once
