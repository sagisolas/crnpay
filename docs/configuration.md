# Configuring an instance

This guide is for the admin setting up a new crnpay instance for a Streamer. It covers the environment variables and the config file. Deployment is covered in the [README](../README.md#deployment).

An instance is configured in two places:

- **Environment variables** hold secrets, paths and runtime settings.
- **The config file** (`config.json`) holds the Streamer's name and the Tokens they accept, with their receiving addresses.

The server checks both on startup. If anything is invalid it logs `invalid environment or config` with the list of problems and exits, so a misconfigured instance never starts half-working.

## Environment variables

Copy `.env.example` to `.env` and fill it in.

| Variable              | Required                          | Default                 | Description                                                                                                         |
| --------------------- | --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ALERT_KEY`           | Yes                               | none                    | Secret that unlocks the Alert page and test mode. Must be exactly 64 lowercase hex characters.                      |
| `ETHERSCAN_API_KEY`   | When any EVM Token is configured  | none                    | Etherscan API V2 key. One free key from [etherscan.io/apis](https://etherscan.io/apis) works across all EVM chains. |
| `TRONGRID_API_KEY`    | When any Tron Token is configured | none                    | TronGrid API key, free from [trongrid.io](https://www.trongrid.io).                                                 |
| `PORT`                | No                                | `3000`                  | HTTP port the server listens on.                                                                                    |
| `CONFIG_PATH`         | No                                | `./config.json`         | Path to the instance config file.                                                                                   |
| `DEFAULT_CONFIG_PATH` | No                                | `./config.default.json` | Path to the Token catalog the config inherits from. Rarely changed.                                                 |
| `DB_PATH`             | No                                | `./data/crnpay.db`      | Path to the SQLite database. The parent directory is created if missing.                                            |
| `LOG_LEVEL`           | No                                | `info`                  | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`.                                                          |

Generate the Alert key with:

```bash
openssl rand -hex 32
```

Treat `ALERT_KEY` like a password: anyone who has it can open the Alert page and put test Alerts on stream. To rotate it, change the value and restart, then give the Streamer the new Alert page link. Bitcoin Tokens need no API key; they use the public mempool.space API.

## Config file

The config file lists only what is specific to this instance. Everything else is inherited from the Token catalog in `config.default.json`.

### Minimal example

```json
{
  "streamerName": "Your name",
  "tokens": [
    { "id": "usdt-tron", "address": "TYourTronAddress" },
    { "id": "eth", "address": "0xYourEthAddress" },
    { "id": "usdt-eth", "address": "0xYourEthAddress" },
    { "id": "btc", "zpub": "zpub6r..." }
  ]
}
```

### Top-level fields

| Field          | Required | Description                                                                                                  |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `streamerName` | No       | Name shown on the donation page, 1 to 64 characters. Falls back to the catalog value, so always set it.      |
| `tokens`       | Yes      | The Tokens Donors can pay with. Only the Tokens listed here are active. Order here is the order on the page. |

No other top-level fields are allowed.

### How merging works

Each entry in `tokens` is matched to the catalog entry with the same `id`. Fields you set override the catalog, and fields you leave out are inherited. A catalog Token you don't list is not active.

For example, `{ "id": "eth", "address": "0x...", "minimum": "0.01" }` accepts ETH on Ethereum with your address and a higher minimum, keeping the catalog's decimals, chain id and confirmation count.

An entry whose `id` is not in the catalog is a new Token and must set every required field itself (see [Adding a Token not in the catalog](#adding-a-token-not-in-the-catalog)).

### Catalog Tokens

These are ready to use from `config.default.json`. You only add the receiving address or key.

| `id`        | Token            | You must set             | Minimum | Confirmations |
| ----------- | ---------------- | ------------------------ | ------- | ------------- |
| `usdt-tron` | USDT on Tron     | `address` (Tron, `T...`) | 1       | 20            |
| `eth`       | ETH              | `address` (EVM, `0x...`) | 0.002   | 12            |
| `usdt-eth`  | USDT on Ethereum | `address` (EVM, `0x...`) | 1       | 12            |
| `btc`       | Bitcoin          | `zpub`                   | 0.0001  | 2             |

The catalog addresses are placeholder zero addresses. The server refuses to start if an EVM or Tron Token still has the zero address, so you can't accidentally go live with it.

### Token fields

Fields every Token has:

| Field           | Description                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Unique id, lowercase kebab-case (`usdt-tron`). The id `test` is reserved.                                                                |
| `symbol`        | Ticker shown to Donors, 1 to 16 characters (`USDT`).                                                                                     |
| `network`       | Network id, lowercase kebab-case (`ethereum`). Picks the network icon; known values are `ethereum`, `tron`, `bitcoin`, `polygon`, `bsc`. |
| `networkName`   | Network name shown to Donors, 1 to 32 characters (`Ethereum`).                                                                           |
| `chain`         | Chain family: `evm`, `tron` or `bitcoin`. Decides how Payments are detected and which other fields apply.                                |
| `decimals`      | The Token's on-chain decimals, 0 to 36. Must match the token exactly, or amounts will be wrong.                                          |
| `minimum`       | Smallest Donation, as a decimal string (`"1"`, `"0.002"`). Must be greater than zero.                                                    |
| `confirmations` | Confirmations a Payment needs before it counts as Confirmed and its Alert is shown. At least 1.                                          |

Amounts are always strings, never JSON numbers, so they are read exactly.

#### EVM Tokens (`"chain": "evm"`)

| Field            | Required | Description                                                                                                    |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `address`        | Yes      | Receiving address, `0x` plus 40 hex characters. Shared by all Donations.                                       |
| `chainId`        | Yes      | EVM chain id (`1` for Ethereum, `137` for Polygon, `56` for BNB Chain). Must be supported by Etherscan API V2. |
| `contract`       | No       | ERC-20 contract address. Leave it out for the chain's native coin (ETH, POL, BNB).                             |
| `amountTailStep` | Yes      | Step of the uniqueness tail added to each Donation's amount (see below).                                       |

Requires `ETHERSCAN_API_KEY`.

#### Tron Tokens (`"chain": "tron"`)

| Field            | Required | Description                                                                               |
| ---------------- | -------- | ----------------------------------------------------------------------------------------- |
| `address`        | Yes      | Receiving address, base58 Tron address starting with `T`. Shared by all Donations.        |
| `contract`       | Yes      | TRC-20 contract address. Only transfers of this token count. Native TRX is not supported. |
| `amountTailStep` | Yes      | Step of the uniqueness tail added to each Donation's amount (see below).                  |

Requires `TRONGRID_API_KEY`.

#### Bitcoin Tokens (`"chain": "bitcoin"`)

| Field  | Required | Description                                                                                                             |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `zpub` | Yes      | Account-level native SegWit (BIP84) extended public key from the Streamer's wallet. Each Donation gets its own address. |

Never put a `zprv` (private key) here; the server refuses it. The `zpub` is redacted in logs.

Use a dedicated wallet account for donations. The server checks each address is unused before handing it out, but sharing the account with other spending makes Donations harder to tell apart for the Streamer.

#### Monero

The config accepts `"chain": "monero"`, but Monero support is not built yet. A Monero Token is ignored and does not appear on the donation page.

### Choosing `amountTailStep`

EVM and Tron Tokens share one receiving address, so each Donation is told to send a slightly different amount: the entered amount plus a tail of up to 9999 × `amountTailStep`. That tail is how a Payment is matched to its Donation.

Keep the step tiny. The largest tail, 9999 × `amountTailStep`, should be worth at most a cent or two:

| Token                | Suggested step | Largest tail |
| -------------------- | -------------- | ------------ |
| 6-decimal stablecoin | `0.000001`     | ~0.01 USDT   |
| ETH                  | `0.000000001`  | ~0.00001 ETH |

The step must be at least one base unit of the Token (it can't have more decimal places than `decimals`). A step that is too large visibly inflates what Donors pay.

### Adding a Token not in the catalog

List every field yourself. For example, USDC on Polygon:

```json
{
  "id": "usdc-polygon",
  "symbol": "USDC",
  "network": "polygon",
  "networkName": "Polygon",
  "chain": "evm",
  "chainId": 137,
  "contract": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  "decimals": 6,
  "minimum": "1",
  "confirmations": 128,
  "address": "0xYourAddress",
  "amountTailStep": "0.000001"
}
```

Before going live, check the contract address and `decimals` on a block explorer. A wrong contract means Payments are never seen; wrong decimals mean wrong amounts. Pick `confirmations` from the chain's finality: the more reorgs a chain has, the higher it should be.

## Validation rules

The server refuses to start if:

- `ALERT_KEY` is missing or not 64 lowercase hex characters.
- An EVM Token is configured without `ETHERSCAN_API_KEY`, or a Tron Token without `TRONGRID_API_KEY`.
- A config file is missing or not valid JSON.
- A Token has an unknown field, a missing required field, or a field that doesn't fit its chain (for example `zpub` on an EVM Token).
- Two Tokens share an `id`, or a Token uses the reserved id `test`.
- An address is malformed, or an EVM or Tron address is the zero address.
- `minimum` or `amountTailStep` is zero, negative, or has more decimal places than `decimals`.
- A `zpub` is not a valid BIP84 account key.

## Links for the Streamer

Once the instance is running, give the Streamer these links (replace the domain and key):

| Link                                                     | Purpose                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `https://donate.example.com/`                            | Public donation page to share with Donors.                                                                     |
| `https://donate.example.com/alerts?key=<ALERT_KEY>`      | Alert page, added to OBS as a browser source. Keep it private.                                                 |
| `https://donate.example.com/alerts?key=<ALERT_KEY>&test` | Alert page with a sample Alert, to position and size it in OBS.                                                |
| `https://donate.example.com/?key=<ALERT_KEY>`            | Donation page in test mode: adds a Test Token that pays without real money, to check the full flow end to end. |

Test Donations are paid by a built-in test chain and only ever use the Test Token, so they never count as real Payments (ADR-0008).

## Checking the instance

1. Start the server and check the log shows `server started` with the expected Token ids.
2. Open `/health`; it answers `{"status":"ok"}`.
3. Open the donation page and check every Token, address and minimum.
4. Make a Test Donation through the test mode link and watch its Alert appear on the Alert page.
5. Ideally, make one small real Donation per chain to confirm the addresses and API keys work.

The config is read only at startup, so restart the server after changing it.
