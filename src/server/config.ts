import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parseAmount } from "./amount.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case");

const tokenFields = {
  id: slug,
  symbol: z.string().min(1).max(16),
  network: slug,
  decimals: z.number().int().min(0).max(36),
  minimum: z.string(),
  confirmations: z.number().int().min(1),
};

const tokenSchema = z
  .discriminatedUnion("matching", [
    z.strictObject({
      ...tokenFields,
      matching: z.literal("uniqueAmount"),
      address: z.string().min(1),
    }),
    z.strictObject({
      ...tokenFields,
      matching: z.literal("uniqueAddress"),
      xpub: z.string().min(1),
    }),
  ])
  .transform((token, ctx) => {
    try {
      const minimum = parseAmount(token.minimum, token.decimals);
      if (minimum > 0n) {
        return { ...token, minimum };
      }
      ctx.issues.push({
        code: "custom",
        path: ["minimum"],
        message: "must be greater than zero",
        input: token.minimum,
      });
    } catch (error) {
      ctx.issues.push({
        code: "custom",
        path: ["minimum"],
        message: error instanceof Error ? error.message : "invalid amount",
        input: token.minimum,
      });
    }
    return z.NEVER;
  });

const configSchema = z
  .strictObject({ tokens: z.array(tokenSchema) })
  .refine(({ tokens }) => new Set(tokens.map((token) => token.id)).size === tokens.length, {
    message: "token ids must be unique",
    path: ["tokens"],
  });

export type Config = z.infer<typeof configSchema>;
export type Token = Config["tokens"][number];

export function parseConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}

export async function loadConfig(path: string): Promise<Config> {
  const text = await readFile(path, "utf8");
  return parseConfig(JSON.parse(text));
}
