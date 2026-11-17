import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parseAmount } from "../shared/amount.js";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case");

const tokenFields = {
  id: slug,
  symbol: z.string().min(1).max(16),
  network: slug,
  networkName: z.string().trim().min(1).max(32),
  decimals: z.number().int().min(0).max(36),
  minimum: z.string(),
  confirmations: z.number().int().min(1),
};

const uniqueAmountFields = {
  ...tokenFields,
  address: z.string().min(1),
  amountTailStep: z.string(),
};

const tokenSchema = z
  .discriminatedUnion("chain", [
    z.strictObject({ ...uniqueAmountFields, chain: z.literal("evm") }),
    z.strictObject({ ...uniqueAmountFields, chain: z.literal("tron") }),
    z.strictObject({ ...tokenFields, chain: z.literal("bitcoin"), xpub: z.string().min(1) }),
    z.strictObject({ ...tokenFields, chain: z.literal("monero") }),
  ])
  .transform((token, ctx) => {
    const toUnits = (field: "minimum" | "amountTailStep", value: string): bigint => {
      try {
        const units = parseAmount(value, token.decimals);
        if (units > 0n) {
          return units;
        }
        ctx.issues.push({
          code: "custom",
          path: [field],
          message: "must be greater than zero",
          input: value,
        });
      } catch (error) {
        ctx.issues.push({
          code: "custom",
          path: [field],
          message: error instanceof Error ? error.message : "invalid amount",
          input: value,
        });
      }
      return 0n;
    };

    const minimum = toUnits("minimum", token.minimum);
    if (token.chain === "evm" || token.chain === "tron") {
      const amountTailStep = toUnits("amountTailStep", token.amountTailStep);
      return { ...token, minimum, amountTailStep, matching: "uniqueAmount" as const };
    }
    return { ...token, minimum, matching: "uniqueAddress" as const };
  });

const configSchema = z
  .strictObject({
    streamerName: z.string().trim().min(1).max(64),
    tokens: z.array(tokenSchema),
  })
  .refine(({ tokens }) => new Set(tokens.map((token) => token.id)).size === tokens.length, {
    message: "token ids must be unique",
    path: ["tokens"],
  })
  .refine(({ tokens }) => tokens.every((token) => token.id !== "test"), {
    message: 'token id "test" is reserved for the Test Token',
    path: ["tokens"],
  });

export type Config = z.infer<typeof configSchema>;
type ConfigToken = Config["tokens"][number];
type ConfigUniqueAmountToken = Extract<ConfigToken, { matching: "uniqueAmount" }>;
export type TestToken = Omit<ConfigUniqueAmountToken, "chain"> & { chain: "test" };
export type Token = ConfigToken | TestToken;
export type UniqueAmountToken = ConfigUniqueAmountToken | TestToken;
export type ConfigChain = ConfigToken["chain"];

export function parseConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}

export async function loadConfig(path: string): Promise<Config> {
  const text = await readFile(path, "utf8");
  return parseConfig(JSON.parse(text));
}
