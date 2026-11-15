import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { Logger } from "pino";

const MAX_BODY_BYTES = 16 * 1024;

export function createApp(logger: Logger) {
  const app = new Hono();

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

  return app;
}
