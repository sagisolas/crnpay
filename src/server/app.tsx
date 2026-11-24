import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";
import { z } from "zod";
import type { AlertEvent } from "../shared/alert.js";
import { formatAmount, readAmount } from "../shared/amount.js";
import type { PaymentInstructions } from "../shared/donation-api.js";
import { createAlerts } from "./alerts/alerts.js";
import type { ChainAdapters } from "./payments/chain-adapter.js";
import type { Clock } from "./platform/clock.js";
import type { Config, Token } from "./platform/config.js";
import {
  createDonations,
  DEFAULT_MAX_HELD_DONATIONS,
  DEFAULT_TAIL_STEPS,
} from "./donate/donations.js";
import { rememberedToken, rememberToken } from "./donate/token-cookie.js";
import { tokenIcon } from "./ui/icons.js";
import { qrDataUrl } from "./ui/qr.js";
import { keyMatches } from "./platform/secret-key.js";
import type { Scheduler } from "./platform/scheduler.js";
import { watchedAddresses, type Db } from "./platform/storage.js";
import { createTestChain, TEST_TOKEN } from "./payments/test-chain.js";
import { AlertPage } from "./ui/alert-page.js";
import { DonatePage, type DonateToken } from "./ui/donate-page.js";
import { createI18n, I18nProvider } from "./ui/i18n.js";
import { resolveLocale } from "./ui/locale.js";
import { watchToken } from "./payments/watcher.js";

const MAX_BODY_BYTES = 16 * 1024;
const PING_INTERVAL_MS = 25 * 1000;
const FORGET_INTERVAL_MS = 60 * 60 * 1000;
const sampleAlert = (token: Token): AlertEvent => ({
  id: "sample",
  icon: tokenIcon(token),
  nickname: "Test",
  amount: "1",
  symbol: token.symbol,
  message: "Test Alert",
});

const createDonationBody = z.object({
  tokenId: z.string().max(64),
  amount: z.string().max(64),
  message: z.string().max(4000),
  nickname: z.string().max(400),
});

interface AppDeps {
  logger: Logger;
  config: Config;
  db: Db;
  clock: Clock;
  alertKey: string;
  scheduler: Scheduler;
  adapters: ChainAdapters;
  tailSteps?: number;
  maxHeldDonations?: number;
}

const uuidSchema = z.uuid();

const testPaymentBody = z.object({ amount: z.string().max(64) });

function toPageToken(token: Token): DonateToken {
  return {
    id: token.id,
    symbol: token.symbol,
    networkName: token.networkName,
    decimals: token.decimals,
    minimum: formatAmount(token.minimum, token.decimals),
    icon: tokenIcon(token),
  };
}

