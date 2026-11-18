import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ALERT_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex characters (openssl rand -hex 32)"),
  ETHERSCAN_API_KEY: z.string().min(1).optional(),
  CONFIG_PATH: z.string().min(1).default("./config.json"),
  DEFAULT_CONFIG_PATH: z.string().min(1).default("./config.default.json"),
  DB_PATH: z.string().min(1).default("./data/crnpay.db"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}
