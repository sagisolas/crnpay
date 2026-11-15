import { serve } from "@hono/node-server";
import { z } from "zod";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";

async function main(): Promise<void> {
  const env = parseEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const config = await loadConfig(env.CONFIG_PATH);
  const app = createApp(logger);

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { port: info.port, tokens: config.tokens.map((token) => token.id) },
      "server started",
    );
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
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
