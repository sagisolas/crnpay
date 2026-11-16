import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import { z } from "zod";
import { formatAmount } from "../shared/amount.js";
import type { PaymentInstructions } from "../shared/donation-api.js";
import { en } from "../shared/locale.js";
import type { Clock } from "./clock.js";
import type { Config, UniqueAmountToken } from "./config.js";
import { createDonations, DEFAULT_TAIL_STEPS } from "./donations.js";
import { tokenIcon } from "./icons.js";
import { qrDataUrl } from "./qr.js";
import type { Db } from "./storage.js";
import { DonatePage, type DonateToken } from "./ui/donate-page.js";

const MAX_BODY_BYTES = 16 * 1024;

const createDonationBody = z.object({
  tokenId: z.string().max(64),
  amount: z.string().max(64),
  message: z.string().max(4000),
  nickname: z.string().max(400).default(""),
});

interface AppDeps {
  logger: Logger;
  config: Config;
  db: Db;
  clock: Clock;
  tailSteps?: number;
}

export function createApp({ logger, config, db, clock, tailSteps = DEFAULT_TAIL_STEPS }: AppDeps) {
  const app = new Hono();
  const donations = createDonations({ db, clock, logger, tailSteps });
  const donatableTokens = new Map(
    config.tokens
      .filter((token): token is UniqueAmountToken => token.matching === "uniqueAmount")
      .map((token) => [token.id, token]),
  );
  const pageTokens: DonateToken[] = [...donatableTokens.values()].map((token) => ({
    id: token.id,
    symbol: token.symbol,
    networkName: token.networkName,
    decimals: token.decimals,
    minimum: formatAmount(token.minimum, token.decimals),
    icon: tokenIcon(token.symbol),
  }));

  app.use(async (c, next) => {
    const startedAt = performance.now();
    await next();
    logger.debug(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "request handled",
    );
  });
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "Payload too large" }, 413),
    }),
  );

  app.onError((error, c) => {
    logger.error({ err: error, path: c.req.path }, "unhandled error");
    return c.json({ error: "Internal error" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use(
    "/assets/*",
    serveStatic({
      root: "./dist/public",
      rewriteRequestPath: (path) => path.replace(/^\/assets/, ""),
    }),
  );

  app.get("/", (c) =>
    c.html(<DonatePage streamerName={config.streamerName} tokens={pageTokens} t={en} />),
  );

  app.post("/api/donations", async (c) => {
    const parsed = createDonationBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      logger.info({ reason: "invalid_request" }, "donation refused");
      return c.json({ error: "invalid_request" }, 400);
    }
    const { tokenId, ...input } = parsed.data;
    const token = donatableTokens.get(tokenId);
    if (!token) {
      logger.info({ reason: "unknown_token", tokenId }, "donation refused");
      return c.json({ error: "unknown_token" }, 422);
    }
    const result = donations.create(token, input);
    if (!result.ok && result.error === "validation") {
      logger.info({ reason: result.error, tokenId, fields: result.fields }, "donation refused");
      return c.json({ error: result.error, fields: result.fields }, 422);
    }
    if (!result.ok) {
      return c.json({ error: result.error }, 503);
    }
    const { donation } = result;
    const instructions: PaymentInstructions = {
      id: donation.id,
      symbol: token.symbol,
      networkName: token.networkName,
      address: donation.address,
      amount: formatAmount(donation.amount, token.decimals),
      qr: await qrDataUrl(donation.address),
      expiresAt: new Date(donation.expiresAt).toISOString(),
    };
    return c.json(instructions, 201);
  });

  return app;
}