export function createApp({
  logger,
  config,
  db,
  clock,
  alertKey,
  scheduler,
  adapters,
  tailSteps = DEFAULT_TAIL_STEPS,
  maxHeldDonations = DEFAULT_MAX_HELD_DONATIONS,
}: AppDeps) {
  const app = new Hono();
  type ConfigToken = Config["tokens"][number];
  const pollerFor = (token: ConfigToken) => {
    if (token.matching === "uniqueAmount") {
      const adapter = adapters[token.chain];
      return adapter && ((cursor: string | null) => adapter.incomingTransfers(token, cursor));
    }
    const adapter = adapters[token.chain];
    return (
      adapter &&
      ((cursor: string | null) =>
        adapter.incomingTransfers(token, watchedAddresses(db, token.id, clock.now()), cursor))
    );
  };
  const pollers = new Map(
    config.tokens.flatMap((token) => {
      const poll = pollerFor(token);
      if (poll) {
        return [[token.id, poll] as const];
      }
      logger.warn(
        { tokenId: token.id, chain: token.chain },
        token.matching === "uniqueAmount"
          ? "no chain adapter, payments not watched"
          : "no chain adapter, token cannot take donations",
      );
      return [];
    }),
  );
  const donatableTokens = new Map(
    config.tokens
      .filter((token) => token.matching === "uniqueAmount" || pollers.has(token.id))
      .map((token) => [token.id, token]),
  );
  const tokens = new Map<string, Token>([...donatableTokens, [TEST_TOKEN.id, TEST_TOKEN]]);
  const alerts = createAlerts({ db, clock, logger, tokens });
  const sample = sampleAlert(donatableTokens.values().next().value ?? TEST_TOKEN);
  const donations = createDonations({
    db,
    clock,
    logger,
    tailSteps,
    maxHeldDonations,
    tokens,
    adapters,
    onAlert: alerts.publish,
  });
  scheduler.every(FORGET_INTERVAL_MS, () => {
    donations.forgetNeverPaid();
    return Promise.resolve();
  });
  const testChain = createTestChain();
  watchToken(
    { db, logger, scheduler, recordTransfers: donations.recordTransfers },
    TEST_TOKEN,
    (cursor) => testChain.adapter.incomingTransfers(TEST_TOKEN, cursor),
  );
  const isKeyed = (key: string | undefined): boolean => keyMatches(key, alertKey);
  const tokenFor = (id: string, keyed: boolean): Token | undefined =>
    keyed && id === TEST_TOKEN.id ? TEST_TOKEN : donatableTokens.get(id);
  donatableTokens.forEach((token) => {
    const poll = pollers.get(token.id);
    if (poll) {
      watchToken(
        { db, logger, scheduler, recordTransfers: donations.recordTransfers },
        token,
        poll,
      );
    }
  });
  const pageTokens = [...donatableTokens.values()].map(toPageToken);
  const formTokens = (testMode: boolean): DonateToken[] =>
    testMode ? [...pageTokens, toPageToken(TEST_TOKEN)] : pageTokens;

  const paymentUri = (token: Token, address: string, amount: string): string =>
    token.chain === "bitcoin" ? `bitcoin:${address}?amount=${amount}` : address;

  const buildInstructions = async (
    token: Token,
    donation: {
      id: string;
      amount: bigint;
      declaredAmount: bigint;
      nickname: string;
      message: string;
      address: string;
      expiresAt: number;
    },
  ): Promise<PaymentInstructions> => {
    const amount = formatAmount(donation.amount, token.decimals);
    return {
      id: donation.id,
      symbol: token.symbol,
      networkName: token.networkName,
      address: donation.address,
      amount,
      declaredAmount: formatAmount(donation.declaredAmount, token.decimals),
      nickname: donation.nickname,
      message: donation.message,
      minimum: formatAmount(token.minimum, token.decimals),
      matching: token.matching,
      qr: await qrDataUrl(paymentUri(token, donation.address, amount), tokenIcon(token)),
      expiresAt: new Date(donation.expiresAt).toISOString(),
    };
  };

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

  app.get("/", (c) => {
    const testMode = isKeyed(c.req.query("key"));
    return c.html(
      <I18nProvider value={createI18n(resolveLocale(c))}>
        <DonatePage
          streamerName={config.streamerName}
          tokens={formTokens(testMode)}
          testMode={testMode}
          keyParam={c.req.query("key")}
          rememberedTokenId={rememberedToken(c)}
        />
      </I18nProvider>,
    );
  });

  app.get("/d/:id", async (c) => {
    const id = uuidSchema.safeParse(c.req.param("id"));
    const testMode = isKeyed(c.req.query("key"));
    const donation = id.success ? donations.find(id.data) : undefined;
    const token = donation && tokenFor(donation.tokenId, testMode);
    const status = donation && donations.status(donation.id);
    if (!donation || !token || !status) {
      return c.notFound();
    }
    const instructions = await buildInstructions(token, donation);
    return c.html(
      <I18nProvider value={createI18n(resolveLocale(c))}>
        <DonatePage
          streamerName={config.streamerName}
          tokens={formTokens(testMode)}
          testMode={testMode}
          pay={{ instructions, status, tokenId: token.id }}
          keyParam={c.req.query("key")}
        />
      </I18nProvider>,
    );
  });

  const requireKey: MiddlewareHandler = (c, next) =>
    isKeyed(c.req.query("key")) ? next() : Promise.resolve(c.notFound());
  app.use("/alerts", requireKey);
  app.use("/api/alerts/*", requireKey);

  app.get("/alerts", (c) =>
    c.html(
      <I18nProvider value={createI18n(resolveLocale(c))}>
        <AlertPage sample={c.req.query("test") === undefined ? null : sample} />
      </I18nProvider>,
    ),
  );

  app.get("/api/alerts/events", (c) =>
    streamSSE(c, async (stream) => {
      let writes = Promise.resolve();
      const enqueue = (write: () => Promise<unknown>): void => {
        writes = writes.then(write).then(() => undefined);
      };
      const disconnect = alerts.connect((alert) => {
        enqueue(() => stream.writeSSE({ event: "alert", data: JSON.stringify(alert) }));
      });
      const ping = setInterval(() => {
        enqueue(() => stream.write(": ping\n\n"));
      }, PING_INTERVAL_MS);
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
      clearInterval(ping);
      disconnect();
    }),
  );

  app.post("/api/alerts/:id/shown", (c) => {
    const id = uuidSchema.safeParse(c.req.param("id"));
    if (!id.success) {
      return c.notFound();
    }
    alerts.markShown(id.data);
    return c.body(null, 204);
  });

  app.post("/api/donations", async (c) => {
    const parsed = createDonationBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      logger.info({ reason: "invalid_request" }, "donation refused");
      return c.json({ error: "invalid_request" }, 400);
    }
    const { tokenId, ...input } = parsed.data;
    const token = tokenFor(tokenId, isKeyed(c.req.query("key")));
    if (!token) {
      logger.info({ reason: "unknown_token", tokenId }, "donation refused");
      return c.json({ error: "unknown_token" }, 422);
    }
    const result = await donations.create(token, input);
    if (!result.ok && result.error === "validation") {
      logger.info({ reason: result.error, tokenId, fields: result.fields }, "donation refused");
      return c.json({ error: result.error, fields: result.fields }, 422);
    }
    if (!result.ok) {
      return c.json({ error: result.error }, 503);
    }
    rememberToken(c, token.id);
    return c.json(await buildInstructions(token, result.donation), 201);
  });

  app.get("/api/donations/:id", (c) => {
    const id = uuidSchema.safeParse(c.req.param("id"));
    const status = id.success ? donations.status(id.data) : undefined;
    if (!status) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(status);
  });

  app.post("/api/test-payments", async (c) => {
    if (!isKeyed(c.req.query("key"))) {
      return c.json({ error: "Not found" }, 404);
    }
    const parsed = testPaymentBody.safeParse(await c.req.json().catch(() => null));
    const amount = parsed.success ? readAmount(parsed.data.amount, TEST_TOKEN.decimals) : null;
    if (typeof amount !== "bigint" || amount <= 0n) {
      return c.json({ error: "invalid_request" }, 400);
    }
    testChain.send(amount);
    logger.info({ amount: formatAmount(amount, TEST_TOKEN.decimals) }, "test payment sent");
    return c.json({ status: "sent" }, 202);
  });

  return app;
}
