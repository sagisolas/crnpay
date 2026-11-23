# Alerts

- Every Confirmed Donation produces exactly one Alert. Nothing is shown before a Donation is Confirmed.
- Alerts play one at a time, oldest first, for 8 seconds each, without sound.
- An Alert shows the Nickname (or "Аноним"), the amount with its Token, and the message. The amount is the one the Donor entered on the donation page, or the amount actually paid when less arrived.
- The Alert page has no text of its own: everything on it comes from the Donation, except "Аноним" when there is no Nickname.
- When the Alert page opens, it plays every Alert not yet shown, except those Confirmed more than 1 hour ago, which are never shown.
- An Alert counts as shown once any open Alert page has displayed it.
- The Alert page looks the same for every Streamer in v1; nothing about it is configurable.
- A test link shows a sample Alert so the Streamer can position the page in OBS.
- The Alert page is reached by a secret link. Anyone holding the link can watch Alerts but cannot change anything.
