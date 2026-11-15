# 05: Unique-address matching and Bitcoin adapter

**What to build:** A Donor picks Bitcoin and gets a fresh address for their Donation, with a `bitcoin:` QR code that includes the amount. Any Payment of at least the minimum to that address Confirms the Donation and its Alert shows the amount that actually arrived. Addresses come from the Streamer's zpub; the service never holds a spending key. See ADR-0002, `docs/domain/donations.md` ("Matching rules") and the spec's "Chain adapter interface".

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Config accepts a Bitcoin Token with a zpub; invalid zpub stops startup; the zpub is redacted from logs
- [ ] Native SegWit (BIP84) addresses derived in-process and verified against the published BIP84 test vectors
- [ ] Each Donation gets its own address; a never-paid address from a Donation past its 24 h hold is reused before deriving a new one; an address that ever received funds is never reused
- [ ] Database enforces that no two held Donations of the same Token share an address
- [ ] First Payment of at least the minimum Confirms; smaller transfers and later transfers to the same address are logged as unmatched
- [ ] QR code carries a `bitcoin:` URI with the amount
- [ ] Adapter reads incoming transfers from a free provider (mempool.space or equivalent) with confirmations; responses validated with zod; malformed responses rejected
- [ ] Adapter tests use recorded provider responses with `fetch` stubbed
- [ ] HTTP app tests with the fake adapter cover address assignment, reuse, minimum rule and later transfers
