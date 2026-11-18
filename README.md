# crnpay

Self-hosted crypto donations for one Streamer. Donors pick a Token, enter an amount, a message and an optional Nickname, then pay straight into the Streamer's own wallet using the Payment instructions shown (QR code, address, exact amount). Once the Payment is Confirmed, an Alert appears on the Alert page, which the Streamer adds to OBS as a browser source.

The service never holds a private key: it knows only public addresses and extended public keys, and watches the chain for incoming Payments.

- Vocabulary: [GLOSSARY.md](GLOSSARY.md)
- Domain rules: [docs/domain/](docs/domain/)
- Technical decisions: [docs/adr/](docs/adr/)

## Status

Scaffold only. The server validates its environment and config and serves `/health`. The donation page, Alert page, storage, matching and chain adapters are not built yet.

## Tech stack

| Concern         | Choice                                                                               |
| --------------- | ------------------------------------------------------------------------------------ |
| Language        | TypeScript (strict) on Node.js 26                                                    |
| HTTP and HTML   | [Hono](https://hono.dev) with server-rendered JSX, Server-Sent Events for Alerts     |
| Validation      | [zod](https://zod.dev) for env, config, request bodies and provider responses        |
| Storage         | SQLite through better-sqlite3 with plain SQL (planned)                               |
| Logging         | [pino](https://getpino.io), JSON lines, secrets redacted, query strings never logged |
| Browser scripts | Plain TypeScript bundled by esbuild                                                  |
| Tests and lint  | Vitest, ESLint with typescript-eslint `strict-type-checked`                          |
| Deployment      | One Docker container behind Caddy (automatic HTTPS)                                  |

Token amounts are always `bigint` in the Token's base units. Decimal strings are converted with `parseAmount` in `src/server/amount.ts`, and lint rejects `parseFloat`, `parseInt` and `Number()`.

## Running locally

Requires Node.js 26 and pnpm 11.

```bash
pnpm install
cp .env.example .env
```

Create a `config.json` with your streamer name and the Tokens you accept. You only list the Tokens you want (by `id`) and the fields specific to your deployment — the receiving `address` (or `xpub` for Bitcoin); everything else is inherited from `config.default.json`:

```json
{
  "streamerName": "Your name",
  "tokens": [
    { "id": "eth", "address": "0xYourEthAddress" },
    { "id": "usdt-tron", "address": "TYourTronAddress" }
  ]
}
```

Set `ALERT_KEY` in `.env` to the output of `openssl rand -hex 32`, then:

```bash
pnpm dev
```

| Script           | What it does                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`       | Runs the server with reload and pretty logs                                       |
| `pnpm build`     | Compiles the server to `dist/server` and bundles browser scripts to `dist/public` |
| `pnpm start`     | Runs the compiled server                                                          |
| `pnpm test`      | Runs the tests (colocated as `*.test.ts`)                                         |
| `pnpm lint`      | Runs ESLint                                                                       |
| `pnpm typecheck` | Type-checks server and browser code                                               |
| `pnpm format`    | Formats all files with Prettier (run before committing)                           |

## Configuration

On shared-address chains (EVM, Tron) a Donation's expected amount is the entered amount plus a small uniqueness tail of up to 9999 steps of `amountTailStep`, so keep that step tiny: the largest tail a Donor can be asked for is `9999 × amountTailStep`, which should be worth at most a cent or two (e.g. `0.000001` for a 6-decimal stablecoin). A step that is too large visibly inflates the amount the Donor must send.

Secrets and paths come from the environment (see `.env.example`). Tokens are defined in two layers: `config.default.json` (committed) is a catalog of known Tokens with sensible defaults, and your config at `CONFIG_PATH` overrides it. The two are deep-merged by Token `id`: only the Tokens your config lists are active, and each inherits any field it doesn't set (symbol, decimals, chain id, contract, confirmations, minimum, tail step) from the default of the same `id`. `streamerName` falls back to the default when your config omits it. Set `DEFAULT_CONFIG_PATH` to point the catalog elsewhere. The server refuses to start if the merged config is invalid.

A Token entry looks like this:

```json
{
  "id": "usdt-tron",
  "symbol": "USDT",
  "network": "tron",
  "decimals": 6,
  "minimum": "1",
  "confirmations": 20,
  "matching": "uniqueAmount",
  "address": "T..."
}
```

`matching` is `uniqueAmount` (shared `address`, unique amount per Donation) or `uniqueAddress` (per-Donation addresses derived from `xpub`). See ADR-0002.

## Deployment

The Docker setup lives in `docker/`. Run it from there:

```bash
cd docker
DOMAIN=donate.example.com docker compose up -d --build
```

`docker/compose.yaml` runs the app with a read-only filesystem, mounts `config.json` read-only (ADR-0004), keeps SQLite in the `data` volume and puts Caddy in front for HTTPS.

Caddy also rate limits Donation creation: `POST /api/donations` is capped at 5 requests per client IP per 10 minutes, and over that Caddy answers 429 and the donation page shows a "try again later" message. All other routes are unlimited. The limit lives in Caddy, not the app (ADR-0005), so it needs the custom image built from `docker/Caddy.Dockerfile`, which adds the [`caddy-ratelimit`](https://github.com/mholt/caddy-ratelimit) plugin to stock Caddy. The `docker compose up --build` above builds it automatically. Running the app without this Caddy setup means running it without a rate limit.
