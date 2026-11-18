import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import type { Logger } from "pino";
import { z } from "zod";
import { createApp } from "./app.js";
import type { ChainAdapters } from "./payments/chain-adapter.js";
import { createEvmAdapter } from "./payments/evm-adapter.js";
import { systemClock } from "./platform/clock.js";
import { loadConfig, type Config } from "./platform/config.js";
import { parseEnv } from "./platform/env.js";
import { createLogger } from "./platform/logger.js";
import { createIntervalScheduler } from "./platform/scheduler.js";
import { openDatabase } from "./platform/storage.js";

function buildAdapters(
  tokens: Config["tokens"],
  etherscanApiKey: string | undefined,
  logger: Logger,
): ChainAdapters {
  const adapters: ChainAdapters = {};
  if (tokens.some((token) => token.chain === "evm")) {
    if (!etherscanApiKey) {
      throw new Error("ETHERSCAN_API_KEY is required when EVM tokens are configured");
    }
    adapters.evm = createEvmAdapter({ apiKey: etherscanApiKey, logger });
  }
  return adapters;
}

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const config = await loadConfig(env.CONFIG_PATH, env.DEFAULT_CONFIG_PATH);
  mkdirSync(dirname(env.DB_PATH), { recursive: true });
  const db = openDatabase(env.DB_PATH);
  const scheduler = createIntervalScheduler();
  const adapters = buildAdapters(config.tokens, env.ETHERSCAN_API_KEY, logger);
  const app = createApp({
    logger,
    config,
    db,
    clock: systemClock,
    alertKey: env.ALERT_KEY,
    scheduler,
    adapters,
  });

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { port: info.port, tokens: config.tokens.map((token) => token.id) },
      "server started",
    );
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void scheduler.stopAll().then(() => {
        db.close();
        process.exit(0);
      });
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  const logger = createLogger("fatal");
  if (error instanceof z.ZodError) {
    logger.fatal({ issues: z.prettifyError(error) }, "invalid environment or config");
  } else {
    logger.fatal({ err: error }, "startup failed");
  }
  process.exit(1);
});
