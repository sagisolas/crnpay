# crnpay

Self-hosted crypto donations for one Streamer. Donors pick a Token, enter an amount, a message and an optional Nickname, then pay straight into the Streamer's own wallet using the Payment instructions shown (QR code, address, exact amount). Once the Payment is Confirmed, an Alert appears on the Alert page, which the Streamer adds to OBS as a browser source.

The service never holds a private key: it knows only public addresses and extended public keys, and watches the chain for incoming Payments.

- Vocabulary: [GLOSSARY.md](GLOSSARY.md)
- Domain rules: [docs/domain/](docs/domain/)
- Technical decisions: [docs/adr/](docs/adr/)

## Status

Scaffold only. The server validates its environment and config and serves `/health`. The donation page, Alert page, storage, matching and chain adapters are not built yet.

## Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) on Node.js 26 |
| HTTP and HTML | [Hono](https://hono.dev) with server-rendered JSX, Server-Sent Events for Alerts |
| Validation | [zod](https://zod.dev) for env, config, request bodies and provider responses |
| Storage | SQLite through better-sqlite3 with plain SQL (planned) |
| Logging | [pino](https://getpino.io), JSON lines, secrets redacted, query strings never logged |
| Browser scripts | Plain TypeScript bundled by esbuild |
| Tests and lint | Vitest, ESLint with typescript-eslint `strict-type-checked` |
| Deployment | One Docker container behind Caddy (automatic HTTPS) |

Token amounts are always `bigint` in the Token's base units. Decimal strings are converted with `parseAmount` in `src/server/amount.ts`, and lint rejects `parseFloat`, `parseInt` and `Number()`.

## Running locally

Requires Node.js 26 and pnpm 11.

```bash
pnpm install
cp .env.example .env
cp config.example.json config.json
```

Set `ALERT_KEY` in `.env` to the output of `openssl rand -hex 32`, then:

```bash
pnpm dev
```

| Script | What it does |
|---|---|
| `pnpm dev` | Runs the server with reload and pretty logs |
| `pnpm build` | Compiles the server to `dist/server` and bundles browser scripts to `dist/public` |
| `pnpm start` | Runs the compiled server |
| `pnpm test` | Runs the tests (colocated as `*.test.ts`) |
| `pnpm lint` | Runs ESLint |
| `pnpm typecheck` | Type-checks server and browser code |

## Configuration

Secrets and paths come from the environment (see `.env.example`). Tokens come from the JSON file at `CONFIG_PATH` (see `config.example.json`). The server refuses to start if either is invalid.

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

```bash
DOMAIN=donate.example.com docker compose up -d --build
```

`compose.yaml` runs the app with a read-only filesystem, mounts `config.json` read-only (ADR-0004), keeps SQLite in the `data` volume and puts Caddy in front for HTTPS.
