# 06: EVM adapter for ETH and ERC-20

**What to build:** A Donor can donate ETH or an ERC-20 token (for example USDT or USDC) on any EVM network listed in config, using the unique-amount Payment instructions, and the Donation Confirms after the configured confirmations. See the spec's "Chain adapter interface" and ADR-0003.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Config accepts EVM Tokens with chain id and, for ERC-20, the token contract address; native ETH has none; addresses validated as EVM addresses
- [ ] Adapter lists incoming native transfers (including internal transfers from contract wallets) and ERC-20 transfers to the Streamer's address via a free provider (Etherscan V2 free tier or equivalent; check network coverage)
- [ ] Only transfers from the configured contract count for an ERC-20 Token; same-named tokens from other contracts are ignored
- [ ] Confirmations computed from the current block number
- [ ] API key from the environment, validated at startup, never logged
- [ ] Provider responses validated with zod; malformed responses rejected
- [ ] Adapter tests use recorded provider responses with `fetch` stubbed
