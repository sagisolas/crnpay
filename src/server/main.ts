import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { createApp } from "./app.js";
import { systemClock } from "./platform/clock.js";
import { loadConfig } from "./platform/config.js";
import { parseEnv } from "./platform/env.js";
import { createLogger } from "./platform/logger.js";
import { createIntervalScheduler } from "./platform/scheduler.js";
import { openDatabase } from "./platform/storage.js";

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const config = await loadConfig(env.CONFIG_PATH);
  mkdirSync(dirname(env.DB_PATH), { recursive: true });
  const db = openDatabase(env.DB_PATH);
  const scheduler = createIntervalScheduler();
  const app = createApp({
    logger,
    config,
    db,
    clock: systemClock,
    alertKey: env.ALERT_KEY,
    scheduler,
    adapters: {},
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
